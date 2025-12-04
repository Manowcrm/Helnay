require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const BetterSqlite3 = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const db = require('./db');
const { backupDatabase } = require('./s3-backup');
const expressLayouts = require('express-ejs-layouts');
const { isAuthenticated, isAdmin, isSuperAdmin } = require('./auth-middleware');
const { sendBookingApprovalEmail, sendBookingDenialEmail, sendBookingDateChangeEmail, sendBookingCancellationEmail, sendContactNotificationToAdmin, sendWelcomeEmail, sendContactReply, sendVerificationEmail } = require('./email-service');
const { logActivity, getClientIP, getActivityLogs, getActivityStats } = require('./activity-logger');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const {
  loginLimiter,
  registerLimiter,
  contactLimiter,
  apiLimiter,
  passwordResetLimiter,
  registerValidation,
  loginValidation,
  listingValidation,
  bookingValidation,
  contactValidation,
  handleValidationErrors
} = require('./security-middleware');
const { csrfProtection, verifyCsrfToken, handleCsrfError } = require('./csrf-middleware');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for now to allow inline scripts
  crossOriginEmbedderPolicy: false
}));

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
const fs = require('fs');
const sessionDbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data');
const sessionDbFile = path.join(sessionDbPath, 'sessions.db');

// Ensure directory exists for session database too
if (!fs.existsSync(sessionDbPath)) {
  fs.mkdirSync(sessionDbPath, { recursive: true });
}

const sessionDb = new BetterSqlite3(sessionDbFile);
console.log('✅ Session database at:', sessionDbFile);

app.use(session({
  store: new SqliteStore({
    client: sessionDb,
    expired: {
      clear: true,
      intervalMs: 24 * 60 * 60 * 1000 // Check once per day for expired sessions
    }
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // true on HTTPS (Render), false locally
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days - users stay logged in for a month
    sameSite: 'lax'
  },
  rolling: true // Extend session on each request - resets the 30 day timer
}));

// CSRF Protection - generate token for all requests
app.use(csrfProtection);

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
  res.render('register', { message: null, error: null, csrfToken: res.locals.csrfToken });
});

app.post('/register', registerLimiter, verifyCsrfToken, registerValidation, handleValidationErrors, async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;
    
    console.log(`[REGISTRATION] Attempt for email: ${email}`);
    
    if (password !== confirmPassword) {
      console.log('[REGISTRATION] Error: Passwords do not match');
      return res.render('register', { message: null, error: 'Passwords do not match' });
    }
    
    // Check if user already exists
    const existingUser = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      console.log(`[REGISTRATION] Error: Email already registered: ${email}`);
      return res.render('register', { message: null, error: 'Email already registered' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('[REGISTRATION] Password hashed successfully');
    
    // Create user (is_verified = 0 by default)
    const result = await db.run(
      'INSERT INTO users (name, email, password, role, is_verified, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, 'user', 0, new Date().toISOString()]
    );
    
    const userId = result.lastInsertRowid;
    console.log(`[REGISTRATION] User created successfully with ID: ${userId}`);
    
    // Generate verification token
    const crypto = require('crypto');
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    
    // Store verification token
    await db.run(
      'INSERT INTO email_verifications (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)',
      [userId, verificationToken, expiresAt, new Date().toISOString()]
    );
    console.log(`[REGISTRATION] Verification token created for user ID: ${userId}`);
    
    // Send verification email (always send, even if verification is disabled)
    console.log(`[REGISTRATION] Attempting to send verification email to: ${email}`);
    sendVerificationEmail({ name, email }, verificationToken)
      .then(() => {
        console.log(`[REGISTRATION] ✓ Verification email sent successfully to: ${email}`);
      })
      .catch(err => {
        console.error(`[REGISTRATION] ⚠️ Verification email failed for ${email}:`, err.message);
      });
    
    const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
    
    if (!requireVerification) {
      // Auto-verify if verification is disabled for testing
      await db.run('UPDATE users SET is_verified = 1 WHERE id = ?', [userId]);
      console.log(`[REGISTRATION] User auto-verified (verification disabled)`);
    }
    
    console.log(`[REGISTRATION] ✅ Registration complete for: ${email}`);
    res.render('register', { 
      message: '✅ Registration successful! <br><br>📧 <strong>IMPORTANT:</strong> A verification email has been sent to <strong>' + email + '</strong><br><br>Please check your inbox (and spam/junk folder) and click the verification link to activate your account.<br><br>⚠️ You must verify your email before you can log in.', 
      error: null 
    });
  } catch (err) {
    console.error('[REGISTRATION] ERROR:', err);
    console.error('[REGISTRATION] Stack trace:', err.stack);
    res.render('register', { message: null, error: 'Registration failed. Please try again.' });
  }
});

// Login page
app.get('/login', (req, res) => {
  res.render('login', { message: null, error: null, csrfToken: res.locals.csrfToken });
});

