require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'helnay.db');
const db = new Database(dbPath);

console.log('=== Checking User Registration Status ===\n');

// Get the email from command line argument or use default
const emailToCheck = process.argv[2];

if (!emailToCheck) {
  console.log('Usage: node check-user-status.js <email>');
  console.log('\nShowing all recent users:');
  const recentUsers = db.prepare('SELECT id, name, email, is_verified, created_at FROM users ORDER BY created_at DESC LIMIT 5').all();
  console.table(recentUsers);
  process.exit(0);
}

// Check if user exists
const user = db.prepare('SELECT id, name, email, is_verified, is_active, created_at FROM users WHERE email = ?').get(emailToCheck);

if (!user) {
  console.log(`❌ No user found with email: ${emailToCheck}`);
  process.exit(1);
}

console.log('✅ User found:');
console.log(`   Name: ${user.name}`);
console.log(`   Email: ${user.email}`);
console.log(`   ID: ${user.id}`);
console.log(`   Is Verified: ${user.is_verified === 1 ? '✅ YES' : '❌ NO'}`);
console.log(`   Is Active: ${user.is_active === 1 ? '✅ YES' : '❌ NO'}`);
console.log(`   Created: ${user.created_at}`);

// Check for verification token
const verification = db.prepare('SELECT token, expires_at, created_at FROM email_verifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(user.id);

if (verification) {
  console.log('\n📧 Verification Token:');
  console.log(`   Token: ${verification.token}`);
  console.log(`   Created: ${verification.created_at}`);
  console.log(`   Expires: ${verification.expires_at}`);
  const expired = new Date(verification.expires_at) < new Date();
  console.log(`   Status: ${expired ? '⏰ EXPIRED' : '✅ VALID'}`);
  console.log(`\n   Verification Link: ${process.env.BASE_URL}/verify-email/${verification.token}`);
} else {
  console.log('\n❌ No verification token found');
}

db.close();
