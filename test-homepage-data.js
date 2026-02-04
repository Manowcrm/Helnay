const db = require('./db');

async function testHomePage() {
  console.log('🧪 Testing Homepage Data...\n');
  
  // Simulate what the home route does
  const sql = `SELECT l.*, loc.name as location_name, (
    SELECT url FROM listing_images i WHERE i.listing_id = l.id LIMIT 1
  ) as image_url 
  FROM listings l 
  LEFT JOIN locations loc ON l.location_id = loc.id
  ORDER BY created_at DESC`;
  
  const listings = await db.all(sql);
  
  console.log(`Found ${listings.length} listings:\n`);
  
  listings.forEach((l, index) => {
    console.log(`${index + 1}. ${l.title}`);
    console.log(`   Location ID: ${l.location_id}`);
    console.log(`   Location Name: ${l.location_name || 'NOT SET'}`);
    console.log(`   Price: $${l.price}/night`);
    console.log(`   Has Image: ${l.image_url ? 'Yes' : 'No'}`);
    console.log('');
  });
  
  // Test Manhattan search
  console.log('🔍 Testing Manhattan search:\n');
  const manhattanSearch = await db.all(`
    SELECT l.*, loc.name as location_name
    FROM listings l
    LEFT JOIN locations loc ON l.location_id = loc.id
    WHERE LOWER(loc.name) LIKE LOWER(?)
  `, ['%Manhattan%']);
  
  console.log(`Found ${manhattanSearch.length} listings in Manhattan:`);
  manhattanSearch.forEach(l => {
    console.log(`  - ${l.title} (${l.location_name})`);
  });
  
  process.exit(0);
}

testHomePage().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
