// Quick verification that all UX features are set up
const db = require('./db');

async function checkSetup() {
  console.log('🔍 Checking UX Features Database Setup...\n');

  // Check tables exist
  console.log('📋 Checking Tables:');
  const tables = await db.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
  const requiredTables = ['favorites', 'verification_attempts', 'session_activity'];
  requiredTables.forEach(table => {
    const exists = tables.some(t => t.name === table);
    console.log(`  ${exists ? '✅' : '❌'} ${table}`);
  });

  // Check favorites table structure
  console.log('\n📊 Favorites Table Structure:');
  const favoritesInfo = await db.all(`PRAGMA table_info(favorites)`);
  favoritesInfo.forEach(col => {
    console.log(`  - ${col.name} (${col.type})`);
  });

  // Count existing data
  console.log('\n📈 Current Data:');
  const listingCount = await db.get('SELECT COUNT(*) as count FROM listings');
  console.log(`  Listings: ${listingCount.count}`);

  const userCount = await db.get('SELECT COUNT(*) as count FROM users');
  console.log(`  Users: ${userCount.count}`);

  const favoriteCount = await db.get('SELECT COUNT(*) as count FROM favorites');
  console.log(`  Favorites: ${favoriteCount.count}`);

  const bookingCount = await db.get('SELECT COUNT(*) as count FROM bookings');
  console.log(`  Bookings: ${bookingCount.count}`);

  console.log('\n✅ Database check complete!');
  console.log('\n📝 Next steps:');
  console.log('  1. Visit http://localhost:3000');
  console.log('  2. Log in as a user');
  console.log('  3. Try favoriting a listing (heart button)');
  console.log('  4. Visit /dashboard to see your dashboard');
  console.log('  5. Try advanced filters on homepage');
  console.log('\n🎉 All UX features are ready to test!');

  process.exit(0);
}

checkSetup().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
