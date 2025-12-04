const Database = require('better-sqlite3');
const path = require('path');

// Use production path
const dbPath = path.join(__dirname, 'data', 'helnay.db');
console.log(`📁 Database path: ${dbPath}`);

const db = new Database(dbPath);

const email = 'almutain1@roehampton.ac.uk';

console.log(`\n🔍 Checking user: ${email}\n`);

// Check if user exists
const user = db.prepare('SELECT id, name, email, is_verified, is_active, created_at FROM users WHERE email = ?').get(email);

if (!user) {
  console.log('❌ User NOT FOUND in database');
  console.log('\n💡 This user needs to register first!\n');
} else {
  console.log('✅ User found:');
  console.log(`   ID: ${user.id}`);
  console.log(`   Name: ${user.name}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Is Verified: ${user.is_verified ? '✅ YES' : '❌ NO'}`);
  console.log(`   Is Active: ${user.is_active ? '✅ YES' : '❌ NO'}`);
  console.log(`   Created: ${user.created_at}`);
  
  // Check verification tokens
  const verifications = db.prepare(`
    SELECT token, expires_at, verified_at, created_at 
    FROM email_verifications 
    WHERE user_id = ? 
    ORDER BY created_at DESC
  `).all(user.id);
  
  console.log(`\n📧 Verification tokens for this user: ${verifications.length}`);
  
  verifications.forEach((v, i) => {
    const expired = new Date(v.expires_at) < new Date();
    const verified = v.verified_at !== null;
    
    console.log(`\n   Token ${i + 1}:`);
    console.log(`   ${verified ? '✅ VERIFIED' : (expired ? '⏱️ EXPIRED' : '⏳ PENDING')}`);
    console.log(`   Created: ${v.created_at}`);
    console.log(`   Expires: ${v.expires_at}`);
    if (verified) {
      console.log(`   Verified: ${v.verified_at}`);
    }
    console.log(`   Token: ${v.token}`);
    if (!verified && !expired) {
      console.log(`   🔗 Link: https://helnay.com/verify-email/${v.token}`);
    }
  });
}

db.close();
