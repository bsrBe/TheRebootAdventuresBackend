import { Admin, AdminRole, AdminStatus, IAdmin } from '../models/admin.model';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sendEmail } from './email.service';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '1d';
const INVITATION_EXPIRES_IN = 24 * 60 * 60 * 1000; // 24 hours

export class AuthService {
  static async inviteAdmin(
    inviter: IAdmin,
    email: string,
    role: AdminRole = AdminRole.ADMIN
  ) {
    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      throw new Error('Admin with this email already exists');
    }

    // Generate invitation token
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const invitationExpires = new Date(Date.now() + INVITATION_EXPIRES_IN);

    // Create or update admin with invitation
    const admin = await Admin.findOneAndUpdate(
      { email },
      {
        email,
        role,
        status: AdminStatus.PENDING,
        invitationToken,
        invitationExpires,
        $setOnInsert: { firstName: '', lastName: '' } // These will be set during setup
      },
      { upsert: true, new: true }
    );

    // Send invitation email
    const setupUrl = `${process.env.ADMIN_URL}/setup?token=${invitationToken}`;
    await sendEmail({
      to: email,
      subject: 'Admin Account Invitation',
      html: `You've been invited to join as an admin. Click <a href="${setupUrl}">here</a> to set up your account.`
    });

    return { success: true, message: 'Invitation sent successfully' };
  }

  static async setupAccount(token: string, password: string, firstName: string, lastName: string) {
    const admin = await Admin.findOne({
      invitationToken: token,
      invitationExpires: { $gt: new Date() }
    });

    if (!admin) {
      throw new Error('Invalid or expired invitation token');
    }

    admin.passwordHash = password;
    admin.firstName = firstName;
    admin.lastName = lastName;
    admin.status = AdminStatus.ACTIVE;
    admin.invitationToken = undefined;
    admin.invitationExpires = undefined;

    await admin.save();

    // Generate JWT for immediate login
    return this.generateTokens(admin);
  }

  static async login(email: string, password: string) {
    const admin = await Admin.findOne({ email, status: AdminStatus.ACTIVE })
      .select('+passwordHash');

    if (!admin || !(await admin.comparePassword(password))) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    return this.generateTokens(admin);
  }

  static async refreshToken(refreshToken: string) {
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET) as { id: string };
      const admin = await Admin.findById(decoded.id);

      if (!admin) {
        throw new Error('Admin not found');
      }

      return this.generateTokens(admin);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  static async forgotPassword(email: string) {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      throw new Error('Admin with this email does not exist');
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    admin.resetPasswordToken = resetToken;
    admin.resetPasswordExpires = resetExpires;
    await admin.save();

    // Send reset email
    const resetUrl = `${process.env.ADMIN_URL}/reset-password?token=${resetToken}`;
    await sendEmail({
      to: email,
      subject: 'Password Reset Request',
      html: `You requested a password reset. Click <a href="${resetUrl}">here</a> to reset your password. If you didn't request this, please ignore this email.`
    });

    return { success: true, message: 'Password reset email sent' };
  }

  static async resetPassword(token: string, newPassword: string) {
    const admin = await Admin.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!admin) {
      throw new Error('Invalid or expired reset token');
    }

    admin.passwordHash = newPassword;
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpires = undefined;
    await admin.save();

    return { success: true, message: 'Password reset successfully' };
  }

  static async changePassword(adminId: string, oldPassword: string, newPassword: string) {
    const admin = await Admin.findById(adminId).select('+passwordHash');
    if (!admin) {
      throw new Error('Admin not found');
    }

    const isMatch = await admin.comparePassword(oldPassword);
    if (!isMatch) {
      throw new Error('Incorrect current password');
    }

    admin.passwordHash = newPassword;
    await admin.save();

    return { success: true, message: 'Password changed successfully' };
  }

  private static generateTokens(admin: IAdmin) {
    const payload = {
      id: admin._id,
      email: admin.email,
      role: admin.role
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });

    const refreshToken = jwt.sign({ id: admin._id }, JWT_SECRET, {
      expiresIn: '7d'
    });

    return {
      accessToken,
      refreshToken,
      admin: {
        id: admin._id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role
      }
    };
  }
}
