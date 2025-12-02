const Database = require('better-sqlite3');
const db = new Database('./data/helnay.db');

// Simulate creating a booking for listing #1
const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(1);
console.log(`\n Testing Booking Flow for Listing #${listing.id}:`);
console.log(`   Title: "${listing.title}"`);
console.log(`   Current Price: $${listing.price}/night\n`);

// Simulate 2 nights
const nights = 2;
const totalAmount = nights * listing.price;

console.log(` Booking Calculation:`);
console.log(`   ${nights} nights  $${listing.price} = $${totalAmount}`);
console.log(`   Stripe would receive: ${Math.round(totalAmount * 100)} cents\n`);

// Check what old bookings have stored
const oldBooking = db.prepare('SELECT b.*, l.price as current_price FROM bookings b JOIN listings l ON b.listing_id = l.id WHERE b.listing_id = ? ORDER BY b.id DESC LIMIT 1').get(1);
if (oldBooking) {
  console.log(` Comparison with Last Booking #${oldBooking.id}:`);
  console.log(`   Stored total_amount: $${oldBooking.total_amount || 'NULL'}`);
  console.log(`   Current listing price: $${oldBooking.current_price}/night`);
  
  if (oldBooking.checkin && oldBooking.checkout) {
    const checkin = new Date(oldBooking.checkin);
    const checkout = new Date(oldBooking.checkout);
    const oldNights = Math.ceil((checkout - checkin) / (1000 * 60 * 60 * 24));
    const recalculated = oldNights * oldBooking.current_price;
    console.log(`   Recalculated: ${oldNights} nights  $${oldBooking.current_price} = $${recalculated}`);
    console.log(`   Stripe would get: ${Math.round(recalculated * 100)} cents`);
  }
}

db.close();
