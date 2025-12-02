const Database = require('better-sqlite3');
const db = new Database('./data/helnay.db');

console.log('Images per listing:');
const images = db.prepare('SELECT listing_id, COUNT(*) as count FROM listing_images GROUP BY listing_id').all();
images.forEach(img => {
  console.log(`  Listing ${img.listing_id}: ${img.count} image(s)`);
});

console.log('\nAll images:');
const allImages = db.prepare('SELECT id, listing_id, url FROM listing_images ORDER BY listing_id, id').all();
allImages.forEach(img => {
  console.log(`  Listing ${img.listing_id}: ${img.url}`);
});

db.close();
