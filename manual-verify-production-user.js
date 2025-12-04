#!/usr/bin/env node
/**
 * Manual User Verification Script for Production
 * 
 * This script manually verifies user accounts that were created before 
 * the email verification system was properly configured.
 * 
 * Usage:
 *   node manual-verify-production-user.js <email>
 * 
 * Example:
 *   node manual-verify-production-user.js user@example.com
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'helnay.db');
const db = new Database(dbPath);

const email = process.argv[2];

if (!email) {
  console.log('❌ Error: Email address required');
  console.log('\nUsage: node manual-verify-production-user.js <email>');
  console.log('Example: node manual-verify-production-user.js user@example.com');
  console.log('\n📋 Recent unverified users:');
  
  const unverified = db.prepare(`
    SELECT id, name, email, created_at 
    FROM users 
    WHERE is_verified = 0 AND role != 'admin'
    ORDER BY created_at DESC 
    LIMIT 10
  `).all();
  
  if (unverified.length === 0) {
    console.log('   ✅ No unverified users found');
  } else {
    console.table(unverified);
  }
  
  db.close();
  process.exit(1);
}

try {
  // Check if user exists
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  
  if (!user) {
    console.log(`❌ User not found: ${email}`);
    db.close();
    process.exit(1);
  }
  
  if (user.is_verified === 1) {
    console.log(`✅ User is already verified: ${email}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   User can login now`);
    db.close();
    process.exit(0);
  }
  
  // Verify the user
  db.prepare('UPDATE users SET is_verified = 1 WHERE email = ?').run(email);
  
  console.log('\n✅ SUCCESS! User verified manually');
  console.log(`   Email: ${email}`);
  console.log(`   Name: ${user.name}`);
  console.log(`   User ID: ${user.id}`);
  console.log(`\n📧 User can now login at: https://helnay.com/login`);
  console.log(`   Email: ${email}`);
  console.log(`   Password: [the password they used during registration]`);
  
  db.close();
  
} catch (error) {
  console.error('❌ Error:', error.message);
  db.close();
  process.exit(1);
}
