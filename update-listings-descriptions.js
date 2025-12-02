const Database = require('better-sqlite3');
const path = require('path');

// Use the same database path as the application
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data');
const dbFile = path.join(dbPath, 'helnay.db');

console.log(`📁 Updating listings in: ${dbFile}`);

const db = new Database(dbFile);

// Update all listings with detailed amenity descriptions
const updates = [
  {
    id: 1,
    title: 'Spacious Family Home',
    description: 'Beautiful 4-bedroom home perfect for families. Features include WiFi, full kitchen with dishwasher and microwave, washing machine, TV, air conditioning, private garden with BBQ grill, parking, and pet-friendly. Private yard with room for everyone.'
  },
  {
    id: 2,
    title: 'Modern Villa with Pool',
    description: 'Luxury 5-bedroom home with private heated pool, hot tub, WiFi, full kitchen, TV in every room, air conditioning, balcony with terrace, garden, parking, sauna, fireplace, washing machine, dishwasher, microwave. Ideal for large groups.'
  },
  {
    id: 3,
    title: 'Downtown Apartment',
    description: 'Cozy 2-bedroom apartment in the heart of the city. Includes WiFi, TV, air conditioning, full kitchen with microwave, dishwasher, washing machine, balcony. Walking distance to restaurants and attractions. No smoking.'
  },
  {
    id: 4,
    title: 'Luxury City Loft',
    description: 'Modern loft apartment with skyline views, WiFi, smart TV, air conditioning, full kitchen with dishwasher and microwave, washing machine, rooftop terrace, parking, gym access, concierge service. No smoking, no pets.'
  },
  {
    id: 5,
    title: 'Studio in Arts District',
    description: 'Charming studio apartment near galleries and theaters. Features WiFi, TV, air conditioning, kitchenette with microwave, balcony. Perfect for solo travelers and couples. No smoking.'
  },
  {
    id: 6,
    title: 'Beachfront Cottage',
    description: 'Beautiful cottage with direct beach access and stunning ocean views. Includes WiFi, TV, air conditioning, full kitchen with dishwasher and microwave, washing machine, patio with BBQ grill, parking, garden, pet-friendly. Perfect for beach lovers.'
  },
  {
    id: 7,
    title: 'Coastal Retreat',
    description: 'Charming seaside cottage steps from the water. Features WiFi, TV, full kitchen, washing machine, terrace, parking, garden. Enjoy sunsets, beach walks, and fishing nearby. Pet-friendly.'
  },
  {
    id: 8,
    title: 'Luxury Beach House',
    description: 'Stunning 3-bedroom beach house with panoramic ocean views, WiFi, smart TV, air conditioning, full kitchen with dishwasher and microwave, washing machine, large deck with hot tub, BBQ grill, parking, premium furnishings. No smoking.'
  },
  {
    id: 9,
    title: 'Rustic Mountain Cabin',
    description: 'Cozy wooden cabin surrounded by nature. Includes WiFi, TV, fireplace, full kitchen with microwave, parking, patio with BBQ grill. Near hiking trails and fishing spots, perfect for nature lovers. Pet-friendly.'
  },
  {
    id: 10,
    title: 'Alpine Lodge Cabin',
    description: 'Spacious cabin with fireplace, mountain views, WiFi, TV, air conditioning, full kitchen with dishwasher and microwave, washing machine, hot tub, sauna, balcony, parking. Ideal for winter sports enthusiasts and hikers. Wheelchair accessible.'
  },
  {
    id: 11,
    title: 'Secluded Forest Retreat',
    description: 'Private cabin deep in the woods with WiFi, TV, fireplace, full kitchen, washing machine, terrace, parking, garden. Perfect for peace and quiet. Near fishing and hiking trails. Pet-friendly, smoke-free.'
  }
];

try {
  db.prepare('BEGIN TRANSACTION').run();
  
  const updateStmt = db.prepare('UPDATE listings SET description = ? WHERE id = ?');
  
  let updated = 0;
  for (const listing of updates) {
    const result = updateStmt.run(listing.description, listing.id);
    if (result.changes > 0) {
      console.log(`✅ Updated: ${listing.title}`);
      updated++;
    }
  }
  
  db.prepare('COMMIT').run();
  
  console.log(`\n🎉 Successfully updated ${updated} listings with detailed amenity descriptions!`);
  console.log('✅ Filters should now work correctly.');
  
} catch (error) {
  db.prepare('ROLLBACK').run();
  console.error('❌ Error updating listings:', error);
  process.exit(1);
} finally {
  db.close();
}
