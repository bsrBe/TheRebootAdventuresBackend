import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Admin, AdminRole, AdminStatus } from '../models/admin.model';
import dotenv from 'dotenv';

dotenv.config();

// const MONGODB_URI = 'mongodb+srv://BisratAbrham:142536bsr@cluster0.hjgnw.mongodb.net/Reboot_Adventures'
const MONGODB_URI = 'mongodb+srv://BisratAbrham:142536bsr@cluster0.hjgnw.mongodb.net/Reboot_Adventures'
const ADMIN_EMAIL = 'henos@gmail.com';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_FIRST_NAME = 'Henos';
const ADMIN_LAST_NAME = 'T';

async function createFirstAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: ADMIN_EMAIL });
    if (existingAdmin) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    // Create admin (password will be hashed by the pre-save hook)
    const admin = new Admin({
      email: ADMIN_EMAIL,
      passwordHash: ADMIN_PASSWORD, // This will be hashed by the pre-save hook
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
      role: AdminRole.SUPER_ADMIN,
      status: AdminStatus.ACTIVE,
    });

    await admin.save();
    console.log('First admin user created successfully');
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    console.log('Please change this password after first login!');
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating first admin:', error);
    process.exit(1);
  }
}

createFirstAdmin();
