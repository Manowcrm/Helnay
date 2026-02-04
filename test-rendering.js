const express = require('express');
const db = require('./db');

async function testRendering() {
  console.log('🔍 Testing what the homepage will render...\n');
  
  // Get data exactly as the home route does
  const sql = `SELECT l.*, loc.name as location_name, (
    SELECT url FROM listing_images i WHERE i.listing_id = l.id LIMIT 1
  ) as image_url 
  FROM listings l 
  LEFT JOIN locations loc ON l.location_id = loc.id
  ORDER BY created_at DESC
  LIMIT 5`;
  
  const listings = await db.all(sql);
  
  console.log('First 5 listings that will display:\n');
  
  listings.forEach((l, idx) => {
    console.log(`${idx + 1}. ${l.title}`);
    console.log(`   ID: ${l.id}`);
    console.log(`   location_id: ${l.location_id}`);
    console.log(`   location_name: ${l.location_name || 'NULL'}`);
    console.log(`   old location field: ${l.location || 'NULL'}`);
    console.log(`   Price: $${l.price}/night`);
    console.log(`   Has image: ${l.image_url ? 'Yes' : 'No'}`);
    console.log('   ---');
    
    // What will actually display
    const displayLocation = l.location_name || l.location || 'Location not set';
    console.log(`   📍 Will display: "${displayLocation}"`);
    console.log('');
  });
  
  process.exit(0);
}

testRendering().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
