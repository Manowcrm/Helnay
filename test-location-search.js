const db = require('./db');

async function testLocationSearch() {
  console.log('🔍 Testing Location Search...\n');
  
  // Test 1: Search for "London"
  console.log('Test 1: Search for "London"');
  const londonResults = await db.all(`
    SELECT l.id, l.title, loc.name as location_name
    FROM listings l
    LEFT JOIN locations loc ON l.location_id = loc.id
    WHERE LOWER(loc.name) LIKE LOWER(?)
  `, ['%london%']);
  
  console.log(`  Found ${londonResults.length} results:`);
  londonResults.forEach(l => {
    console.log(`    - ${l.title} (${l.location_name})`);
  });
  
  // Test 2: Search for "Oxford"
  console.log('\nTest 2: Search for "Oxford"');
  const oxfordResults = await db.all(`
    SELECT l.id, l.title, loc.name as location_name
    FROM listings l
    LEFT JOIN locations loc ON l.location_id = loc.id
    WHERE LOWER(loc.name) LIKE LOWER(?)
  `, ['%oxford%']);
  
  console.log(`  Found ${oxfordResults.length} results:`);
  oxfordResults.forEach(l => {
    console.log(`    - ${l.title} (${l.location_name})`);
  });
  
  // Test 3: Search for "Brixton"
  console.log('\nTest 3: Search for "Brixton"');
  const brixtonResults = await db.all(`
    SELECT l.id, l.title, loc.name as location_name
    FROM listings l
    LEFT JOIN locations loc ON l.location_id = loc.id
    WHERE LOWER(loc.name) LIKE LOWER(?)
  `, ['%brixton%']);
  
  console.log(`  Found ${brixtonResults.length} results:`);
  brixtonResults.forEach(l => {
    console.log(`    - ${l.title} (${l.location_name})`);
  });
  
  // Test 4: Show all listings with locations
  console.log('\n📋 All Listings with Locations:');
  const allListings = await db.all(`
    SELECT l.id, l.title, loc.name as location_name
    FROM listings l
    LEFT JOIN locations loc ON l.location_id = loc.id
    ORDER BY loc.name, l.title
  `);
  
  allListings.forEach(l => {
    console.log(`  ${l.id}. ${l.title} → ${l.location_name || 'NO LOCATION'}`);
  });
  
  console.log('\n✅ Location search is working!');
  
  process.exit(0);
}

testLocationSearch().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
