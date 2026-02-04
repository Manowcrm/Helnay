const db = require('./db');

async function updateListingsWithUKLocations() {
  console.log('🇬🇧 Assigning UK locations to some listings...\n');
  
  // Get some listings to update
  const listings = await db.all('SELECT * FROM listings ORDER BY id LIMIT 12');
  const ukLocations = await db.all(`SELECT * FROM locations WHERE name LIKE '%London%' OR name LIKE '%UK%'`);
  
  // Update some listings with UK locations
  const updates = [
    { id: 1, location: 'Euston, London' },
    { id: 2, location: 'Kensington, London' },
    { id: 3, location: 'Oxford, UK' },
    { id: 4, location: 'Shoreditch, London' },
    { id: 5, location: 'Brixton, London' },
    { id: 11, location: 'Westminster, London' }
  ];
  
  for (const update of updates) {
    const location = ukLocations.find(l => l.name === update.location);
    if (location) {
      await db.run('UPDATE listings SET location_id = ? WHERE id = ?', [location.id, update.id]);
      const listing = listings.find(l => l.id === update.id);
      console.log(`✅ Updated: "${listing?.title}" → ${update.location}`);
    }
  }
  
  console.log('\n✅ Listings updated with UK locations!');
  
  // Show current distribution
  console.log('\n📊 Listing distribution by location:\n');
  const distribution = await db.all(`
    SELECT loc.name, COUNT(l.id) as count
    FROM locations loc
    LEFT JOIN listings l ON loc.id = l.location_id
    WHERE loc.is_active = 1
    GROUP BY loc.id, loc.name
    HAVING count > 0
    ORDER BY count DESC, loc.name
  `);
  
  distribution.forEach(d => {
    console.log(`  ${d.name}: ${d.count} listing(s)`);
  });
  
  process.exit(0);
}

updateListingsWithUKLocations().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