app.post('/login', loginLimiter, verifyCsrfToken, loginValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;
    
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
    
    // Check if account is active
    if (user.is_active === 0) {
      return res.render('login', { message: null, error: 'Your account has been deactivated. Please contact the system administrator.' });
    }
    
    // Check if email is verified (only for regular users, not admins)
    // Skip verification check if REQUIRE_EMAIL_VERIFICATION is set to 'false'
    const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
    if (requireVerification && user.role !== 'admin' && user.is_verified === 0) {
      return res.render('login', { 
        message: null, 
        error: '⚠️ <strong>Email Not Verified</strong><br><br>Your account is not yet activated. Please check your email inbox (including spam/junk folder) for the verification link we sent to <strong>' + email + '</strong>.<br><br>📧 Click the link in the email to verify your account, then try logging in again.<br><br>Didn\'t receive the email? <a href="/resend-verification?email=' + encodeURIComponent(email) + '" class="alert-link">Click here to resend</a>' 
      });
    }
    
    // Update last_login timestamp
    await db.run('UPDATE users SET last_login = ? WHERE id = ?', [new Date().toISOString(), user.id]);
    
    // Set session
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    req.session.role = user.role;
    req.session.adminLevel = user.admin_level;
    
    // Log admin login
    if (user.role === 'admin') {
      await logActivity({
        admin_id: user.id,
        admin_name: user.name,
        admin_email: user.email,
        action_type: 'LOGIN',
        action_description: 'Logged in to admin panel',
        ip_address: getClientIP(req)
      });
    }
    
    // Save session before redirect
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.render('login', { message: null, error: 'Login failed' });
      }
      
      console.log('[LOGIN] Session saved successfully:', {
        userId: req.session.userId,
        role: req.session.role,
        adminLevel: req.session.adminLevel,
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
    
    // Get active filter services grouped by category
    const filterServices = await db.all('SELECT * FROM filter_services WHERE is_active = 1 ORDER BY category, display_order, name');
    const filtersByCategory = filterServices.reduce((acc, filter) => {
      if (!acc[filter.category]) {
        acc[filter.category] = [];
      }
      acc[filter.category].push(filter);
      return acc;
    }, {});
    
    // Attach services to each listing for filtering
    for (const listing of listings) {
      const services = await db.all(
        `SELECT fs.filter_key, fs.name, fs.icon 
         FROM listing_services ls 
         JOIN filter_services fs ON ls.service_id = fs.id 
         WHERE ls.listing_id = ?`,
        [listing.id]
      );
      listing.services = services;
      listing.serviceKeys = services.map(s => s.filter_key).join(',');
    }
    
    // Get active browse categories for homepage
    const browseCategories = await db.all('SELECT * FROM browse_categories WHERE is_active = 1 ORDER BY display_order ASC');
    
    // Prevent browser caching to ensure fresh prices
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.render('index', { listings, query: req.query, filtersByCategory, browseCategories });
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

// Resend Verification Email (with rate limiting)
app.get('/resend-verification', passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.render('login', { 
        message: null, 
        error: '⚠️ Please provide your email address to resend verification.' 
      });
    }
    
    // Find user
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    
    if (!user) {
      // Don't reveal whether email exists for security
      return res.render('login', { 
        message: '✅ If an account exists with that email, a verification link has been sent.', 
        error: null 
      });
    }
    
    if (user.is_verified === 1) {
      return res.render('login', { 
        message: '✅ Your account is already verified! You can log in now.', 
        error: null 
      });
    }
    
    // Generate new verification token
    const crypto = require('crypto');
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    // Invalidate old tokens and create new one
    await db.run('DELETE FROM email_verifications WHERE user_id = ?', [user.id]);
    await db.run(
      'INSERT INTO email_verifications (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)',
      [user.id, verificationToken, expiresAt, new Date().toISOString()]
    );
    
    // Send verification email
    await sendVerificationEmail({ name: user.name, email: user.email }, verificationToken);
    
    res.render('login', { 
      message: '✅ Verification email sent! Please check your inbox (and spam folder) for the verification link.', 
      error: null 
    });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.render('login', { 
      message: null, 
      error: 'Failed to resend verification email. Please try again later.' 
    });
  }
});

