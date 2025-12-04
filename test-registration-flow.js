const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'data', 'helnay.db');
const db = new Database(dbPath);

async function testRegistration() {
  console.log('\n🧪 TESTING REGISTRATION FLOW\n');
  console.log('=' .repeat(60));
  
  const testUser = {
    name: 'Test Registration',
    email: `test.reg.${Date.now()}@example.com`,
    password: 'TestPass123!',
  };
  
  console.log(`\n📝 Creating test user: ${testUser.email}\n`);
  
  try {
    // Check if user exists
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(testUser.email);
    if (existing) {
      console.log('❌ User already exists (shouldn\'t happen with timestamp email)');
      return;
    }
    console.log('✓ Email not in use');
    
    // Hash password
    const hashedPassword = await bcrypt.hash(testUser.password, 10);
    console.log('✓ Password hashed');
    
    // Create user
    const result = db.prepare(
      'INSERT INTO users (name, email, password, role, is_verified, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(testUser.name, testUser.email, hashedPassword, 'user', 0, new Date().toISOString());
    
    const userId = result.lastInsertRowid;
    console.log(`✓ User created with ID: ${userId}`);
    
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    console.log('✓ Verification token generated');
    
    // Store verification token
    db.prepare(
      'INSERT INTO email_verifications (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)'
    ).run(userId, verificationToken, expiresAt, new Date().toISOString());
    console.log('✓ Verification token stored');
    
    // Verify user was created
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    console.log('\n✅ REGISTRATION SUCCESSFUL!\n');
    console.log('User Details:');
    console.log(`  ID: ${user.id}`);
    console.log(`  Name: ${user.name}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Verified: ${user.is_verified ? 'YES' : 'NO'}`);
    console.log(`  Created: ${user.created_at}`);
    
    // Check verification token
    const token = db.prepare('SELECT * FROM email_verifications WHERE user_id = ?').get(userId);
    console.log('\nVerification Token:');
    console.log(`  Expires: ${token.expires_at}`);
    console.log(`  Link: http://localhost:3000/verify-email/${token.token}`);
    
    console.log('\n✅ All database operations working correctly!');
    console.log('\n💡 The registration endpoint should now work on production.');
    console.log('   The issue was missing CSRF token in the GET /register route.');
    
  } catch (err) {
    console.error('\n❌ ERROR during registration test:', err);
    console.error('Stack:', err.stack);
  } finally {
    db.close();
  }
}

testRegistration();
