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
const { sendBookingApprovalEmail, sendBookingDenialEmail, sendBookingDateChangeEmail, sendBookingCancellationEmail, sendContactNotificationToAdmin, sendWelcomeEmail } = require('./email-service');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

const app = express();

// Trust proxy - required for secure cookies to work behind Render's proxy
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json()); // For Stripe webhook and API calls

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
    secure: process.env.NODE_ENV === 'production', // true on HTTPS (Render), false locally
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax'
  },
  rolling: true // Extend session on each request
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
    
    // Send welcome email (non-blocking - registration succeeds even if email fails)
    sendWelcomeEmail({ name, email }).catch(err => {
      console.warn('Welcome email failed but registration succeeded:', err.message);
    });
    
    res.render('register', { message: 'Registration successful! Please check your email for a welcome message, then login.', error: null });
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
    
    // Save session before redirect
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.render('login', { message: null, error: 'Login failed' });
      }
      
      console.log('[LOGIN] Session saved successfully:', {
        userId: req.session.userId,
        role: req.session.role,
        sessionID: req.sessionID
      });
      
      // Redirect based on role
      if (user.role === 'admin') {
        res.redirect('/admin');
      } else {
        res.redirect('/');
      }
    });
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
    
    // Send notification email to admin
    await sendContactNotificationToAdmin({ name, email, message });
    
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
    console.log(`📄 [LISTING PAGE] Showing listing ${id}: "${listing.title}" at $${listing.price}/night`);
    const images = await db.all('SELECT url FROM listing_images WHERE listing_id = ?', [id]);
    
    // Prevent browser caching
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.render('listing', { listing, images });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Debug route to check database prices
app.get('/api/debug/listings', async (req, res) => {
  try {
    const listings = await db.all('SELECT id, title, price, location FROM listings ORDER BY id');
    res.json({
      message: 'Current prices in database',
      timestamp: new Date().toISOString(),
      listings: listings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin API: Force update listing price (for troubleshooting)
app.post('/api/admin/listings/:id/update-price', isAdmin, async (req, res) => {
  try {
    const { price } = req.body;
    const listingId = req.params.id;
    
    console.log('🔧 [API UPDATE] Received request to update listing:', { listingId, newPrice: price });
    
    // Check if listing exists
    const listing = await db.get('SELECT * FROM listings WHERE id = ?', [listingId]);
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found', listingId });
    }
    
    console.log('📋 [API UPDATE] Current listing:', { id: listing.id, price: listing.price, title: listing.title });
    
    // Update the price
    const result = await db.run('UPDATE listings SET price = ? WHERE id = ?', [price, listingId]);
    
    console.log('📝 [API UPDATE] Update result:', { changes: result.changes });
    
    // Verify
    const updated = await db.get('SELECT * FROM listings WHERE id = ?', [listingId]);
    
    console.log('✅ [API UPDATE] After update:', { id: updated.id, price: updated.price });
    
    res.json({
      success: true,
      message: 'Price updated successfully',
      before: listing.price,
      after: updated.price,
      changes: result.changes
    });
  } catch (err) {
    console.error('❌ [API UPDATE] Error:', err);
    res.status(500).json({ error: err.message });
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
    const { listing_id, name, email, checkin_date, checkin_time, checkout_date, checkout_time } = req.body;
    const checkin = `${checkin_date} ${checkin_time}`;
    const checkout = `${checkout_date} ${checkout_time}`;
    
    // Get listing details for payment calculation
    const listing = await db.get('SELECT * FROM listings WHERE id = ?', [listing_id]);
    if (!listing) {
      return res.status(404).send('Listing not found');
    }
    
    console.log(`💰 [BOOKING] Creating booking for listing ${listing_id}: "${listing.title}"`);
    console.log(`💰 [BOOKING] Price from database: $${listing.price}/night`);
    
    // Calculate number of nights
    const checkinDate = new Date(checkin_date);
    const checkoutDate = new Date(checkout_date);
    const nights = Math.ceil((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));
    const totalAmount = nights * listing.price;
    
    console.log(`💰 [BOOKING] Calculation: ${nights} nights × $${listing.price} = $${totalAmount}`);
    
    // Create booking with payment_status = 'unpaid'
    const result = await db.run(
      'INSERT INTO bookings (listing_id,name,email,checkin,checkout,payment_status,total_amount,created_at) VALUES (?,?,?,?,?,?,?,?)',
      [listing_id, name, email, checkin, checkout, 'unpaid', totalAmount, new Date().toISOString()]
    );
    
    // Redirect to payment page
    res.redirect(`/payment/${result.lastID}`);
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).send('Server error');
  }
});

// Payment page
app.get('/payment/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await db.get(
      'SELECT b.*, l.title, l.price, l.location FROM bookings b JOIN listings l ON b.listing_id = l.id WHERE b.id = ?',
      [bookingId]
    );
    
    if (!booking) {
      return res.status(404).send('Booking not found');
    }
    
    if (booking.payment_status === 'paid') {
      return res.redirect(`/payment/success?booking_id=${bookingId}`);
    }
    
    // Calculate nights
    const checkinDate = new Date(booking.checkin);
    const checkoutDate = new Date(booking.checkout);
    const nights = Math.ceil((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));
    
    res.render('payment', {
      booking,
      nights,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
    });
  } catch (err) {
    console.error('Payment page error:', err);
    res.status(500).send('Server error');
  }
});