// Email Verification
app.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Find verification record
    const verification = await db.get(
      'SELECT * FROM email_verifications WHERE token = ? AND verified_at IS NULL',
      [token]
    );
    
    if (!verification) {
      return res.render('error', { 
        message: 'Invalid or expired verification link. Please request a new verification email.', 
        error: { status: 400 }
      });
    }
    
    // Check if token has expired
    if (new Date(verification.expires_at) < new Date()) {
      return res.render('error', { 
        message: 'This verification link has expired. Please request a new verification email.', 
        error: { status: 400 }
      });
    }
    
    // Mark email as verified
    await db.run(
      'UPDATE email_verifications SET verified_at = ? WHERE id = ?',
      [new Date().toISOString(), verification.id]
    );
    
    await db.run(
      'UPDATE users SET is_verified = 1 WHERE id = ?',
      [verification.user_id]
    );
    
    console.log(`✓ Email verified for user ID: ${verification.user_id}`);
    
    res.render('login', { 
      message: 'Email verified successfully! You can now log in to your account.', 
      error: null 
    });
  } catch (err) {
    console.error('Email verification error:', err);
    res.render('error', { 
      message: 'Verification failed. Please try again or contact support.', 
      error: { status: 500 }
    });
  }
});
app.post('/contact', contactLimiter, verifyCsrfToken, contactValidation, handleValidationErrors, async (req, res) => {
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
    
    // Get services/amenities from database
    const amenities = await db.all(
      `SELECT fs.name, fs.icon 
       FROM listing_services ls 
       JOIN filter_services fs ON ls.service_id = fs.id 
       WHERE ls.listing_id = ? 
       ORDER BY fs.category, fs.display_order, fs.name`,
      [id]
    );
    
    // Prevent browser caching
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.render('listing', { listing, images, amenities });
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
    const listings = await db.all('SELECT id, title, price, location FROM listings');
    const selectedListingId = req.query.listing_id || null;
    
    console.log(`📋 [BOOKING FORM] Loading with listing_id=${selectedListingId}`);
    
    res.render('bookings', { 
      listings, 
      selectedListingId: selectedListingId ? parseInt(selectedListingId) : null,
      message: null,
      error: null,
      csrfToken: res.locals.csrfToken,
      formData: {}
    });
  } catch (err) {
    console.error('[BOOKING] Error loading form:', err);
    res.status(500).send('Server error');
  }
});
app.post('/bookings', verifyCsrfToken, bookingValidation, handleValidationErrors, async (req, res) => {
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
    
    // Create booking with payment_status = 'unpaid' and current price snapshot
    const result = await db.run(
      'INSERT INTO bookings (listing_id,name,email,checkin,checkout,payment_status,total_amount,created_at) VALUES (?,?,?,?,?,?,?,?)',
      [listing_id, name, email, checkin, checkout, 'unpaid', totalAmount, new Date().toISOString()]
    );
    
    const bookingId = result.lastInsertRowid;
    console.log(`✅ [BOOKING] Created booking ID: ${bookingId}`);
    console.log(`✅ [BOOKING] Stored snapshot: $${listing.price}/night, Total: $${totalAmount}`);
    
    // Redirect to payment page
    res.redirect(`/payment/${bookingId}`);
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
    
    // Calculate nights and total from CURRENT listing price
    const checkinDate = new Date(booking.checkin);
    const checkoutDate = new Date(booking.checkout);
    const nights = Math.ceil((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));
    const totalAmount = nights * booking.price; // Use current price from listing, not stored total_amount
    
    console.log(`💳 [PAYMENT PAGE] ========================================`);
    console.log(`💳 [PAYMENT PAGE] Booking ID: ${bookingId}`);
    console.log(`💳 [PAYMENT PAGE] Stored total_amount in DB: $${booking.total_amount}`);
    console.log(`💳 [PAYMENT PAGE] Current listing price: $${booking.price}/night`);
    console.log(`💳 [PAYMENT PAGE] Calculation: ${nights} nights × $${booking.price} = $${totalAmount}`);
    console.log(`💳 [PAYMENT PAGE] Sending to template: $${totalAmount} (CURRENT PRICE)`);
    console.log(`💳 [PAYMENT PAGE] ========================================`);
    
    // Prevent browser caching
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.render('payment', {
      booking: { ...booking, total_amount: totalAmount }, // Override stored amount with current calculation
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
      'SELECT b.*, l.title, l.price FROM bookings b JOIN listings l ON b.listing_id = l.id WHERE b.id = ?',
      [bookingId]
    );
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    if (booking.payment_status === 'paid') {
      return res.status(400).json({ error: 'Booking already paid' });
    }
    
    // Recalculate total from CURRENT listing price
    const checkinDate = new Date(booking.checkin);
    const checkoutDate = new Date(booking.checkout);
    const nights = Math.ceil((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));
    const totalAmount = nights * booking.price;
    
    console.log(`💳 [STRIPE PAYMENT INTENT] ========================================`);
    console.log(`💳 [STRIPE] Booking ID: ${bookingId}`);
    console.log(`💳 [STRIPE] Stored total in DB: $${booking.total_amount}`);
    console.log(`💳 [STRIPE] Current listing price: $${booking.price}/night`);
    console.log(`💳 [STRIPE] Recalculation: ${nights} nights × $${booking.price} = $${totalAmount}`);
    console.log(`💳 [STRIPE] Creating PaymentIntent for: $${totalAmount} (${Math.round(totalAmount * 100)} cents)`);
    console.log(`💳 [STRIPE] ========================================`);
    
    // Create Stripe PaymentIntent with CURRENT PRICE
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Convert to cents, using CURRENT price
      currency: 'usd',
      metadata: {
        booking_id: bookingId,
        listing_title: booking.title,
        customer_email: booking.email,
        customer_name: booking.name,
        nights: nights.toString(),
        price_per_night: booking.price.toString(),
        total_amount: totalAmount.toString()
      },
      description: `${booking.title} - ${nights} night${nights > 1 ? 's' : ''} @ $${booking.price}/night`,
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
// ====== ADMIN TEAM MANAGEMENT (Super Admin Only) ======

// View admin team
app.get('/admin/team', isSuperAdmin, async (req, res) => {
  try {
    const admins = await db.all(`
      SELECT u.*, creator.name as creator_name 
      FROM users u
      LEFT JOIN users creator ON u.created_by = creator.id
      WHERE u.role = 'admin'
      ORDER BY u.created_at DESC
    `);
    
    res.render('admin_team', { 
      admins,
      currentUserId: req.session.userId,
      message: req.session.message || null
    });
    delete req.session.message;
  } catch (err) {
    console.error('❌ [ADMIN TEAM] Error:', err.message);
    res.status(500).send('Error loading admin team');
  }
});

// Create new admin
app.post('/admin/team/create', isSuperAdmin, async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;
    
    if (!name || !email || !password) {
      req.session.message = { type: 'danger', text: 'All fields are required' };
      return res.redirect('/admin/team');
    }
    
    if (password !== confirmPassword) {
      req.session.message = { type: 'danger', text: 'Passwords do not match' };
      return res.redirect('/admin/team');
    }
    
    // Password validation
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      req.session.message = { type: 'danger', text: 'Password must be at least 8 characters with 1 uppercase, 1 number, and 1 special character' };
      return res.redirect('/admin/team');
    }
    
    // Check if email already exists
    const existingUser = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      req.session.message = { type: 'danger', text: 'Email already registered' };
      return res.redirect('/admin/team');
    }
    
    // Hash password and create admin
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (name, email, password, role, admin_level, created_by, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, 'admin', 'admin', req.session.userId, 1, new Date().toISOString()]
    );
    
    // Log activity
    await logActivity({
      admin_id: req.session.userId,
      admin_name: req.session.userName,
      admin_email: req.session.userEmail,
      action_type: 'CREATE_ADMIN',
      action_description: `Created new admin: ${name} (${email})`,
      target_type: 'user',
      target_id: result.lastInsertRowid,
      ip_address: getClientIP(req)
    });
    
    req.session.message = { type: 'success', text: `Admin ${name} created successfully` };
    res.redirect('/admin/team');
  } catch (err) {
    console.error('❌ [CREATE ADMIN] Error:', err.message);
    req.session.message = { type: 'danger', text: 'Failed to create admin' };
    res.redirect('/admin/team');
  }
});

