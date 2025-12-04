// Upgrade Admin to Super Admin - Run this on production via Render Shell
const Database = require('better-sqlite3');
const path = require('path');

// Production database path
const dbPath = process.env.DATABASE_PATH || '/opt/render/project/src/data';
const dbFile = path.join(dbPath, 'helnay.db');

try {
  const db = new Database(dbFile);
  
  console.log('=== PRODUCTION: Upgrading Admin to Super Admin ===');
  console.log('Database:', dbFile);
  console.log('');
  
  // Check current admins
  const admins = db.prepare('SELECT id, email, role FROM users WHERE role IN (?, ?)').all('admin', 'super_admin');
  console.log('Current admin/super_admin accounts:');
  admins.forEach((a, i) => {
    console.log(`  ${i + 1}. ${a.email} - Role: ${a.role}`);
  });
  
  // Upgrade admin@helnay.com to super_admin if it exists
  const adminUser = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get('admin@helnay.com');
  
  if (adminUser) {
    if (adminUser.role !== 'super_admin') {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run('super_admin', adminUser.id);
      console.log(`\n✅ Upgraded ${adminUser.email} to super_admin`);
    } else {
      console.log(`\n✓ ${adminUser.email} is already super_admin`);
    }
  } else {
    console.log('\n⚠️ admin@helnay.com not found. Creating super_admin account...');
    // This shouldn't happen, but just in case
    console.log('Please create the account manually first.');
  }
  
  // Show final state
  console.log('\n=== Final Admin Accounts ===');
  const finalAdmins = db.prepare('SELECT id, email, role FROM users WHERE role IN (?, ?)').all('admin', 'super_admin');
  finalAdmins.forEach(a => {
    console.log(`  ${a.email} - ${a.role}`);
  });
  
  db.close();
  console.log('\n✅ Done!');
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
