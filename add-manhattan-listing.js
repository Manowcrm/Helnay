const db = require('./db');

async function addManhattanListing() {
  console.log('🏙️ Adding Manhattan Luxury Penthouse...\n');
  
  const listing = {
    title: 'Luxury Penthouse',
    description: 'Stunning penthouse in the heart of Manhattan with panoramic city views, modern amenities, and luxury finishes. Features spacious living areas, gourmet kitchen, and premium appliances.',
    location: 'Manhattan',
    price: 450,
    bedrooms: 3,
    max_guests: 6,
    created_at: new Date().toISOString()
  };
  
  const result = await db.run(
    `INSERT INTO listings (title, description, location, price, bedrooms, max_guests, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [listing.title, listing.description, listing.location, listing.price, listing.bedrooms, listing.max_guests, listing.created_at]
  );
  
  console.log(`✅ Created listing ID: ${result.lastID}`);
  console.log(`   Title: ${listing.title}`);
  console.log(`   Location: ${listing.location}`);
  console.log(`   Price: $${listing.price}/night`);
  console.log(`   Bedrooms: ${listing.bedrooms}`);
  console.log(`   Max Guests: ${listing.max_guests}`);
  
  // Verify it's searchable
  console.log('\n🔍 Testing Manhattan search:');
  const results = await db.all(
    `SELECT id, title, location FROM listings WHERE LOWER(location) LIKE LOWER(?)`,
    ['%Manhattan%']
  );
  
  console.log(`Found ${results.length} listing(s):`);
  results.forEach(l => {
    console.log(`  - ID ${l.id}: ${l.title} (${l.location})`);
  });
  
  console.log('\n✅ Manhattan listing added successfully!');
  console.log('Now restart the server and search for "Manhattan"');
  
  process.exit(0);
}

addManhattanListing().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
