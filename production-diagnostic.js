const Database = require('better-sqlite3');
const path = require('path');

// This script will help diagnose production database issues
console.log('\n🔍 PRODUCTION DATABASE DIAGNOSTIC TOOL\n');
console.log('=' .repeat(60));

const dbPath = path.join(__dirname, 'data', 'helnay.db');
console.log(`📁 Database: ${dbPath}\n`);

const db = new Database(dbPath);

// 1. Check total users
console.log('📊 USER STATISTICS:');
const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'user'").get();
const verifiedUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'user' AND is_verified = 1").get();
const unverifiedUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'user' AND is_verified = 0").get();

console.log(`   Total Users: ${totalUsers.count}`);
console.log(`   ✅ Verified: ${verifiedUsers.count}`);
console.log(`   ❌ Unverified: ${unverifiedUsers.count}`);

// 2. Show all users (last 10)
console.log('\n\n👥 ALL USERS (most recent first):');
console.log('-'.repeat(60));

const allUsers = db.prepare(`
  SELECT id, name, email, is_verified, is_active, created_at, last_login
  FROM users 
  WHERE role = 'user'
  ORDER BY created_at DESC
  LIMIT 20
`).all();

if (allUsers.length === 0) {
  console.log('   No users found!\n');
} else {
  allUsers.forEach((user, i) => {
    console.log(`\n${i + 1}. ${user.name} (${user.email})`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Verified: ${user.is_verified ? '✅ YES' : '❌ NO'}`);
    console.log(`   Active: ${user.is_active ? '✅ YES' : '❌ NO'}`);
    console.log(`   Registered: ${user.created_at}`);
    console.log(`   Last Login: ${user.last_login || 'Never'}`);
    
    // Check verification tokens
    const tokens = db.prepare(`
      SELECT COUNT(*) as count, MAX(created_at) as last_sent
      FROM email_verifications 
      WHERE user_id = ?
    `).get(user.id);
    
    console.log(`   Verification Emails Sent: ${tokens.count} (last: ${tokens.last_sent || 'N/A'})`);
  });
}

// 3. Check for duplicate emails
console.log('\n\n🔍 CHECKING FOR DUPLICATE EMAILS:');
console.log('-'.repeat(60));

const duplicates = db.prepare(`
  SELECT email, COUNT(*) as count 
  FROM users 
  GROUP BY email 
  HAVING count > 1
`).all();

if (duplicates.length === 0) {
  console.log('   ✅ No duplicate emails found\n');
} else {
  console.log('   ⚠️ WARNING: Duplicate emails found!');
  duplicates.forEach(dup => {
    console.log(`   - ${dup.email}: ${dup.count} accounts`);
  });
  console.log('');
}

// 4. Recent verification attempts
console.log('\n📧 RECENT VERIFICATION EMAILS (last 24 hours):');
console.log('-'.repeat(60));

const recentVerifications = db.prepare(`
  SELECT u.name, u.email, v.created_at, v.expires_at, v.verified_at,
         CASE 
           WHEN v.verified_at IS NOT NULL THEN 'VERIFIED'
           WHEN datetime(v.expires_at) < datetime('now') THEN 'EXPIRED'
           ELSE 'PENDING'
         END as status
  FROM email_verifications v
  JOIN users u ON v.user_id = u.id
  WHERE v.created_at > datetime('now', '-1 day')
  ORDER BY v.created_at DESC
`).all();

if (recentVerifications.length === 0) {
  console.log('   No verification emails sent in last 24 hours\n');
} else {
  recentVerifications.forEach((v, i) => {
    console.log(`\n${i + 1}. ${v.name} (${v.email})`);
    console.log(`   Status: ${v.status}`);
    console.log(`   Sent: ${v.created_at}`);
    console.log(`   Expires: ${v.expires_at}`);
    if (v.verified_at) {
      console.log(`   Verified: ${v.verified_at}`);
    }
  });
  console.log('');
}

console.log('\n' + '='.repeat(60));
console.log('✅ Diagnostic complete!\n');

// 5. Provide search functionality
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('💡 Want to search for a specific email? Enter it below (or press Enter to exit):\n');

rl.question('Email: ', (email) => {
  if (email.trim()) {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim());
    
    if (!user) {
      console.log(`\n❌ No user found with email: ${email}`);
      console.log('   This user needs to register!\n');
    } else {
      console.log(`\n✅ User found:`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Verified: ${user.is_verified ? '✅ YES' : '❌ NO'}`);
      console.log(`   Active: ${user.is_active ? '✅ YES' : '❌ NO'}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Created: ${user.created_at}`);
      console.log(`   Last Login: ${user.last_login || 'Never'}`);
      
      // Get verification tokens
      const tokens = db.prepare(`
        SELECT token, expires_at, verified_at, created_at
        FROM email_verifications
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(user.id);
      
      console.log(`\n   📧 Verification Tokens: ${tokens.length}`);
      tokens.forEach((t, i) => {
        const expired = new Date(t.expires_at) < new Date();
        const verified = t.verified_at !== null;
        const status = verified ? '✅ VERIFIED' : (expired ? '⏱️ EXPIRED' : '⏳ VALID');
        
        console.log(`\n   Token ${i + 1}: ${status}`);
        console.log(`      Created: ${t.created_at}`);
        console.log(`      Expires: ${t.expires_at}`);
        if (verified) {
          console.log(`      Verified: ${t.verified_at}`);
        } else if (!expired) {
          console.log(`      🔗 Link: https://helnay.com/verify-email/${t.token}`);
        }
      });
      console.log('');
    }
  }
  
  db.close();
  rl.close();
  console.log('');
});
