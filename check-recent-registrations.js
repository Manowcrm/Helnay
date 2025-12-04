const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'helnay.db');
const db = new Database(dbPath);

console.log('\n📊 Recent registrations (last 24 hours):\n');

const recentUsers = db.prepare(`
  SELECT u.id, u.name, u.email, u.is_verified, u.created_at,
         (SELECT COUNT(*) FROM email_verifications WHERE user_id = u.id) as token_count
  FROM users u
  WHERE u.created_at > datetime('now', '-1 day')
    AND u.role = 'user'
  ORDER BY u.created_at DESC
`).all();

if (recentUsers.length === 0) {
  console.log('   No new registrations in the last 24 hours.\n');
} else {
  recentUsers.forEach((user, i) => {
    console.log(`${i + 1}. ${user.name} (${user.email})`);
    console.log(`   Verified: ${user.is_verified ? '✅ YES' : '❌ NO'}`);
    console.log(`   Verification Tokens: ${user.token_count}`);
    console.log(`   Registered: ${user.created_at}`);
    console.log('');
  });
}

console.log('\n📧 All unverified users:\n');

const unverified = db.prepare(`
  SELECT u.id, u.name, u.email, u.created_at,
         v.token, v.expires_at, v.verified_at
  FROM users u
  LEFT JOIN email_verifications v ON u.id = v.user_id
  WHERE u.is_verified = 0 AND u.role = 'user'
  ORDER BY u.created_at DESC
`).all();

if (unverified.length === 0) {
  console.log('   ✅ All users are verified!\n');
} else {
  unverified.forEach((user, i) => {
    const expired = user.expires_at ? new Date(user.expires_at) < new Date() : true;
    console.log(`${i + 1}. ${user.name} (${user.email})`);
    console.log(`   Registered: ${user.created_at}`);
    if (user.token) {
      console.log(`   Token Status: ${expired ? '⏱️ EXPIRED' : '⏳ VALID'}`);
      console.log(`   Expires: ${user.expires_at}`);
      if (!expired) {
        console.log(`   🔗 Link: https://helnay.com/verify-email/${user.token}`);
      }
    } else {
      console.log(`   ⚠️ No verification token found!`);
    }
    console.log('');
  });
}

db.close();
