const Database = require('better-sqlite3');
const path = require('path');
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data');
const dbFile = path.join(dbPath, 'helnay.db');
const db = new Database(dbFile);

console.log('=== Fixing sysadmin.portal@helnay.com Role ===\n');

// Check current state
const sysadmin = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get('sysadmin.portal@helnay.com');

if (sysadmin) {
  console.log(`Current: ${sysadmin.email} - Role: ${sysadmin.role}`);
  
  if (sysadmin.role !== 'super_admin') {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run('super_admin', sysadmin.id);
    console.log(`\n✅ Upgraded ${sysadmin.email} to super_admin`);
    
    // Verify
    const updated = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(sysadmin.id);
    console.log(`Verification: ${updated.email} now has role: ${updated.role}`);
  } else {
    console.log(`\n✓ ${sysadmin.email} is already super_admin`);
  }
} else {
  console.log('❌ sysadmin.portal@helnay.com not found in database!');
}

// Show all admin accounts
console.log('\n=== All Admin Accounts ===');
const admins = db.prepare('SELECT email, role FROM users WHERE role IN (?, ?)').all('admin', 'super_admin');
admins.forEach(a => {
  console.log(`  ${a.email} - ${a.role}`);
});

db.close();
