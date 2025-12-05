import mongoose from 'mongoose';
import { Admin } from '../models/admin.model';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';
const ADMIN_ID = '693120c84bf5fe427a9d506a';

async function checkAdmin() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const admin = await Admin.findById(ADMIN_ID);
    console.log('\nAdmin found:', admin ? 'YES' : 'NO');
    if (admin) {
      console.log('Admin details:');
      console.log('- ID:', admin._id);
      console.log('- Email:', admin.email);
      console.log('- Status:', admin.status);
      console.log('- Role:', admin.role);
      console.log('- First Name:', admin.firstName);
      console.log('- Last Name:', admin.lastName);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAdmin();
