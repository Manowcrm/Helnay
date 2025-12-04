const Database = require('better-sqlite3');
const path = require('path');
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data');
const dbFile = path.join(dbPath, 'helnay.db');
const db = new Database(dbFile);

console.log('=== Upgrading Admin to Super Admin ===\n');

// Show current admins
const admins = db.prepare('SELECT id, email, role FROM users WHERE role = ?').all('admin');
console.log('Current admin accounts:');
admins.forEach((a, i) => {
  console.log(`  ${i + 1}. ID: ${a.id}, Email: ${a.email}`);
});

// Upgrade the first admin to super_admin
if (admins.length > 0) {
  const upgradeUser = admins[0];
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run('super_admin', upgradeUser.id);
  console.log(`\n✅ Upgraded ${upgradeUser.email} to super_admin`);
  
  // Verify
  const updated = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(upgradeUser.id);
  console.log(`\nVerification: ${updated.email} now has role: ${updated.role}`);
} else {
  console.log('\n❌ No admin accounts found!');
}

db.close();
