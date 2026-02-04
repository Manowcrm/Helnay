const db = require('./db');

async function assignLocations() {
  console.log('🌍 Assigning locations to existing listings...\n');
  
  // Get all listings
  const listings = await db.all('SELECT id, title, location FROM listings');
  
  // Get all locations
  const locations = await db.all('SELECT id, name FROM locations');
  
  console.log(`Found ${listings.length} listings and ${locations.length} locations\n`);
  
  // Assign locations based on keywords in title or old location field
  for (const listing of listings) {
    let assignedLocationId = null;
    
    // Map old location text to new location IDs
    const searchText = (listing.title + ' ' + (listing.location || '')).toLowerCase();
    
    if (searchText.includes('manhattan')) {
      assignedLocationId = locations.find(l => l.name === 'Manhattan')?.id;
    } else if (searchText.includes('city') || searchText.includes('downtown') || searchText.includes('urban')) {
      assignedLocationId = locations.find(l => l.name === 'Manhattan')?.id;
    } else if (searchText.includes('beach') || searchText.includes('seaside') || searchText.includes('coastal')) {
      assignedLocationId = locations.find(l => l.name === 'Miami Beach')?.id;
    } else if (searchText.includes('mountain') || searchText.includes('highlands') || searchText.includes('cabin')) {
      assignedLocationId = locations.find(l => l.name === 'Denver')?.id;
    } else if (searchText.includes('forest')) {
      assignedLocationId = locations.find(l => l.name === 'Seattle')?.id;
    } else {
      // Default to Manhattan
      assignedLocationId = locations.find(l => l.name === 'Manhattan')?.id;
    }
    
    if (assignedLocationId) {
      await db.run('UPDATE listings SET location_id = ? WHERE id = ?', [assignedLocationId, listing.id]);
      const locationName = locations.find(l => l.id === assignedLocationId)?.name;
      console.log(`✅ Listing ${listing.id}: "${listing.title}" → ${locationName}`);
    }
  }
  
  console.log('\n✅ All listings have been assigned locations!');
  console.log('\nVerifying...');
  
  const updated = await db.all(`
    SELECT l.id, l.title, loc.name as location_name
    FROM listings l
    LEFT JOIN locations loc ON l.location_id = loc.id
    ORDER BY l.id
  `);
  
  console.log('\nFinal assignments:');
  updated.forEach(l => {
    console.log(`  ${l.id}. ${l.title} - ${l.location_name || 'NO LOCATION'}`);
  });
  
  process.exit(0);
}

assignLocations().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
