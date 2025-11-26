require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const BetterSqlite3 = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { backupDatabase } = require('./s3-backup');
const expressLayouts = require('express-ejs-layouts');
const { isAuthenticated, isAdmin } = require('./auth-middleware');
const { sendBookingApprovalEmail, sendBookingDenialEmail } = require('./email-service');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));

// Session configuration with persistent store
const sessionDb = new BetterSqlite3(path.join(__dirname, 'data', 'sessions.db'));
app.use(session({
  store: new SqliteStore({
    client: sessionDb,
    expired: {
      clear: true,
      intervalMs: 900000 // 15 minutes
    }
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Make user info available to all views
app.use((req, res, next) => {
  res.locals.user = req.session.userId ? {
    id: req.session.userId,
    name: req.session.userName,
    email: req.session.userEmail,
    role: req.session.role
  } : null;
  next();
});

// ====== AUTHENTICATION ROUTES ======

// Register page
app.get('/register', (req, res) => {
  res.render('register', { message: null, error: null });
});

app.post('/register', async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;
    
    if (!name || !email || !password) {
      return res.render('register', { message: null, error: 'All fields are required' });
    }
    
    if (password !== confirmPassword) {
      return res.render('register', { message: null, error: 'Passwords do not match' });
    }
    
    // Check if user already exists
    const existingUser = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.render('register', { message: null, error: 'Email already registered' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    await db.run(
      'INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, 'user', new Date().toISOString()]
    );
    
    res.render('register', { message: 'Registration successful! Please login.', error: null });
  } catch (err) {
    console.error(err);
    res.render('register', { message: null, error: 'Registration failed' });
  }
});

// Login page
app.get('/login', (req, res) => {
  res.render('login', { message: null, error: null });
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.render('login', { message: null, error: 'Email and password are required' });
    }
    
    // Find user
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.render('login', { message: null, error: 'Invalid email or password' });
    }
    
    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.render('login', { message: null, error: 'Invalid email or password' });
    }
    
    // Set session
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    req.session.role = user.role;
    
    // Redirect based on role
    if (user.role === 'admin') {
      res.redirect('/admin/bookings');
    } else {
      res.redirect('/');
    }
  } catch (err) {
    console.error(err);
    res.render('login', { message: null, error: 'Login failed' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ====== PUBLIC ROUTES ======

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

// Category pages
app.get('/entire-homes', async (req, res) => {
  try {
    const sql = `SELECT l.*, (
      SELECT url FROM listing_images i WHERE i.listing_id = l.id LIMIT 1
    ) as image_url FROM listings l WHERE (title LIKE ? OR description LIKE ?) ORDER BY created_at DESC`;
    const listings = await db.all(sql, ['%home%', '%home%']);
    res.render('entire-homes', { listings });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/city-stays', async (req, res) => {
  try {
    const sql = `SELECT l.*, (
      SELECT url FROM listing_images i WHERE i.listing_id = l.id LIMIT 1
    ) as image_url FROM listings l WHERE location LIKE ? AND (title LIKE ? OR description LIKE ?) ORDER BY created_at DESC`;
    const listings = await db.all(sql, ['%City%', '%apartment%', '%apartment%']);
    res.render('city-stays', { listings });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/beach-houses', async (req, res) => {
  try {
    const sql = `SELECT l.*, (
      SELECT url FROM listing_images i WHERE i.listing_id = l.id LIMIT 1
    ) as image_url FROM listings l WHERE location LIKE ? AND (title LIKE ? OR description LIKE ?) ORDER BY created_at DESC`;
    const listings = await db.all(sql, ['%Seaside%', '%cottage%', '%cottage%']);
    res.render('beach-houses', { listings });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/mountain-retreats', async (req, res) => {
  try {
    const sql = `SELECT l.*, (
      SELECT url FROM listing_images i WHERE i.listing_id = l.id LIMIT 1
    ) as image_url FROM listings l WHERE location LIKE ? AND (title LIKE ? OR description LIKE ?) ORDER BY created_at DESC`;
    const listings = await db.all(sql, ['%Highlands%', '%cabin%', '%cabin%']);
    res.render('mountain-retreats', { listings });
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

// Admin: view bookings (protected)
app.get('/admin/bookings', isAdmin, async (req, res) => {
  try {
    const bookings = await db.all('SELECT b.*, l.title FROM bookings b JOIN listings l ON b.listing_id = l.id ORDER BY b.created_at DESC');
    res.render('admin_bookings', { bookings });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Admin: approve booking
app.post('/admin/bookings/:id/approve', isAdmin, async (req, res) => {
  try {
    // Get booking and listing details
    const booking = await db.get('SELECT b.*, l.title, l.location, l.price FROM bookings b JOIN listings l ON b.listing_id = l.id WHERE b.id = ?', [req.params.id]);
    
    if (!booking) {
      return res.status(404).send('Booking not found');
    }
    
    // Update booking status
    await db.run('UPDATE bookings SET status = ? WHERE id = ?', ['approved', req.params.id]);
    
    // Send approval email
    await sendBookingApprovalEmail(booking, booking);
    
    res.redirect('/admin/bookings');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: deny booking
app.post('/admin/bookings/:id/deny', isAdmin, async (req, res) => {
  try {
    // Get booking and listing details
    const booking = await db.get('SELECT b.*, l.title, l.location, l.price FROM bookings b JOIN listings l ON b.listing_id = l.id WHERE b.id = ?', [req.params.id]);
    
    if (!booking) {
      return res.status(404).send('Booking not found');
    }
    
    // Update booking status
    await db.run('UPDATE bookings SET status = ? WHERE id = ?', ['denied', req.params.id]);
    
    // Send denial email
    await sendBookingDenialEmail(booking, booking);
    
    res.redirect('/admin/bookings');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: trigger S3 database backup (protected)
app.post('/admin/backup', isAdmin, async (req, res) => {
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
    const server = app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
    
    // Handle server errors
    server.on('error', (err) => {
      console.error('Server error:', err);
    });
    
    // Keep process alive
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, closing server');
      server.close();
    });
    
  } catch (err) {
    console.error('Failed to initialize DB', err);
    process.exit(1);
  }
})();
