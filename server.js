require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const db = require('./db');
const { backupDatabase } = require('./s3-backup');
const expressLayouts = require('express-ejs-layouts');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));

// Home - show listings
app.get('/', async (req, res) => {
  try {
    // basic search / filter support via query params: location, min_price, max_price, q, type
    const { location, min_price, max_price, q, type } = req.query;
    const where = [];
    const params = [];
    if (location) {
      where.push('location LIKE ?');
      params.push(`%${location}%`);
    }
    if (min_price) {
      where.push('price >= ?');
      params.push(min_price);
    }
    if (max_price) {
      where.push('price <= ?');
      params.push(max_price);
    }
    if (q) {
      where.push('(title LIKE ? OR description LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (type) {
      where.push('(title LIKE ? OR description LIKE ?)');
      params.push(`%${type}%`, `%${type}%`);
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // select first image for each listing (if any)
    const sql = `SELECT l.*, (
      SELECT url FROM listing_images i WHERE i.listing_id = l.id LIMIT 1
    ) as image_url FROM listings l ${whereSql} ORDER BY created_at DESC`;
    const listings = await db.all(sql, params);
    res.render('index', { listings, query: req.query });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/about', (req, res) => res.render('about'));

app.get('/contact', (req, res) => res.render('contact', { message: null }));
app.post('/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    await db.run('INSERT INTO contacts (name,email,message,created_at) VALUES (?,?,?,?)', [name, email, message, new Date().toISOString()]);
    res.render('contact', { message: 'Thanks — your message was sent.' });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

app.get('/listings/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const listing = await db.get('SELECT * FROM listings WHERE id = ?', [id]);
    if (!listing) return res.status(404).send('Listing not found');
    const images = await db.all('SELECT url FROM listing_images WHERE listing_id = ?', [id]);
    res.render('listing', { listing, images });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

app.get('/bookings', async (req, res) => {
  try {
    const listings = await db.all('SELECT id,title FROM listings');
    res.render('bookings', { listings, message: null });
  } catch (err) {
    res.status(500).send('Server error');
  }
});
app.post('/bookings', async (req, res) => {
  try {
    const { listing_id, name, email, checkin, checkout } = req.body;
    await db.run('INSERT INTO bookings (listing_id,name,email,checkin,checkout,created_at) VALUES (?,?,?,?,?,?)', [listing_id, name, email, checkin, checkout, new Date().toISOString()]);
    res.render('booking_confirm', { name });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Admin: view bookings
app.get('/admin/bookings', async (req, res) => {
  try {
    const bookings = await db.all('SELECT b.*, l.title FROM bookings b JOIN listings l ON b.listing_id = l.id ORDER BY b.created_at DESC');
    res.render('admin_bookings', { bookings });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Admin: trigger S3 database backup
app.post('/admin/backup', async (req, res) => {
  try {
    const s3Url = await backupDatabase();
    res.json({ success: true, url: s3Url });
  } catch (err) {
    console.error('Backup failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start server after DB initialized
(async () => {
  try {
    await db.init();
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
  } catch (err) {
    console.error('Failed to initialize DB', err);
    process.exit(1);
  }
})();
