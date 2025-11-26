require('dotenv').config();
const db = require('./db');

(async () => {
  try {
    await db.init();
    
    // Add status column if it doesn't exist
    await db.run('ALTER TABLE bookings ADD COLUMN status TEXT DEFAULT "pending"');
    console.log('✓ Added status column to bookings table');
    
    // Update existing bookings
    const result = await db.run('UPDATE bookings SET status = ? WHERE status IS NULL', ['pending']);
    console.log('✓ Updated existing bookings to pending status');
    
    // Verify
    const bookings = await db.all('SELECT id, name, status FROM bookings');
    console.log('\nCurrent bookings:');
    bookings.forEach(b => {
      console.log(`  Booking #${b.id} - ${b.name} - Status: ${b.status}`);
    });
    
    process.exit(0);
  } catch (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('✓ Status column already exists');
      // Just update the values
      await db.run('UPDATE bookings SET status = ? WHERE status IS NULL OR status = ""', ['pending']);
      console.log('✓ Updated existing bookings to pending status');
      
      const bookings = await db.all('SELECT id, name, status FROM bookings');
      console.log('\nCurrent bookings:');
      bookings.forEach(b => {
        console.log(`  Booking #${b.id} - ${b.name} - Status: ${b.status}`);
      });
      process.exit(0);
    } else {
      console.error('Error:', err.message);
      process.exit(1);
    }
  }
})();
