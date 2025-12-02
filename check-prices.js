const Database = require('better-sqlite3');
const db = new Database('./data/helnay.db');

const listings = db.prepare('SELECT id, title, price FROM listings ORDER BY id').all();
console.log('\nListing Prices:');
listings.forEach(l => {
  console.log(`  #${l.id}: "${l.title}" - $${l.price}/night`);
});

const bookings = db.prepare('SELECT id, listing_id, total_amount, created_at FROM bookings ORDER BY id DESC LIMIT 5').all();
console.log('\nRecent Bookings (stored total_amount):');
bookings.forEach(b => {
  console.log(`  Booking #${b.id}: Listing ${b.listing_id} - Stored: $${b.total_amount}`);
});

db.close();