// Edit admin
app.post('/admin/team/:id/edit', isSuperAdmin, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const adminId = req.params.id;
    
    // Prevent editing super admin or self
    const targetAdmin = await db.get('SELECT * FROM users WHERE id = ?', [adminId]);
    if (!targetAdmin || targetAdmin.admin_level === 'super_admin' || targetAdmin.id === req.session.userId) {
      req.session.message = { type: 'danger', text: 'Cannot edit this admin' };
      return res.redirect('/admin/team');
    }
    
    if (password) {
      // Update with new password
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.run(
        'UPDATE users SET name = ?, email = ?, password = ? WHERE id = ?',
        [name, email, hashedPassword, adminId]
      );
    } else {
      // Update without changing password
      await db.run(
        'UPDATE users SET name = ?, email = ? WHERE id = ?',
        [name, email, adminId]
      );
    }
    
    // Log activity
    await logActivity({
      admin_id: req.session.userId,
      admin_name: req.session.userName,
      admin_email: req.session.userEmail,
      action_type: 'UPDATE_ADMIN',
      action_description: `Updated admin: ${name}`,
      target_type: 'user',
      target_id: adminId,
      ip_address: getClientIP(req)
    });
    
    req.session.message = { type: 'success', text: 'Admin updated successfully' };
    res.redirect('/admin/team');
  } catch (err) {
    console.error('❌ [EDIT ADMIN] Error:', err.message);
    req.session.message = { type: 'danger', text: 'Failed to update admin' };
    res.redirect('/admin/team');
  }
});

