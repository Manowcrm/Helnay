const Database = require('better-sqlite3');
const db = new Database('./data/helnay.db');

console.log('\n=== ALL CURRENT LISTING PRICES ===\n');
const listings = db.prepare('SELECT id, title, price FROM listings ORDER BY id').all();
listings.forEach(l => {
  console.log(`#${l.id}: "${l.title}" - $${l.price}/night`);
});

console.log('\n=== QUESTION FOR USER ===');
console.log('Which listing did you change the price for in the admin panel?');
console.log('What was the OLD price and what is the NEW price?');
console.log('\nExample: "I changed listing #1 from $150 to $180"');

db.close();