// Create Stripe Payment Intent
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { bookingId } = req.body;
    
    const booking = await db.get(
      'SELECT b.*, l.title FROM bookings b JOIN listings l ON b.listing_id = l.id WHERE b.id = ?',
      [bookingId]
    );
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    if (booking.payment_status === 'paid') {
      return res.status(400).json({ error: 'Booking already paid' });
    }
    
    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(booking.total_amount * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        booking_id: bookingId,
        listing_title: booking.title,
        customer_email: booking.email,
        customer_name: booking.name
      },
      description: `Booking for ${booking.title}`,
      receipt_email: booking.email
    });
    
    // Save payment_intent_id to booking
    await db.run(
      'UPDATE bookings SET payment_intent_id = ? WHERE id = ?',
      [paymentIntent.id, bookingId]
    );
    
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Payment intent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Payment success page
app.get('/payment/success', async (req, res) => {
  try {
    const { booking_id } = req.query;
    const booking = await db.get(
      'SELECT b.*, l.title, l.location FROM bookings b JOIN listings l ON b.listing_id = l.id WHERE b.id = ?',
      [booking_id]
    );
    
    res.render('payment_success', { booking });
  } catch (err) {
    console.error('Payment success page error:', err);
    res.status(500).send('Server error');
  }
});

// Stripe webhook to confirm payment
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Handle the event
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const bookingId = paymentIntent.metadata.booking_id;
    
    // Update booking payment status
    await db.run(
      'UPDATE bookings SET payment_status = ? WHERE id = ?',
      ['paid', bookingId]
    );
    
    console.log(`✓ Payment confirmed for booking ${bookingId}`);
  }
  
  res.json({ received: true });
});

// Log all admin requests for debugging
app.use('/admin', (req, res, next) => {
  console.log(`[ADMIN REQUEST] ${req.method} ${req.path} - Full URL: ${req.originalUrl}`);
  next();
});

