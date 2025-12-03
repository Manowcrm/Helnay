const db = require('./db');

(async () => {
  try {
    await db.init();
    
    // Update all non-admin users to verified
    const result = await db.run('UPDATE users SET is_verified = 1 WHERE role != ?', ['admin']);
    
    console.log(`✅ Updated ${result.changes} user(s) to verified status`);
    
    // Show all users
    const users = await db.all('SELECT id, name, email, role, is_verified FROM users');
    console.log('\n📋 Current users:');
    users.forEach(u => {
      console.log(`  - ${u.name} (${u.email}): role=${u.role}, verified=${u.is_verified}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