// Deactivate admin
app.post('/admin/team/:id/deactivate', isSuperAdmin, async (req, res) => {
  try {
    const adminId = req.params.id;
    
    // Prevent deactivating super admin or self
    const targetAdmin = await db.get('SELECT * FROM users WHERE id = ?', [adminId]);
    if (!targetAdmin || targetAdmin.admin_level === 'super_admin' || targetAdmin.id === req.session.userId) {
      req.session.message = { type: 'danger', text: 'Cannot deactivate this admin' };
      return res.redirect('/admin/team');
    }
    
    await db.run('UPDATE users SET is_active = 0 WHERE id = ?', [adminId]);
    
    // Log activity
    await logActivity({
      admin_id: req.session.userId,
      admin_name: req.session.userName,
      admin_email: req.session.userEmail,
      action_type: 'DEACTIVATE_ADMIN',
      action_description: `Deactivated admin: ${targetAdmin.name}`,
      target_type: 'user',
      target_id: adminId,
      ip_address: getClientIP(req)
    });
    
    req.session.message = { type: 'warning', text: 'Admin deactivated successfully' };
    res.redirect('/admin/team');
  } catch (err) {
    console.error('❌ [DEACTIVATE ADMIN] Error:', err.message);
    req.session.message = { type: 'danger', text: 'Failed to deactivate admin' };
    res.redirect('/admin/team');
  }
});

// Activate admin
app.post('/admin/team/:id/activate', isSuperAdmin, async (req, res) => {
  try {
    const adminId = req.params.id;
    const targetAdmin = await db.get('SELECT * FROM users WHERE id = ?', [adminId]);
    
    await db.run('UPDATE users SET is_active = 1 WHERE id = ?', [adminId]);
    
    // Log activity
    await logActivity({
      admin_id: req.session.userId,
      admin_name: req.session.userName,
      admin_email: req.session.userEmail,
      action_type: 'ACTIVATE_ADMIN',
      action_description: `Reactivated admin: ${targetAdmin.name}`,
      target_type: 'user',
      target_id: adminId,
      ip_address: getClientIP(req)
    });
    
    req.session.message = { type: 'success', text: 'Admin reactivated successfully' };
    res.redirect('/admin/team');
  } catch (err) {
    console.error('❌ [ACTIVATE ADMIN] Error:', err.message);
    req.session.message = { type: 'danger', text: 'Failed to reactivate admin' };
    res.redirect('/admin/team');
  }
});

// ====== ACTIVITY LOG VIEWER (Super Admin Only) ======

app.get('/admin/activity', isSuperAdmin, async (req, res) => {
  try {
    const adminId = req.query.admin_id ? parseInt(req.query.admin_id) : null;
    
    const logs = await getActivityLogs({
      admin_id: adminId,
      limit: 200
    });
    
    const stats = await getActivityStats();
    
    let filterAdmin = null;
    if (adminId) {
      filterAdmin = await db.get('SELECT id, name as admin_name, email FROM users WHERE id = ?', [adminId]);
    }
    
    res.render('admin_activity', { 
      logs,
      stats,
      filterAdmin
    });
  } catch (err) {
    console.error('❌ [ACTIVITY LOG] Error:', err.message);
    res.status(500).send('Error loading activity logs');
  }
});

// Browse Categories Management (Super Admin Only)
app.get('/admin/categories', isSuperAdmin, async (req, res) => {
  try {
    const categories = await db.all('SELECT * FROM browse_categories ORDER BY display_order ASC');
    res.render('admin_categories', { categories });
  } catch (err) {
    console.error('❌ [CATEGORIES] Error loading categories:', err.message);
    res.status(500).send('Error loading categories');
  }
});

// Create new category
app.post('/admin/categories/create', isSuperAdmin, async (req, res) => {
  try {
    const { title, description, filter_params, image_url, display_order } = req.body;
    
    await db.run(
      'INSERT INTO browse_categories (title, description, filter_params, image_url, display_order, is_active, created_at) VALUES (?,?,?,?,?,?,?)',
      [title, description, filter_params, image_url, display_order || 99, 1, new Date().toISOString()]
    );
    
    await logActivity({
      admin_id: req.session.user_id,
      action_type: 'CREATE',
      action_description: `Created new browse category: ${title}`,
      target_type: 'browse_category',
      ip_address: getClientIP(req)
    });
    
    res.redirect('/admin/categories');
  } catch (err) {
    console.error('❌ [CATEGORIES] Error creating category:', err.message);
    res.status(500).send('Error creating category');
  }
});

// Update category
app.post('/admin/categories/:id/edit', isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, filter_params, image_url, display_order } = req.body;
    
    await db.run(
      'UPDATE browse_categories SET title=?, description=?, filter_params=?, image_url=?, display_order=? WHERE id=?',
      [title, description, filter_params, image_url, display_order, id]
    );
    
    await logActivity({
      admin_id: req.session.user_id,
      action_type: 'UPDATE',
      action_description: `Updated browse category: ${title}`,
      target_type: 'browse_category',
      target_id: id,
      ip_address: getClientIP(req)
    });
    
    res.redirect('/admin/categories');
  } catch (err) {
    console.error('❌ [CATEGORIES] Error updating category:', err.message);
    res.status(500).send('Error updating category');
  }
});

