const Database = require('better-sqlite3');
const db = new Database('./data/helnay.db');

console.log('\nBookings Table Schema:');
const schema = db.prepare("PRAGMA table_info(bookings)").all();
schema.forEach(col => {
  console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? 'DEFAULT ' + col.dflt_value : ''}`);
});

console.log('\nLast 3 Bookings (all fields):');
const bookings = db.prepare('SELECT * FROM bookings ORDER BY id DESC LIMIT 3').all();
bookings.forEach(b => {
  console.log(`\n  Booking #${b.id}:`);
  console.log(`    listing_id: ${b.listing_id}`);
  console.log(`    total_amount: ${b.total_amount}`);
  console.log(`    payment_status: ${b.payment_status}`);
  console.log(`    created_at: ${b.created_at}`);
});

db.close();
