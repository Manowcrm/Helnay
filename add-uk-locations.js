const db = require('./db');

async function addUKLocations() {
  console.log('🇬🇧 Adding UK Locations to database...\n');
  
  // Check existing locations
  const existingLocations = await db.all('SELECT * FROM locations ORDER BY name');
  console.log(`Currently have ${existingLocations.length} locations\n`);
  
  // UK locations to add
  const ukLocations = [
    'Euston, London',
    'Oxford, UK',
    'Brixton, London',
    'Westminster, London',
    'Camden, London',
    'Shoreditch, London',
    'Kensington, London',
    'Chelsea, London',
    'Notting Hill, London',
    'Canary Wharf, London',
    'Birmingham, UK',
    'Manchester, UK',
    'Edinburgh, UK',
    'Glasgow, UK',
    'Liverpool, UK',
    'Bristol, UK',
    'Leeds, UK',
    'Cambridge, UK'
  ];
  
  let addedCount = 0;
  let startOrder = existingLocations.length + 1;
  
  for (const location of ukLocations) {
    // Check if already exists
    const exists = await db.get('SELECT * FROM locations WHERE name = ?', [location]);
    if (!exists) {
      await db.run(
        'INSERT INTO locations (name, display_order, is_active, created_at) VALUES (?, ?, ?, ?)',
        [location, startOrder++, 1, new Date().toISOString()]
      );
      console.log(`✅ Added: ${location}`);
      addedCount++;
    } else {
      console.log(`⏭️  Skipped: ${location} (already exists)`);
    }
  }
  
  console.log(`\n✅ Added ${addedCount} new UK locations!`);
  
  // Show all locations
  const allLocations = await db.all('SELECT * FROM locations WHERE is_active = 1 ORDER BY display_order, name');
  console.log(`\n📍 Total active locations: ${allLocations.length}`);
  console.log('\nAll locations:');
  allLocations.forEach((loc, idx) => {
    console.log(`  ${idx + 1}. ${loc.name}`);
  });
  
  process.exit(0);
}

addUKLocations().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
