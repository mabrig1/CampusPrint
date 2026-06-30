/**
 * Usage:
 *   node scripts/createAdmin.js <username> <password> [role]
 *
 * Examples:
 *   node scripts/createAdmin.js admin secretpass123
 *   node scripts/createAdmin.js superadmin mypass superadmin
 */
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { upsertAdmin } from '../lib/queries.js';

dotenv.config();

const [,, username, password, role = 'admin'] = process.argv;
if (!username || !password) {
  console.error('Usage: node scripts/createAdmin.js <username> <password> [role]');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const admin = await upsertAdmin(username, hash, role);
console.log(`✅ Admin "${admin.username}" saved with role "${admin.role}"`);
process.exit(0);