// Toggle category active status
app.post('/admin/categories/:id/toggle', isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const category = await db.get('SELECT * FROM browse_categories WHERE id = ?', [id]);
    
    if (!category) {
      return res.status(404).send('Category not found');
    }
    
    const newStatus = category.is_active === 1 ? 0 : 1;
    await db.run('UPDATE browse_categories SET is_active = ? WHERE id = ?', [newStatus, id]);
    
    await logActivity({
      admin_id: req.session.user_id,
      action_type: 'UPDATE',
      action_description: `${newStatus === 1 ? 'Activated' : 'Deactivated'} browse category: ${category.title}`,
      target_type: 'browse_category',
      target_id: id,
      ip_address: getClientIP(req)
    });
    
    res.redirect('/admin/categories');
  } catch (err) {
    console.error('❌ [CATEGORIES] Error toggling category:', err.message);
    res.status(500).send('Error toggling category');
  }
});

// Delete category
app.post('/admin/categories/:id/delete', isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const category = await db.get('SELECT title FROM browse_categories WHERE id = ?', [id]);
    
    if (!category) {
      return res.status(404).send('Category not found');
    }
    
    await db.run('DELETE FROM browse_categories WHERE id = ?', [id]);
    
    await logActivity({
      admin_id: req.session.user_id,
      action_type: 'DELETE',
      action_description: `Deleted browse category: ${category.title}`,
      target_type: 'browse_category',
      target_id: id,
      ip_address: getClientIP(req)
    });
    
    res.redirect('/admin/categories');
  } catch (err) {
    console.error('❌ [CATEGORIES] Error deleting category:', err.message);
    res.status(500).send('Error deleting category');
  }
});

// Admin Users Management
app.get('/admin/users', isAdmin, async (req, res) => {
  try {
    const users = await db.all('SELECT id, name, email, role, created_at, last_login FROM users ORDER BY created_at DESC');
    res.render('admin_users', { users });
  } catch (err) {
    console.error('❌ [ADMIN USERS] Error:', err.message, err);
    res.status(500).send('Error loading users');
  }
});

