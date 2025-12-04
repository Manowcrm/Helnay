const Database = require('better-sqlite3');
const path = require('path');
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data');
const dbFile = path.join(dbPath, 'helnay.db');
const db = new Database(dbFile);

console.log('=== Checking Admin Users ===');
console.log('Database:', dbFile);
console.log('');

const users = db.prepare('SELECT id, email, role FROM users WHERE role IN (?, ?)').all('admin', 'super_admin');
console.log('Admin/Super Admin users:');
users.forEach(u => {
  console.log(`  ID: ${u.id}, Email: ${u.email}, Role: ${u.role}`);
});

console.log('\nTotal:', users.length);

db.close();
