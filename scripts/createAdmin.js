/**
 * Usage:
 *   node scripts/createAdmin.js <username> <password> [role]
 *
 * Examples:
 *   node scripts/createAdmin.js admin secretpass123
 *   node scripts/createAdmin.js superadmin mypass superadmin
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Admin from '../models/Admin.js';

dotenv.config();

const [,, username, password, role = 'admin'] = process.argv;

if (!username || !password) {
  console.error('Usage: node scripts/createAdmin.js <username> <password> [role]');
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);

const existing = await Admin.findOne({ username: username.toLowerCase() });
if (existing) {
  console.log(`⚠️  Admin "${username}" already exists. Updating password…`);
  existing.password = password;
  await existing.save();
  console.log(`✅ Password updated for "${username}"`);
} else {
  await Admin.create({ username, password, role });
  console.log(`✅ Admin "${username}" created with role "${role}"`);
}

await mongoose.disconnect();