app.get('/admin', isAdmin, async (req, res) => {
  try {
    console.log('📊 [ADMIN DASHBOARD] Loading dashboard...');
    
    const listingsResult = await db.get('SELECT COUNT(*) as count FROM listings');
    console.log('  Listings count:', listingsResult);
    
    const bookingsResult = await db.get('SELECT COUNT(*) as count FROM bookings');
    console.log('  Bookings count:', bookingsResult);
    
    const usersResult = await db.get('SELECT COUNT(*) as count FROM users');
    console.log('  Users count:', usersResult);
    
    const contactsResult = await db.get('SELECT COUNT(*) as count FROM contacts');
    console.log('  Contacts count:', contactsResult);
    
    const pendingResult = await db.get("SELECT COUNT(*) as count FROM bookings WHERE status IS NULL OR status = 'pending'");
    console.log('  Pending bookings count:', pendingResult);
    
    const stats = {
      listings: listingsResult?.count || 0,
      bookings: bookingsResult?.count || 0,
      users: usersResult?.count || 0,
      contacts: contactsResult?.count || 0,
      pendingBookings: pendingResult?.count || 0
    };
    
    console.log('✅ [ADMIN DASHBOARD] Stats:', stats);
    res.render('admin_dashboard', { 
      stats,
      isSuperAdmin: req.session.adminLevel === 'super_admin'
    });
  } catch (err) {
    console.error('❌ [ADMIN DASHBOARD] Error:', err.message, err);
    res.status(500).send('Server error: ' + err.message);
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
    
    // Prevent caching to show latest prices
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache'
    });
    
    res.render('admin_listings', { listings });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: new listing form
app.get('/admin/listings/new', isAdmin, async (req, res) => {
  try {
    const filterServices = await db.all('SELECT * FROM filter_services ORDER BY category, display_order, name');
    const filtersByCategory = filterServices.reduce((acc, filter) => {
      if (!acc[filter.category]) {
        acc[filter.category] = [];
      }
      acc[filter.category].push(filter);
      return acc;
    }, {});
    
    res.render('admin_listing_form', { listing: {}, images: [], filtersByCategory, selectedServices: [] });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: create listing
app.post('/admin/listings/create', isAdmin, async (req, res) => {
  try {
    const { title, location, price, description, services } = req.body;
    console.log('Creating new listing:', { title, location, price, description });
    const result = await db.run(
      'INSERT INTO listings (title, location, price, description, created_at) VALUES (?, ?, ?, ?, ?)',
      [title, location, price, description, new Date().toISOString()]
    );
    const listingId = result.lastID;
    console.log('Listing created successfully with ID:', listingId);
    
    // Save selected services
    if (services) {
      const serviceIds = Array.isArray(services) ? services : [services];
      for (const serviceId of serviceIds) {
        await db.run(
          'INSERT OR IGNORE INTO listing_services (listing_id, service_id) VALUES (?, ?)',
          [listingId, serviceId]
        );
      }
      console.log(`Saved ${serviceIds.length} services for listing ${listingId}`);
    }
    
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
    
    // Load all filter services grouped by category
    const filterServices = await db.all('SELECT * FROM filter_services ORDER BY category, display_order, name');
    const filtersByCategory = filterServices.reduce((acc, filter) => {
      if (!acc[filter.category]) {
        acc[filter.category] = [];
      }
      acc[filter.category].push(filter);
      return acc;
    }, {});
    
    // Load selected services for this listing
    const selectedServicesRows = await db.all('SELECT service_id FROM listing_services WHERE listing_id = ?', [req.params.id]);
    const selectedServices = selectedServicesRows.map(row => row.service_id);
    
    res.render('admin_listing_form', { listing, images, filtersByCategory, selectedServices });
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
    const { title, location, price, description, services } = req.body;
    const listingId = req.params.id;
    
    // Log before update
    const beforeUpdate = await db.get('SELECT * FROM listings WHERE id = ?', [listingId]);
    console.log('🔧 [ADMIN UPDATE] BEFORE:', { 
      id: listingId, 
      oldPrice: beforeUpdate?.price,
      newPrice: price,
      formData: req.body 
    });
    
    // Convert price to number to ensure proper storage
    const priceNumber = parseFloat(price);
    
    console.log('🔧 [ADMIN UPDATE] Parsed price:', { original: price, parsed: priceNumber, type: typeof priceNumber });
    
    // Perform update
    const result = await db.run(
      'UPDATE listings SET title = ?, location = ?, price = ?, description = ? WHERE id = ?',
      [title, location, priceNumber, description, listingId]
    );
    
    console.log('📝 [ADMIN UPDATE] UPDATE result:', { 
      changes: result.changes,
      listingId: listingId
    });
    
    // Update services - delete old ones and insert new ones
    await db.run('DELETE FROM listing_services WHERE listing_id = ?', [listingId]);
    if (services) {
      const serviceIds = Array.isArray(services) ? services : [services];
      for (const serviceId of serviceIds) {
        await db.run(
          'INSERT OR IGNORE INTO listing_services (listing_id, service_id) VALUES (?, ?)',
          [listingId, serviceId]
        );
      }
      console.log(`✅ [ADMIN UPDATE] Updated ${serviceIds.length} services for listing ${listingId}`);
    } else {
      console.log('✅ [ADMIN UPDATE] Removed all services for listing ${listingId}');
    }
    
    // Wait a moment for database to commit (better-sqlite3 is sync, but just to be safe)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify the update worked TWICE to ensure persistence
    const afterUpdate1 = await db.get('SELECT * FROM listings WHERE id = ?', [listingId]);
    console.log('✅ [ADMIN UPDATE] AFTER (immediate check):', { 
      id: listingId,
      price: afterUpdate1.price,
      title: afterUpdate1.title,
      location: afterUpdate1.location,
      updateSuccessful: afterUpdate1.price == priceNumber
    });
    
    // Second verification after delay
    await new Promise(resolve => setTimeout(resolve, 100));
    const afterUpdate2 = await db.get('SELECT * FROM listings WHERE id = ?', [listingId]);
    console.log('✅ [ADMIN UPDATE] AFTER (delayed check):', { 
      price: afterUpdate2.price,
      stillCorrect: afterUpdate2.price == priceNumber
    });
    
    if (result.changes === 0) {
      console.warn('⚠️ [ADMIN UPDATE] No rows were updated! Listing may not exist.');
    }
    
    if (afterUpdate2.price != priceNumber) {
      console.error('❌ [ADMIN UPDATE] PRICE MISMATCH! Expected:', priceNumber, 'Got:', afterUpdate2.price);
    } else {
      console.log('✅ [ADMIN UPDATE] SUCCESS! Price updated correctly to $' + priceNumber);
    }
    
    // Force a small delay to ensure all writes are complete
    await new Promise(resolve => setTimeout(resolve, 50));
    
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
    const userId = req.params.id;
    
    // Get the user to be deleted
    const userToDelete = await db.get('SELECT id, email, role FROM users WHERE id = ?', [userId]);
    
    if (!userToDelete) {
      console.error(`[DELETE USER] User ${userId} not found`);
      return res.status(404).send('User not found');
    }
    
    // Prevent deletion of admin and super_admin accounts
    if (userToDelete.role === 'admin' || userToDelete.role === 'super_admin') {
      console.error(`[DELETE USER] Attempted to delete ${userToDelete.role} account: ${userToDelete.email}`);
      return res.status(403).send('Cannot delete admin accounts');
    }
    
    // Only super_admin can delete users
    if (req.session.role !== 'super_admin') {
      console.error(`[DELETE USER] Non-super-admin attempted deletion: ${req.session.email}`);
      return res.status(403).send('Only super administrators can delete users');
    }
    
    // Delete the user
    await db.run('DELETE FROM users WHERE id = ?', [userId]);
    console.log(`[DELETE USER] ✓ User deleted: ${userToDelete.email} (ID: ${userId})`);
    
    res.redirect('/admin/users');
  } catch (err) {
    console.error('[DELETE USER] Error:', err);
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

// Admin: reply to contact
app.post('/admin/contacts/:id/reply', isAdmin, async (req, res) => {
  try {
    const { subject, reply, to_email, to_name } = req.body;
    
    if (!subject || !reply || !to_email || !to_name) {
      return res.status(400).send('Missing required fields');
    }

    // Send reply email
    const emailSent = await sendContactReply({
      subject,
      reply,
      to_email,
      to_name
    });

    if (emailSent) {
      console.log('✓ Reply sent successfully');
    } else {
      console.warn('⚠️ Reply email failed to send');
    }

    res.redirect('/admin/contacts');
  } catch (err) {
    console.error('Error sending reply:', err);
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

// Admin: manage filter services
app.get('/admin/filters', isAdmin, async (req, res) => {
  try {
    const filters = await db.all('SELECT * FROM filter_services ORDER BY category, display_order, name');
    
    // Group filters by category
    const filtersByCategory = filters.reduce((acc, filter) => {
      if (!acc[filter.category]) {
        acc[filter.category] = [];
      }
      acc[filter.category].push(filter);
      return acc;
    }, {});
    
    // Get browse categories
    const browseCategories = await db.all('SELECT * FROM browse_categories ORDER BY display_order ASC');
    
    res.render('admin_filters', { filters, filtersByCategory, browseCategories });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: add new filter
app.post('/admin/filters/create', isAdmin, async (req, res) => {
  try {
    const { category, name, icon, filter_key, display_order } = req.body;
    await db.run(
      'INSERT INTO filter_services (category, name, icon, filter_key, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [category, name, icon, filter_key, display_order || 0, 1, new Date().toISOString()]
    );
    res.redirect('/admin/filters');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: update filter
app.post('/admin/filters/:id/update', isAdmin, async (req, res) => {
  try {
    const { category, name, icon, filter_key, display_order, is_active } = req.body;
    await db.run(
      'UPDATE filter_services SET category = ?, name = ?, icon = ?, filter_key = ?, display_order = ?, is_active = ? WHERE id = ?',
      [category, name, icon, filter_key, display_order || 0, is_active === 'on' ? 1 : 0, req.params.id]
    );
    res.redirect('/admin/filters');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: toggle filter active status
app.post('/admin/filters/:id/toggle', isAdmin, async (req, res) => {
  try {
    const filter = await db.get('SELECT * FROM filter_services WHERE id = ?', [req.params.id]);
    await db.run(
      'UPDATE filter_services SET is_active = ? WHERE id = ?',
      [filter.is_active ? 0 : 1, req.params.id]
    );
    res.redirect('/admin/filters');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: delete filter
app.post('/admin/filters/:id/delete', isAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM filter_services WHERE id = ?', [req.params.id]);
    res.redirect('/admin/filters');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// ====== DIAGNOSTIC ENDPOINTS ======

// Check if user exists (for troubleshooting)
app.get('/admin/api/check-user', isAdmin, async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.json({ error: 'Email parameter required' });
    }
    
    const user = await db.get(
      'SELECT id, name, email, role, is_verified, is_active, created_at, last_login FROM users WHERE email = ?',
      [email]
    );
    
    if (!user) {
      return res.json({
        exists: false,
        email: email,
        message: 'User not found - needs to register'
      });
    }
    
    // Get verification tokens
    const tokens = await db.all(
      `SELECT token, expires_at, verified_at, created_at 
       FROM email_verifications 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [user.id]
    );
    
    const activeToken = tokens.find(t => !t.verified_at && new Date(t.expires_at) > new Date());
    
    res.json({
      exists: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_verified: user.is_verified === 1,
        is_active: user.is_active === 1,
        created_at: user.created_at,
        last_login: user.last_login
      },
      verification: {
        total_tokens_sent: tokens.length,
        active_token: activeToken ? {
          created: activeToken.created_at,
          expires: activeToken.expires_at,
          link: `${process.env.BASE_URL || 'http://localhost:3000'}/verify-email/${activeToken.token}`
        } : null
      }
    });
  } catch (err) {
    console.error('Check user error:', err);
    res.status(500).json({ error: 'Server error' });
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
