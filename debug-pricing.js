const Database = require('better-sqlite3');
const db = new Database('./data/helnay.db');

console.log('\n=== INVESTIGATING PRICE FLOW ===\n');

// Check listing #1 current price
const listing = db.prepare('SELECT id, title, price FROM listings WHERE id = 1').get();
console.log(`Listing #1 Current Price in Database:`);
console.log(`  "${listing.title}": $${listing.price}/night\n`);

// Check recent bookings for listing #1
const bookings = db.prepare(`
  SELECT b.id, b.listing_id, b.total_amount, b.created_at, 
         l.price as current_listing_price, b.checkin, b.checkout
  FROM bookings b 
  JOIN listings l ON b.listing_id = l.id 
  WHERE b.listing_id = 1 
  ORDER BY b.id DESC 
  LIMIT 3
`).all();

console.log(`Recent Bookings for Listing #1:`);
bookings.forEach(b => {
  let nights = 'N/A';
  if (b.checkin && b.checkout) {
    const checkin = new Date(b.checkin);
    const checkout = new Date(b.checkout);
    nights = Math.ceil((checkout - checkin) / (1000 * 60 * 60 * 24));
  }
  console.log(`\n  Booking #${b.id}:`);
  console.log(`    Stored total_amount: $${b.total_amount || 'NULL'}`);
  console.log(`    Current listing price: $${b.current_listing_price}/night`);
  console.log(`    Nights: ${nights}`);
  if (nights !== 'N/A' && nights > 0) {
    const shouldBe = nights * b.current_listing_price;
    console.log(`    Should calculate to: ${nights}  $${b.current_listing_price} = $${shouldBe}`);
  }
  console.log(`    Created: ${b.created_at}`);
});

db.close();
