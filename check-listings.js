const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data');
const dbFile = path.join(dbPath, 'helnay.db');

console.log(`📁 Reading from: ${dbFile}\n`);

const db = new Database(dbFile);

const listings = db.prepare('SELECT id, title, description FROM listings ORDER BY id').all();

listings.forEach(listing => {
  console.log(`\n[${listing.id}] ${listing.title}`);
  console.log(`Description: ${listing.description}`);
  console.log('---');
});

db.close();
