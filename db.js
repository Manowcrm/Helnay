const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbFile = path.join(__dirname, 'data', 'helnay.db');
const dataDir = path.dirname(dbFile);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(dbFile);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function init() {
  // create tables if not exist
  await run(`CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    price REAL,
    location TEXT,
    created_at TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER,
    name TEXT,
    email TEXT,
    checkin TEXT,
    checkout TEXT,
    created_at TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT,
    message TEXT,
    created_at TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS listing_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER,
    url TEXT
  )`);

  // seed sample listings if none exist
  const rows = await all('SELECT COUNT(1) as cnt FROM listings');
  const cnt = rows && rows[0] ? rows[0].cnt : 0;
  if (cnt === 0) {
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Cozy Studio Downtown', 'A small, comfortable studio close to public transport and amenities.', 45.0, 'City Center', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Seaside Cottage', 'Beautiful cottage with ocean views; perfect for couples.', 120.0, 'Seaside', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Mountain Cabin', 'Wooden cabin near trails and skiing areas.', 90.0, 'Highlands', new Date().toISOString()]);
    // seed some example images (using royalty-free image URLs)
    await run('INSERT INTO listing_images (listing_id,url) VALUES (?,?)', [1, 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80&auto=format&fit=crop']);
    await run('INSERT INTO listing_images (listing_id,url) VALUES (?,?)', [1, 'https://images.unsplash.com/photo-1505691723518-36a2b8f6bfb8?w=1200&q=80&auto=format&fit=crop']);
    await run('INSERT INTO listing_images (listing_id,url) VALUES (?,?)', [2, 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200&q=80&auto=format&fit=crop']);
    await run('INSERT INTO listing_images (listing_id,url) VALUES (?,?)', [2, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80&auto=format&fit=crop']);
    await run('INSERT INTO listing_images (listing_id,url) VALUES (?,?)', [3, 'https://images.unsplash.com/photo-1542317854-9d6d3b7f9f4f?w=1200&q=80&auto=format&fit=crop']);
  }
}

module.exports = { run, get, all, init };
