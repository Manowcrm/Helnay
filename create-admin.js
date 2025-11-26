require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

async function createAdminUser() {
  try {
    await db.init();
    
    const adminEmail = 'admin@helnay.com';
    const adminPassword = 'admin123'; // Change this!
    
    // Check if admin already exists
    const existing = await db.get('SELECT * FROM users WHERE email = ?', [adminEmail]);
    if (existing) {
      console.log('Admin user already exists!');
      console.log('Email:', adminEmail);
      return;
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    // Create admin user
    await db.run(
      'INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?)',
      ['Admin', adminEmail, hashedPassword, 'admin', new Date().toISOString()]
    );
    
    console.log('✓ Admin user created successfully!');
    console.log('Email:', adminEmail);
    console.log('Password:', adminPassword);
    console.log('\n⚠️  IMPORTANT: Change the password after first login!');
  } catch (err) {
    console.error('Error creating admin user:', err);
  }
  process.exit(0);
}

createAdminUser();
