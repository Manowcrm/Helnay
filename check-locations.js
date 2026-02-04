const db = require('./db');

async function checkLocations() {
  console.log('📍 Checking all listing locations:\n');
  
  const listings = await db.all('SELECT id, title, location FROM listings ORDER BY id');
  
  listings.forEach(l => {
    console.log(`ID ${l.id}: ${l.title}`);
    console.log(`   Location: "${l.location}"`);
    console.log('');
  });
  
  console.log(`\n🔍 Testing Manhattan search:`);
  const manhattanSearch = await db.all(
    `SELECT id, title, location FROM listings WHERE LOWER(location) LIKE LOWER(?)`,
    ['%Manhattan%']
  );
  
  console.log(`Found ${manhattanSearch.length} listings with "Manhattan":`);
  manhattanSearch.forEach(l => {
    console.log(`  - ${l.title} (${l.location})`);
  });
  
  process.exit(0);
}

checkLocations().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
