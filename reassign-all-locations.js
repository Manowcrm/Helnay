const db = require('./db');

async function reassignAllLocations() {
  console.log('🔄 Reassigning ALL listings to UK locations...\n');
  
  // Get all locations
  const locations = await db.all('SELECT * FROM locations ORDER BY name');
  
  // Get all listings
  const listings = await db.all('SELECT * FROM listings ORDER BY id');
  
  console.log(`Found ${listings.length} listings and ${locations.length} locations\n`);
  
  // Assign UK locations to ALL listings
  const ukAssignments = [
    { id: 1, location: 'Euston, London' },
    { id: 2, location: 'Kensington, London' },
    { id: 3, location: 'Oxford, UK' },
    { id: 4, location: 'Shoreditch, London' },
    { id: 5, location: 'Brixton, London' },
    { id: 6, location: 'Brighton, UK' },  // Beach property
    { id: 7, location: 'Brighton, UK' },  // Beach property
    { id: 8, location: 'Brighton, UK' },  // Beach property
    { id: 9, location: 'Edinburgh, UK' },  // Mountain cabin
    { id: 10, location: 'Edinburgh, UK' }, // Mountain cabin
    { id: 11, location: 'Westminster, London' },
    { id: 12, location: 'Manhattan' }
  ];
  
  // Add Brighton if it doesn't exist
  let brighton = locations.find(l => l.name === 'Brighton, UK');
  if (!brighton) {
    await db.run(
      'INSERT INTO locations (name, display_order, is_active, created_at) VALUES (?, ?, ?, ?)',
      ['Brighton, UK', 100, 1, new Date().toISOString()]
    );
    const result = await db.get('SELECT * FROM locations WHERE name = ?', ['Brighton, UK']);
    locations.push(result);
    console.log('✅ Added Brighton, UK location');
  }
  
  // Update each listing
  for (const assignment of ukAssignments) {
    const location = locations.find(l => l.name === assignment.location);
    if (location && assignment.id <= listings.length) {
      await db.run('UPDATE listings SET location_id = ? WHERE id = ?', [location.id, assignment.id]);
      const listing = listings.find(l => l.id === assignment.id);
      console.log(`✅ ${assignment.id}. "${listing?.title}" → ${assignment.location}`);
    }
  }
  
  console.log('\n📊 Final distribution:\n');
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
  
  console.log('\n✅ All listings updated with UK locations!');
  
  process.exit(0);
}

reassignAllLocations().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
