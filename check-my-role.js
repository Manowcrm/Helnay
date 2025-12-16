const Database = require('better-sqlite3');
const path = require('path');
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data');
const dbFile = path.join(dbPath, 'helnay.db');
const db = new Database(dbFile);

console.log('=== Checking sysadmin.portal@helnay.com ===\n');

const user = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get('sysadmin.portal@helnay.com');

if (user) {
  console.log('Database record:');
  console.log(`  Email: ${user.email}`);
  console.log(`  Role: ${user.role}`);
  console.log(`  ID: ${user.id}`);
  
  if (user.role === 'super_admin') {
    console.log('\n✅ Role is correct in database!');
    console.log('\n⚠️ If you still get "Server error", you need to:');
    console.log('   1. LOG OUT completely from the website');
    console.log('   2. LOG BACK IN with: sysadmin.portal@helnay.com');
    console.log('   3. This will refresh your session with the new role');
  } else {
    console.log(`\n❌ Role is still "${user.role}" - should be "super_admin"`);
  }
} else {
  console.log('❌ User not found!');
}

db.close();
