const BetterSqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Use persistent disk path on Render (/opt/render/project/src/data), or local data folder in development
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data');
const dbFile = path.join(dbPath, 'helnay.db');

console.log('📁 Database location:', dbFile);

// Ensure directory exists BEFORE opening database
if (!fs.existsSync(dbPath)) {
  console.log('📂 Creating database directory:', dbPath);
  fs.mkdirSync(dbPath, { recursive: true });
}

// Verify directory was created successfully
if (!fs.existsSync(dbPath)) {
  throw new Error(`Failed to create database directory: ${dbPath}`);
}

console.log('✅ Database directory confirmed:', dbPath);

const db = new BetterSqlite3(dbFile);
console.log('✅ Connected to database at:', dbFile);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const result = db.prepare(sql).run(params);
      resolve(result);
    } catch (err) {
      reject(err);
    }
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const result = db.prepare(sql).get(params);
      resolve(result);
    } catch (err) {
      reject(err);
    }
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const result = db.prepare(sql).all(params);
      resolve(result);
    } catch (err) {
      reject(err);
    }
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
    payment_status TEXT DEFAULT 'unpaid',
    payment_intent_id TEXT,
    total_amount REAL,
    created_at TEXT
  )`);

  // Add payment columns to existing bookings table if they don't exist
  // Check each column individually and add only if missing
  try {
    const tableInfo = await all(`PRAGMA table_info(bookings)`);
    const columnNames = tableInfo.map(col => col.name);
    
    if (!columnNames.includes('payment_status')) {
      await run(`ALTER TABLE bookings ADD COLUMN payment_status TEXT DEFAULT 'unpaid'`);
      console.log('✓ Added payment_status column to bookings table');
    }
    
    if (!columnNames.includes('payment_intent_id')) {
      await run(`ALTER TABLE bookings ADD COLUMN payment_intent_id TEXT`);
      console.log('✓ Added payment_intent_id column to bookings table');
    }
    
    if (!columnNames.includes('total_amount')) {
      await run(`ALTER TABLE bookings ADD COLUMN total_amount REAL`);
      console.log('✓ Added total_amount column to bookings table');
    }
  } catch (e) {
    console.error('Migration error:', e.message);
  }

  // Add last_login column to users table if it doesn't exist
  try {
    const usersTableInfo = await all(`PRAGMA table_info(users)`);
    const usersColumnNames = usersTableInfo.map(col => col.name);
    
    if (!usersColumnNames.includes('last_login')) {
      await run(`ALTER TABLE users ADD COLUMN last_login TEXT`);
      console.log('✓ Added last_login column to users table');
    }
    
    if (!usersColumnNames.includes('admin_level')) {
      await run(`ALTER TABLE users ADD COLUMN admin_level TEXT`);
      console.log('✓ Added admin_level column to users table');
    }
    
    if (!usersColumnNames.includes('created_by')) {
      await run(`ALTER TABLE users ADD COLUMN created_by INTEGER`);
      console.log('✓ Added created_by column to users table');
    }
    
    if (!usersColumnNames.includes('is_active')) {
      await run(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`);
      console.log('✓ Added is_active column to users table');
      // Set all existing users as active
      await run(`UPDATE users SET is_active = 1 WHERE is_active IS NULL`);
    }
  } catch (e) {
    console.error('Users table migration error:', e.message);
  }

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
    admin_level TEXT,
    created_by INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at TEXT,
    last_login TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    admin_name TEXT NOT NULL,
    admin_email TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_description TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    ip_address TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (admin_id) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS filter_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    filter_key TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS listing_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    FOREIGN KEY (listing_id) REFERENCES listings(id),
    FOREIGN KEY (service_id) REFERENCES filter_services(id),
    UNIQUE(listing_id, service_id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS browse_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    filter_params TEXT NOT NULL,
    image_url TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT
  )`);

  // Seed default filter services if none exist
  const filterRows = await all('SELECT COUNT(1) as cnt FROM filter_services');
  const filterCnt = filterRows && filterRows[0] ? filterRows[0].cnt : 0;
  
  if (filterCnt === 0) {
    console.log('🌱 [DB INIT] Seeding default filter services');
    
    // Services category
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Services', 'Pool', 'water', 'pool', 1, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Services', 'WiFi', 'wifi', 'wifi', 2, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Services', 'Balcony', 'building', 'balcony', 3, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Services', 'Air Conditioning', 'snow', 'air-conditioning', 4, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Services', 'Garden', 'flower1', 'garden', 5, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Services', 'TV', 'tv', 'tv', 6, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Services', 'Parking', 'car-front', 'parking', 7, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Services', 'Kitchen', 'cup-hot', 'kitchen', 8, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Services', 'Washing Machine', 'recycle', 'washing', 9, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Services', 'Microwave', 'lightning', 'microwave', 10, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Services', 'Dishwasher', 'droplet', 'dishwasher', 11, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Services', 'Hot Tub', 'tsunami', 'hot-tub', 12, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Services', 'Sauna', 'fire', 'sauna', 13, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Services', 'Fireplace', 'fire', 'fireplace', 14, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Services', 'Cot', 'moon', 'cot', 15, new Date().toISOString()]);
    
    // Accommodation Type category
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Accommodation Type', 'Pet-Friendly', 'heart', 'pet-friendly', 1, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Accommodation Type', 'No Smoking', 'slash-circle', 'no-smoking', 2, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Accommodation Type', 'No Pets', 'x-circle', 'no-pets', 3, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Accommodation Type', 'Wheelchair Access', 'person-wheelchair', 'wheelchair', 4, new Date().toISOString()]);
    
    // Activities category
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Activities', 'Fishing', 'life-preserver', 'fishing', 1, new Date().toISOString()]);
    await run('INSERT INTO filter_services (category,name,icon,filter_key,display_order,created_at) VALUES (?,?,?,?,?,?)', ['Activities', 'Grill', 'fire', 'grill', 2, new Date().toISOString()]);
    
    console.log('✅ [DB INIT] Seeded 21 default filter services');
  }

  // Seed browse categories if none exist
  const categoriesCount = await all('SELECT COUNT(1) as cnt FROM browse_categories');
  const categoriesCnt = categoriesCount && categoriesCount[0] ? categoriesCount[0].cnt : 0;
  
  if (categoriesCnt === 0) {
    console.log('🌱 [DB INIT] Seeding default browse categories');
    
    await run('INSERT INTO browse_categories (title, description, filter_params, image_url, display_order, is_active, created_at) VALUES (?,?,?,?,?,?,?)', 
      ['Entire Homes', 'Spacious homes perfect for families and groups', 'category=home', '/images/entire-homes.jpg', 1, 1, new Date().toISOString()]);
    
    await run('INSERT INTO browse_categories (title, description, filter_params, image_url, display_order, is_active, created_at) VALUES (?,?,?,?,?,?,?)', 
      ['City Stays', 'Modern apartments in the heart of the city', 'location=city', '/images/city-stays.jpg', 2, 1, new Date().toISOString()]);
    
    await run('INSERT INTO browse_categories (title, description, filter_params, image_url, display_order, is_active, created_at) VALUES (?,?,?,?,?,?,?)', 
      ['Beach Houses', 'Coastal cottages with stunning ocean views', 'location=seaside', '/images/beach-houses.jpg', 3, 1, new Date().toISOString()]);
    
    await run('INSERT INTO browse_categories (title, description, filter_params, image_url, display_order, is_active, created_at) VALUES (?,?,?,?,?,?,?)', 
      ['Mountain Retreats', 'Cozy cabins in scenic mountain locations', 'location=highlands', '/images/mountain-retreats.jpg', 4, 1, new Date().toISOString()]);
    
    console.log('✅ [DB INIT] Seeded 4 default browse categories');
  }

  // seed sample listings if none exist
  const rows = await all('SELECT COUNT(1) as cnt FROM listings');
  const cnt = rows && rows[0] ? rows[0].cnt : 0;
  console.log(`📊 [DB INIT] Listing count: ${cnt}`);
  
  if (cnt === 0) {
    console.log('🌱 [DB INIT] No listings found - seeding database with sample data');
    // Entire Homes
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Spacious Family Home', 'Beautiful 4-bedroom home perfect for families. Features include WiFi, full kitchen with dishwasher and microwave, washing machine, TV, air conditioning, private garden with BBQ grill, parking, and pet-friendly. Private yard with room for everyone.', 180.0, 'Suburbs', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Modern Villa with Pool', 'Luxury 5-bedroom home with private heated pool, hot tub, WiFi, full kitchen, TV in every room, air conditioning, balcony with terrace, garden, parking, sauna, fireplace, washing machine, dishwasher, microwave. Ideal for large groups.', 350.0, 'Countryside', new Date().toISOString()]);
    
    // City Stays - Apartments
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Downtown Apartment', 'Cozy 2-bedroom apartment in the heart of the city. Includes WiFi, TV, air conditioning, full kitchen with microwave, dishwasher, washing machine, balcony. Walking distance to restaurants and attractions. No smoking.', 85.0, 'City Center', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Luxury City Loft', 'Modern loft apartment with skyline views, WiFi, smart TV, air conditioning, full kitchen with dishwasher and microwave, washing machine, rooftop terrace, parking, gym access, concierge service. No smoking, no pets.', 150.0, 'City Downtown', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Studio in Arts District', 'Charming studio apartment near galleries and theaters. Features WiFi, TV, air conditioning, kitchenette with microwave, balcony. Perfect for solo travelers and couples. No smoking.', 65.0, 'City Center', new Date().toISOString()]);
    
    // Beach Houses - Cottages
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Beachfront Cottage', 'Beautiful cottage with direct beach access and stunning ocean views. Includes WiFi, TV, air conditioning, full kitchen with dishwasher and microwave, washing machine, patio with BBQ grill, parking, garden, pet-friendly. Perfect for beach lovers.', 220.0, 'Seaside', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Coastal Retreat', 'Charming seaside cottage steps from the water. Features WiFi, TV, full kitchen, washing machine, terrace, parking, garden. Enjoy sunsets, beach walks, and fishing nearby. Pet-friendly.', 175.0, 'Seaside Beach', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Luxury Beach House', 'Stunning 3-bedroom beach house with panoramic ocean views, WiFi, smart TV, air conditioning, full kitchen with dishwasher and microwave, washing machine, large deck with hot tub, BBQ grill, parking, premium furnishings. No smoking.', 280.0, 'Seaside Premium', new Date().toISOString()]);
    
    // Mountain Retreats - Cabins
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Rustic Mountain Cabin', 'Cozy wooden cabin surrounded by nature. Includes WiFi, TV, fireplace, full kitchen with microwave, parking, patio with BBQ grill. Near hiking trails and fishing spots, perfect for nature lovers. Pet-friendly.', 95.0, 'Highlands', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Alpine Lodge Cabin', 'Spacious cabin with fireplace, mountain views, WiFi, TV, air conditioning, full kitchen with dishwasher and microwave, washing machine, hot tub, sauna, balcony, parking. Ideal for winter sports enthusiasts and hikers. Wheelchair accessible.', 140.0, 'Highlands Mountain', new Date().toISOString()]);
    await run('INSERT INTO listings (title,description,price,location,created_at) VALUES (?,?,?,?,?)', ['Secluded Forest Retreat', 'Private cabin deep in the woods with WiFi, TV, fireplace, full kitchen, washing machine, terrace, parking, garden. Perfect for peace and quiet. Near fishing and hiking trails. Pet-friendly, smoke-free.', 110.0, 'Highlands Forest', new Date().toISOString()]);
    
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
    console.log('✅ [DB INIT] Seeded 11 listings with images');
  } else {
    console.log(`✅ [DB INIT] Database already has ${cnt} listings - skipping seed`);
  }
  
  // Create or update default super admin user
  const existingAdmin = await get('SELECT * FROM users WHERE email = ?', ['sysadmin.portal@helnay.com']);
  
  if (existingAdmin) {
    // Update existing admin to super_admin if not already set
    if (existingAdmin.admin_level !== 'super_admin') {
      await run(
        'UPDATE users SET admin_level = ?, is_active = 1 WHERE email = ?',
        ['super_admin', 'sysadmin.portal@helnay.com']
      );
      console.log('✓ Existing admin user upgraded to super_admin');
    } else {
      console.log('✓ Super admin user already exists');
    }
  } else {
    // Create new super admin
    const hashedPassword = await bcrypt.hash('Hln@y2024$ecureAdm!n', 10);
    await run(
      'INSERT INTO users (name, email, password, role, admin_level, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['System Administrator', 'sysadmin.portal@helnay.com', hashedPassword, 'admin', 'super_admin', 1, new Date().toISOString()]
    );
    console.log('✓ Default super admin user created with secure credentials');
  }
}

module.exports = { run, get, all, init };