// Admin: dashboard (protected)
app.get('/admin', isAdmin, async (req, res) => {
  try {
    const stats = {
      listings: (await db.get('SELECT COUNT(*) as count FROM listings')).count,
      bookings: (await db.get('SELECT COUNT(*) as count FROM bookings')).count,
      users: (await db.get('SELECT COUNT(*) as count FROM users')).count,
      contacts: (await db.get('SELECT COUNT(*) as count FROM contacts')).count,
      pendingBookings: (await db.get('SELECT COUNT(*) as count FROM bookings WHERE status IS NULL OR status = "pending"')).count
    };
    res.render('admin_dashboard', { stats });
  } catch (err) {
    console.error(err);
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

// Admin: manage listings
app.get('/admin/listings', isAdmin, async (req, res) => {
  try {
    const listings = await db.all(`SELECT l.*, (
      SELECT url FROM listing_images i WHERE i.listing_id = l.id LIMIT 1
    ) as image_url FROM listings l ORDER BY l.created_at DESC`);
    res.render('admin_listings', { listings });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: new listing form
app.get('/admin/listings/new', isAdmin, (req, res) => {
  res.render('admin_listing_form', { listing: {}, images: [] });
});

// Admin: create listing
app.post('/admin/listings/create', isAdmin, async (req, res) => {
  try {
    const { title, location, price, description } = req.body;
    console.log('Creating new listing:', { title, location, price, description });
    const result = await db.run(
      'INSERT INTO listings (title, location, price, description, created_at) VALUES (?, ?, ?, ?, ?)',
      [title, location, price, description, new Date().toISOString()]
    );
    console.log('Listing created successfully with ID:', result.lastID);
    res.redirect('/admin/listings');
  } catch (err) {
    console.error('Error creating listing:', err.message, err);
    res.status(500).send('Server error: ' + err.message);
  }
});

// Admin: edit listing form
app.get('/admin/listings/:id/edit', isAdmin, async (req, res) => {
  try {
    const listing = await db.get('SELECT * FROM listings WHERE id = ?', [req.params.id]);
    if (!listing) return res.status(404).send('Listing not found');
    const images = await db.all('SELECT * FROM listing_images WHERE listing_id = ?', [req.params.id]);
    res.render('admin_listing_form', { listing, images });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: add image to listing
app.post('/admin/listings/:listingId/images/add', isAdmin, async (req, res) => {
  console.log('Add image route hit:', { listingId: req.params.listingId, url: req.body.new_image });
  try {
    const { new_image } = req.body;
    if (new_image && new_image.trim()) {
      await db.run('INSERT INTO listing_images (listing_id, url) VALUES (?, ?)', [req.params.listingId, new_image.trim()]);
    }
    res.redirect('/admin/listings/' + req.params.listingId + '/edit');
  } catch (err) {
    console.error('Error adding image:', err);
    res.status(500).send('Server error');
  }
});

// Admin: delete listing image (MORE SPECIFIC ROUTE - must be before /:id/update and /:id/delete)
app.post('/admin/listings/:listingId/images/:imageId/delete', isAdmin, async (req, res) => {
  console.log('Image delete route hit:', { listingId: req.params.listingId, imageId: req.params.imageId });
  try {
    const result = await db.run('DELETE FROM listing_images WHERE id = ? AND listing_id = ?', [req.params.imageId, req.params.listingId]);
    console.log('Image deleted successfully:', result);
    res.redirect('/admin/listings/' + req.params.listingId + '/edit');
  } catch (err) {
    console.error('Error deleting image:', err.message, err);
    res.redirect('/admin/listings/' + req.params.listingId + '/edit?error=delete_failed');
  }
});

// Admin: update listing
app.post('/admin/listings/:id/update', isAdmin, async (req, res) => {
  try {
    const { title, location, price, description } = req.body;
    const listingId = req.params.id;
    
    // Log before update
    const beforeUpdate = await db.get('SELECT * FROM listings WHERE id = ?', [listingId]);
    console.log('🔧 [ADMIN UPDATE] BEFORE:', { 
      id: listingId, 
      oldPrice: beforeUpdate?.price,
      newPrice: price,
      formData: req.body 
    });
    
    // Perform update
    const result = await db.run(
      'UPDATE listings SET title = ?, location = ?, price = ?, description = ? WHERE id = ?',
      [title, location, price, description, listingId]
    );
    
    console.log('📝 [ADMIN UPDATE] UPDATE result:', { 
      changes: result.changes,
      listingId: listingId
    });
    
    // Verify the update worked
    const afterUpdate = await db.get('SELECT * FROM listings WHERE id = ?', [listingId]);
    console.log('✅ [ADMIN UPDATE] AFTER:', { 
      id: listingId,
      price: afterUpdate.price,
      title: afterUpdate.title,
      location: afterUpdate.location,
      updateSuccessful: afterUpdate.price == price
    });
    
    if (result.changes === 0) {
      console.warn('⚠️ [ADMIN UPDATE] No rows were updated! Listing may not exist.');
    }
    
    res.redirect('/admin/listings');
  } catch (err) {
    console.error('❌ [ADMIN UPDATE] Error updating listing:', err.message, err);
    res.status(500).send('Server error: ' + err.message);
  }
});

// Admin: delete listing
app.post('/admin/listings/:id/delete', isAdmin, async (req, res) => {
  console.log('Listing delete route hit:', { id: req.params.id, fullPath: req.path });
  try {
    await db.run('DELETE FROM listing_images WHERE listing_id = ?', [req.params.id]);
    await db.run('DELETE FROM listings WHERE id = ?', [req.params.id]);
    res.redirect('/admin/listings');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: manage users
app.get('/admin/users', isAdmin, async (req, res) => {
  try {
    const users = await db.all(`
      SELECT u.*, COUNT(b.id) as booking_count 
      FROM users u 
      LEFT JOIN bookings b ON b.email = u.email 
      GROUP BY u.id 
      ORDER BY u.created_at DESC
    `);
    res.render('admin_users', { users });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: view user bookings
app.get('/admin/users/:id/bookings', isAdmin, async (req, res) => {
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).send('User not found');
    
    const bookings = await db.all(
      'SELECT b.*, l.title FROM bookings b JOIN listings l ON b.listing_id = l.id WHERE b.email = ? ORDER BY b.created_at DESC',
      [user.email]
    );
    res.render('admin_user_bookings', { bookings, userName: user.name });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: delete user
app.post('/admin/users/:id/delete', isAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM users WHERE id = ? AND role != "admin"', [req.params.id]);
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: view contacts
app.get('/admin/contacts', isAdmin, async (req, res) => {
  try {
    const contacts = await db.all('SELECT * FROM contacts ORDER BY created_at DESC');
    res.render('admin_contacts', { contacts });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: delete contact
app.post('/admin/contacts/:id/delete', isAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM contacts WHERE id = ?', [req.params.id]);
    res.redirect('/admin/contacts');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: approve booking
app.post('/admin/bookings/:id/approve', isAdmin, async (req, res) => {
  try {
    // Get booking and listing details
    const booking = await db.get('SELECT b.*, l.title, l.location, l.price FROM bookings b JOIN listings l ON b.listing_id = l.id WHERE b.id = ?', [req.params.id]);
    
    if (!booking) {
      console.error('Booking not found:', req.params.id);
      return res.status(404).send('Booking not found');
    }
    
    console.log('Approving booking:', booking);
    
    // Update booking status
    await db.run('UPDATE bookings SET status = ? WHERE id = ?', ['approved', req.params.id]);
    console.log('Booking status updated to approved');
    
    // Send approval email (don't let email failure stop the approval)
    try {
      const emailSent = await sendBookingApprovalEmail(booking, booking);
      if (emailSent) {
        console.log('Approval email sent successfully');
      } else {
        console.warn('Approval email failed but booking still approved');
      }
    } catch (emailErr) {
      console.error('Email error (booking still approved):', emailErr.message);
    }
    
    res.redirect('/admin/bookings');
  } catch (err) {
    console.error('Error approving booking:', err.message, err);
    res.status(500).send('Server error: ' + err.message);
  }
});

// Admin: deny booking
app.post('/admin/bookings/:id/deny', isAdmin, async (req, res) => {
  try {
    // Get booking and listing details
    const booking = await db.get('SELECT b.*, l.title, l.location, l.price FROM bookings b JOIN listings l ON b.listing_id = l.id WHERE b.id = ?', [req.params.id]);
    
    if (!booking) {
      console.error('Booking not found:', req.params.id);
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

// Admin: edit booking form
app.get('/admin/bookings/:id/edit', isAdmin, async (req, res) => {
  try {
    const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    if (!booking) return res.status(404).send('Booking not found');
    
    const listing = await db.get('SELECT * FROM listings WHERE id = ?', [booking.listing_id]);
    res.render('admin_booking_edit', { booking, listing });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: update booking
app.post('/admin/bookings/:id/update', isAdmin, async (req, res) => {
  try {
    const { checkin_date, checkin_time, checkout_date, checkout_time, status } = req.body;
    const checkin = `${checkin_date} ${checkin_time}`;
    const checkout = `${checkout_date} ${checkout_time}`;
    
    // Get original booking data before update
    const originalBooking = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    const listing = await db.get('SELECT * FROM listings WHERE id = ?', [originalBooking.listing_id]);
    
    // Update booking
    await db.run(
      'UPDATE bookings SET checkin = ?, checkout = ?, status = ? WHERE id = ?',
      [checkin, checkout, status, req.params.id]
    );
    
    // Check if status changed to cancelled
    const statusChanged = originalBooking.status !== status;
    if (statusChanged && status === 'cancelled') {
      // Send cancellation email
      const updatedBooking = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
      await sendBookingCancellationEmail(updatedBooking, listing);
    } else {
      // Check if dates changed
      const datesChanged = originalBooking.checkin !== checkin || originalBooking.checkout !== checkout;
      
      // Send email notification if dates changed
      if (datesChanged) {
        const updatedBooking = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
        await sendBookingDateChangeEmail(updatedBooking, listing, originalBooking.checkin, originalBooking.checkout);
      }
    }
    
    res.redirect('/admin/bookings');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: delete booking
app.post('/admin/bookings/:id/delete', isAdmin, async (req, res) => {
  try {
    // Get booking and listing details before deletion
    const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    const listing = await db.get('SELECT * FROM listings WHERE id = ?', [booking.listing_id]);
    
    // Send cancellation email
    await sendBookingCancellationEmail(booking, listing);
    
    // Delete booking
    await db.run('DELETE FROM bookings WHERE id = ?', [req.params.id]);
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
