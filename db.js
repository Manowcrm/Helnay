const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

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
    status TEXT DEFAULT 'pending',
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

  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at TEXT
  )`);

  // seed sample listings if none exist
  const rows = await all('SELECT COUNT(1) as cnt FROM listings');
  const cnt = rows && rows[0] ? rows[0].cnt : 0;
  if (cnt === 0) {
    // Entire Homes
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Spacious Family Home', 'Beautiful 4-bedroom home perfect for families. Private yard, full kitchen, and room for everyone to spread out.', 180.0, 'Suburbs', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Modern Villa with Pool', 'Luxury home with private pool, 5 bedrooms, modern amenities. Ideal for large groups and special occasions.', 350.0, 'Countryside', new Date().toISOString()]);
    
    // City Stays - Apartments
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Downtown Apartment', 'Cozy 2-bedroom apartment in the heart of the city. Walking distance to restaurants, shops, and attractions.', 85.0, 'City Center', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Luxury City Loft', 'Modern loft apartment with skyline views. Features include gym access, rooftop terrace, and concierge service.', 150.0, 'City Downtown', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Studio in Arts District', 'Charming studio apartment near galleries and theaters. Perfect for solo travelers and couples.', 65.0, 'City Center', new Date().toISOString()]);
    
    // Beach Houses - Cottages
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Beachfront Cottage', 'Beautiful cottage with direct beach access and stunning ocean views. Perfect for a romantic getaway or family vacation.', 220.0, 'Seaside', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Coastal Retreat', 'Charming seaside cottage steps from the water. Enjoy sunsets, beach walks, and the sound of waves.', 175.0, 'Seaside Beach', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Luxury Beach House', 'Stunning 3-bedroom beach house with panoramic ocean views, large deck, and premium furnishings.', 280.0, 'Seaside Premium', new Date().toISOString()]);
    
    // Mountain Retreats - Cabins
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Rustic Mountain Cabin', 'Cozy wooden cabin surrounded by nature. Near hiking trails, perfect for nature lovers and adventurers.', 95.0, 'Highlands', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Alpine Lodge Cabin', 'Spacious cabin with fireplace and mountain views. Ideal for winter sports enthusiasts and summer hikers.', 140.0, 'Highlands Mountain', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Secluded Forest Retreat', 'Private cabin deep in the woods. Perfect for those seeking peace, quiet, and connection with nature.', 110.0, 'Highlands Forest', new Date().toISOString()]);
    
    // seed example images for each listing
    const imageUrls = [
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80&auto=format&fit=crop', // home
      'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&q=80&auto=format&fit=crop', // villa
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80&auto=format&fit=crop', // apartment
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80&auto=format&fit=crop', // loft
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80&auto=format&fit=crop', // studio
      'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=1200&q=80&auto=format&fit=crop', // beach cottage
      'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200&q=80&auto=format&fit=crop', // coastal
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=80&auto=format&fit=crop', // beach house
      'https://images.unsplash.com/photo-1542718610-a1d656d1884c?w=1200&q=80&auto=format&fit=crop', // cabin
      'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=1200&q=80&auto=format&fit=crop', // alpine
      'https://images.unsplash.com/photo-1587061949409-02df41d5e562?w=1200&q=80&auto=format&fit=crop'  // forest
    ];
    
    for (let i = 1; i <= 11; i++) {
      await run('INSERT INTO listing_images (listing_id,url) VALUES (?,?)', [i, imageUrls[i-1]]);
      if (i <= 8) { // add second image for first 8 listings
        await run('INSERT INTO listing_images (listing_id,url) VALUES (?,?)', [i, imageUrls[(i+2) % 11]]);
      }
    }
  }
  
  // Create default admin user if none exists
  const adminCheck = await get('SELECT * FROM users WHERE role = ?', ['admin']);
  if (!adminCheck) {
    const hashedPassword = await bcrypt.hash('Hln@y2024$ecureAdm!n', 10);
    await run(
      'INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?)',
      ['System Administrator', 'sysadmin.portal@helnay.com', hashedPassword, 'admin', new Date().toISOString()]
    );
    console.log('✓ Default admin user created with secure credentials');
  }
}

module.exports = { run, get, all, init };
