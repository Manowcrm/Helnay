const db = require('./db');

async function addUserIdColumn() {
  try {
    console.log('🔧 Adding user_id column to bookings table...');
    
    // Check if column already exists
    const columns = await db.all('PRAGMA table_info(bookings)');
    const hasUserId = columns.some(col => col.name === 'user_id');
    
    if (hasUserId) {
      console.log('✅ user_id column already exists');
      return;
    }
    
    // Add user_id column
    await db.run('ALTER TABLE bookings ADD COLUMN user_id INTEGER');
    console.log('✅ Added user_id column to bookings table');
    
    // Create index for better performance
    await db.run('CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id)');
    console.log('✅ Created index on user_id column');
    
    console.log('\n📝 Note: Existing bookings will have NULL user_id.');
    console.log('   You may need to manually assign users to existing bookings.');
    
  } catch (err) {
    console.error('❌ Error adding user_id column:', err);
    throw err;
  }
}

addUserIdColumn()
  .then(() => {
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
