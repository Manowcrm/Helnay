require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const morgan = require('morgan');
const logger = require('./logger');
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
const { getUserVerificationStatus, calculateTrustScore } = require('./verification-service');
const uploadConfig = require('./upload-config');

// Validate required environment variables in production
if (process.env.NODE_ENV === 'production') {
  const required = ['STRIPE_SECRET_KEY', 'SESSION_SECRET', 'SENDGRID_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const {
  loginLimiter,
  registerLimiter,
  contactLimiter,
  apiLimiter,
  passwordResetLimiter,
  verificationUploadLimiter,
  adminVerificationLimiter,
  phoneVerificationLimiter,
  registerValidation,
  loginValidation,
  listingValidation,
  bookingValidation,
  contactValidation,
  handleValidationErrors
} = require('./security-middleware');
const { csrfProtection, verifyCsrfToken, handleCsrfError } = require('./csrf-middleware');
const { trackVerificationAttempt, fraudDetectionMiddleware, getIPStatistics } = require('./fraud-detection');

const app = express();

// Security middleware - Enhanced CSP and security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Needed for Bootstrap and inline scripts
        "https://cdn.jsdelivr.net",
        "https://js.stripe.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://fonts.googleapis.com"
      ],
      fontSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://fonts.gstatic.com"
      ],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Trust proxy - required for secure cookies to work behind Render's proxy
app.set('trust proxy', 1);

// HTTP request logging
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined', { stream: logger.stream }));
} else {
  app.use(morgan('dev'));
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
// Static files with caching in production
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag: true
}));
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
logger.info(`Session database initialized at: ${sessionDbFile}`);

app.use(session({
  store: new SqliteStore({
    client: sessionDb,
    expired: {
      clear: true,
      intervalMs: 24 * 60 * 60 * 1000 // Check once per day for expired sessions
    }
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // HTTPS-only in production
    httpOnly: true, // Prevent JavaScript access
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: 'lax', // CSRF protection
    domain: process.env.COOKIE_DOMAIN || undefined
  },
  rolling: true, // Extend session on activity
  name: 'helnay_session' // Custom name instead of default
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
  
  // Add session timeout info for client-side warning
  if (req.session.userId) {
    const sessionMaxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
    res.locals.sessionTimeout = sessionMaxAge;
    res.locals.sessionWarningTime = 5 * 60 * 1000; // Warn 5 minutes before expiry
    
    // Track last activity
    req.session.lastActivity = Date.now();
  }
  
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
    
    logger.info(`Registration attempt for email: ${email}`);
    
    if (password !== confirmPassword) {
      logger.warn(`Registration failed - passwords do not match: ${email}`);
      return res.render('register', { message: null, error: 'Passwords do not match' });
    }
    
    // Check if user already exists
    const existingUser = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      logger.warn(`Registration failed - email already exists: ${email}`);
      return res.render('register', { message: null, error: 'Email already registered' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    logger.debug('Password hashed successfully');
    
    // Create user (is_verified = 0 by default)
    const result = await db.run(
      'INSERT INTO users (name, email, password, role, is_verified, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, 'user', 0, new Date().toISOString()]
    );
    
    const userId = result.lastInsertRowid;
    logger.info(`User created successfully - ID: ${userId}, Email: ${email}`);
    
    // Generate verification token
    const crypto = require('crypto');
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    
    // Store verification token
    await db.run(
      'INSERT INTO email_verifications (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)',
      [userId, verificationToken, expiresAt, new Date().toISOString()]
    );
    logger.debug(`Verification token created for user ID: ${userId}`);
    
    // Send verification email (always send, even if verification is disabled)
    logger.debug(`Attempting to send verification email to: ${email}`);
    sendVerificationEmail({ name, email }, verificationToken)
      .then(() => {
        logger.info(`Verification email sent successfully to: ${email}`);
      })
      .catch(err => {
        logger.error(`Verification email failed for ${email}: ${err.message}`);
      });
    
    const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
    
    if (!requireVerification) {
      // Auto-verify if verification is disabled for testing
      await db.run('UPDATE users SET is_verified = 1 WHERE id = ?', [userId]);
      logger.debug('User auto-verified (verification disabled)');
    }
    
    logger.info(`Registration complete for: ${email}`);
    res.render('register', { 
      message: '✅ Registration successful! <br><br>📧 <strong>IMPORTANT:</strong> A verification email has been sent to <strong>' + email + '</strong><br><br>Please check your inbox (and spam/junk folder) and click the verification link to activate your account.<br><br>⚠️ You must verify your email before you can log in.', 
      error: null 
    });
  } catch (err) {
    logger.error('Registration error:', err);
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
    if (requireVerification && user.role !== 'admin' && user.role !== 'super_admin' && user.is_verified === 0) {
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
    if (user.role === 'admin' || user.role === 'super_admin') {
      await logActivity({
        admin_id: user.id,
        admin_name: user.name,
        admin_email: user.email,
        action_type: 'LOGIN',
        action_description: `Logged in to admin panel as ${user.role}`,
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
      if (user.role === 'admin' || user.role === 'super_admin') {
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
  const expired = req.query.expired;
  req.session.destroy();
  if (expired) {
    return res.render('login', { 
      message: null, 
      error: 'Your session has expired. Please log in again.',
      csrfToken: res.locals.csrfToken 
    });
  }
  res.redirect('/');
});

// ====== USER DASHBOARD & FAVORITES ======

// User Favorites Page
app.get('/favorites', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Get favorites
    const favorites = await db.all(`
      SELECT l.*
      FROM listings l
      JOIN favorites f ON l.id = f.listing_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `, [userId]);
    
    res.render('favorites', {
      user: req.session.user,
      favorites,
      csrfToken: res.locals.csrfToken,
      message: null,
      error: null
    });
  } catch (err) {
    logger.error('[FAVORITES] Error:', err);
    res.status(500).send('Error loading favorites. Please try again later.');
  }
});

// User My Bookings Page (categorized)
app.get('/my-bookings', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const now = new Date();
    
    let allBookings = [];
    
    // Try to get bookings by user_id first
    try {
      allBookings = await db.all(`
        SELECT b.*, l.title as listing_title, l.location as listing_location, 
               l.price as listing_price, l.image_url as listing_image
        FROM bookings b
        JOIN listings l ON b.listing_id = l.id
        WHERE b.user_id = ?
        ORDER BY b.checkin DESC
      `, [userId]);
    } catch (dbErr) {
      // If user_id column doesn't exist yet, try matching by email
      logger.warn('[MY-BOOKINGS] user_id column might not exist yet, trying email fallback');
      const userEmail = req.session.user ? req.session.user.email : null;
      if (userEmail) {
        allBookings = await db.all(`
          SELECT b.*, l.title as listing_title, l.location as listing_location, 
                 l.price as listing_price, l.image_url as listing_image
          FROM bookings b
          JOIN listings l ON b.listing_id = l.id
          WHERE b.email = ?
          ORDER BY b.checkin DESC
        `, [userEmail]);
      }
    }
    
    // Categorize bookings
    const currentBookings = allBookings.filter(b => {
      const checkin = new Date(b.checkin);
      const checkout = new Date(b.checkout);
      return b.status === 'approved' && checkout >= now;
    });
    
    const previousBookings = allBookings.filter(b => {
      const checkout = new Date(b.checkout);
      return b.status === 'approved' && checkout < now;
    });
    
    const pendingBookings = allBookings.filter(b => b.status === 'pending' || b.status === null);
    
    res.render('my_bookings', {
      user: req.session.user,
      currentBookings,
      previousBookings,
      pendingBookings,
      csrfToken: res.locals.csrfToken,
      message: null,
      error: null
    });
  } catch (err) {
    logger.error('[MY-BOOKINGS] Error:', err);
    res.status(500).send('Error loading bookings. The database is being updated. Please try again in a few moments.');
  }
});

// User Dashboard (for admin users)
app.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Get user bookings with listing details
    const bookings = await db.all(`
      SELECT b.*, l.title as listing_title, l.location as listing_location, l.price as listing_price
      FROM bookings b
      JOIN listings l ON b.listing_id = l.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `, [userId]);
    
    // Get favorites
    const favorites = await db.all(`
      SELECT l.*
      FROM listings l
      JOIN favorites f ON l.id = f.listing_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `, [userId]);
    
    // Calculate stats
    const stats = {
      activeBookings: bookings.filter(b => b.status === 'approved' && new Date(b.checkout) >= new Date()).length,
      completedBookings: bookings.filter(b => b.status === 'approved' && new Date(b.checkout) < new Date()).length,
      pendingBookings: bookings.filter(b => b.status === 'pending').length,
      favoritesCount: favorites.length
    };
    
    // Get verification status
    const verificationStatus = await getUserVerificationStatus(userId);
    
    res.render('user_dashboard', {
      bookings,
      favorites,
      stats,
      verificationStatus,
      csrfToken: res.locals.csrfToken
    });
  } catch (err) {
    logger.error('[DASHBOARD] Error:', err);
    res.status(500).send('Error loading dashboard');
  }
});

// Cancel booking from dashboard
app.post('/dashboard/cancel-booking/:id', isAuthenticated, async (req, res) => {
  try {
    const bookingId = req.params.id;
    const userId = req.session.userId;
    
    // Verify this booking belongs to the user
    const booking = await db.get('SELECT * FROM bookings WHERE id = ? AND user_id = ?', [bookingId, userId]);
    if (!booking) {
      return res.status(404).send('Booking not found');
    }
    
    // Update booking status
    await db.run('UPDATE bookings SET status = ? WHERE id = ?', ['cancelled', bookingId]);
    
    console.log(`✅ [BOOKING] Cancelled booking ${bookingId} by user ${userId}`);
    res.redirect('/dashboard');
  } catch (err) {
    console.error('[BOOKING] Cancel error:', err);
    res.status(500).send('Error cancelling booking');
  }
});

// Toggle favorite (add/remove)
app.post('/favorites/toggle/:listingId', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const listingId = req.params.listingId;
    
    // Check if already favorited
    const existing = await db.get(
      'SELECT * FROM favorites WHERE user_id = ? AND listing_id = ?',
      [userId, listingId]
    );
    
    if (existing) {
      // Remove favorite
      await db.run('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?', [userId, listingId]);
      console.log(`❤️ [FAVORITES] Removed listing ${listingId} from favorites for user ${userId}`);
    } else {
      // Add favorite
      await db.run(
        'INSERT INTO favorites (user_id, listing_id, created_at) VALUES (?, ?, ?)',
        [userId, listingId, new Date().toISOString()]
      );
      console.log(`❤️ [FAVORITES] Added listing ${listingId} to favorites for user ${userId}`);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('[FAVORITES] Error:', err);
    res.status(500).json({ error: 'Failed to update favorites' });
  }
});

// Remove favorite
app.post('/favorites/remove/:listingId', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const listingId = req.params.listingId;
    
    await db.run('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?', [userId, listingId]);
    console.log(`❤️ [FAVORITES] Removed listing ${listingId} from favorites for user ${userId}`);
    
    res.redirect('/dashboard');
  } catch (err) {
    console.error('[FAVORITES] Error:', err);
    res.status(500).send('Error removing favorite');
  }
});

// ====== PUBLIC ROUTES ======

// Home - show listings
app.get('/', async (req, res) => {
  try {
    // Advanced search / filter support via query params
    const { location, min_price, max_price, q, type, category, bedrooms, guests, sort } = req.query;
    console.log('🔍 [SEARCH] Query params:', { location, min_price, max_price, q, type, category, bedrooms, guests, sort });
    
    const where = [];
    const params = [];
    
    if (location) {
      where.push('LOWER(loc.name) LIKE LOWER(?)');
      params.push(`%${location}%`);
      console.log('🔍 [SEARCH] Location filter:', location);
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
      where.push('(LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (type) {
      where.push('(LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))');
      params.push(`%${type}%`, `%${type}%`);
    }
    if (category) {
      where.push('(LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))');
      params.push(`%${category}%`, `%${category}%`);
    }
    if (bedrooms) {
      where.push('bedrooms >= ?');
      params.push(parseInt(bedrooms));
    }
    if (guests) {
      where.push('max_guests >= ?');
      params.push(parseInt(guests));
    }
    
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    
    // Determine sort order
    let orderBy = 'ORDER BY created_at DESC';
    if (sort === 'price_low') {
      orderBy = 'ORDER BY price ASC';
    } else if (sort === 'price_high') {
      orderBy = 'ORDER BY price DESC';
    } else if (sort === 'bedrooms') {
      orderBy = 'ORDER BY bedrooms DESC';
    } else if (sort === 'guests') {
      orderBy = 'ORDER BY max_guests DESC';
    }

    // select first image for each listing (if any)
    const sql = `SELECT l.*, loc.name as location_name, (
      SELECT url FROM listing_images i WHERE i.listing_id = l.id LIMIT 1
    ) as image_url 
    FROM listings l 
    LEFT JOIN locations loc ON l.location_id = loc.id
    ${whereSql} ${orderBy}`;
    const listings = await db.all(sql, params);
    console.log(`🔍 [SEARCH] Found ${listings.length} listings. SQL: ${sql}`);
    console.log(`🔍 [SEARCH] Params:`, params);
    
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
    
    // Get user favorites if logged in
    let favoriteIds = [];
    if (req.session.userId) {
      const favorites = await db.all('SELECT listing_id FROM favorites WHERE user_id = ?', [req.session.userId]);
      favoriteIds = favorites.map(f => f.listing_id);
    }
    
    // Get active browse categories for homepage
    const browseCategories = await db.all('SELECT * FROM browse_categories WHERE is_active = 1 ORDER BY display_order ASC');
    
    // Prevent browser caching to ensure fresh prices
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.render('index', { 
      listings, 
      query: req.query, 
      filtersByCategory, 
      browseCategories, 
      favoriteIds, 
      user: req.session.userId ? { id: req.session.userId } : null,
      title: 'Find Your Perfect Vacation Rental',
      description: 'Discover amazing vacation rental homes worldwide. Beach houses, city apartments, mountain retreats, and entire homes. Book your perfect stay with Helnay.',
      canonicalUrl: '/',
      ogImage: '/uploads/helnay-og-image.jpg'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Hotels page - shows all hotel listings
app.get('/hotels', async (req, res) => {
  try {
    const { location, min_price, max_price, q, bedrooms, guests, sort } = req.query;
    
    const where = ["(LOWER(type) = 'hotel' OR LOWER(title) LIKE '%hotel%' OR LOWER(description) LIKE '%hotel%')"];
    const params = [];
    
    if (location) {
      where.push('LOWER(loc.name) LIKE LOWER(?)');
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
      where.push('(LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (bedrooms) {
      where.push('bedrooms >= ?');
      params.push(parseInt(bedrooms));
    }
    if (guests) {
      where.push('max_guests >= ?');
      params.push(parseInt(guests));
    }
    
    const whereSql = 'WHERE ' + where.join(' AND ');
    
    let orderBy = 'ORDER BY created_at DESC';
    if (sort === 'price_low') orderBy = 'ORDER BY price ASC';
    else if (sort === 'price_high') orderBy = 'ORDER BY price DESC';
    
    const sql = `SELECT l.*, loc.name as location_name, (
      SELECT url FROM listing_images i WHERE i.listing_id = l.id LIMIT 1
    ) as image_url 
    FROM listings l 
    LEFT JOIN locations loc ON l.location_id = loc.id
    ${whereSql} ${orderBy}`;
    
    const listings = await db.all(sql, params);
    
    let favoriteIds = [];
    if (req.session.userId) {
      const favorites = await db.all('SELECT listing_id FROM favorites WHERE user_id = ?', [req.session.userId]);
      favoriteIds = favorites.map(f => f.listing_id);
    }
    
    res.render('hotels', { 
      listings,
      query: req.query,
      favoriteIds,
      user: req.session.user || null,
      title: 'Hotels - Helnay',
      description: 'Browse and book premium hotels worldwide with Helnay.',
      canonicalUrl: '/hotels',
      csrfToken: res.locals.csrfToken,
      message: null,
      error: null
    });
  } catch (err) {
    logger.error('[HOTELS] Error:', err);
    res.status(500).send('Server error');
  }
});

// Apartments page - shows all apartment listings
app.get('/apartments', async (req, res) => {
  try {
    const { location, min_price, max_price, q, bedrooms, guests, sort } = req.query;
    
    const where = ["(LOWER(type) = 'apartment' OR LOWER(title) LIKE '%apartment%' OR LOWER(description) LIKE '%apartment%')"];
    const params = [];
    
    if (location) {
      where.push('LOWER(loc.name) LIKE LOWER(?)');
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
      where.push('(LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (bedrooms) {
      where.push('bedrooms >= ?');
      params.push(parseInt(bedrooms));
    }
    if (guests) {
      where.push('max_guests >= ?');
      params.push(parseInt(guests));
    }
    
    const whereSql = 'WHERE ' + where.join(' AND ');
    
    let orderBy = 'ORDER BY created_at DESC';
    if (sort === 'price_low') orderBy = 'ORDER BY price ASC';
    else if (sort === 'price_high') orderBy = 'ORDER BY price DESC';
    
    const sql = `SELECT l.*, loc.name as location_name, (
      SELECT url FROM listing_images i WHERE i.listing_id = l.id LIMIT 1
    ) as image_url 
    FROM listings l 
    LEFT JOIN locations loc ON l.location_id = loc.id
    ${whereSql} ${orderBy}`;
    
    const listings = await db.all(sql, params);
    
    let favoriteIds = [];
    if (req.session.userId) {
      const favorites = await db.all('SELECT listing_id FROM favorites WHERE user_id = ?', [req.session.userId]);
      favoriteIds = favorites.map(f => f.listing_id);
    }
    
    res.render('apartments', { 
      listings,
      query: req.query,
      favoriteIds,
      user: req.session.user || null,
      title: 'Apartments - Helnay',
      description: 'Find and book comfortable apartments worldwide with Helnay.',
      canonicalUrl: '/apartments',
      csrfToken: res.locals.csrfToken,
      message: null,
      error: null
    });
  } catch (err) {
    logger.error('[APARTMENTS] Error:', err);
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

app.get('/become-a-host', (req, res) => res.render('become_host'));

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
    logger.error('Listing page error:', err);
    res.status(500).send('Server error');
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

// ====== USER VERIFICATION ROUTES ======

// User verification page
app.get('/verify', isAuthenticated, async (req, res) => {
  try {
    const verificationStatus = await getUserVerificationStatus(req.session.userId);
    
    // Get ID verification details
    const verificationRecord = await db.get(
      'SELECT * FROM user_verifications WHERE user_id = ?',
      [req.session.userId]
    );
    
    // Determine ID status
    let idStatus = 'none';
    if (verificationStatus.id_verified) {
      idStatus = 'verified';
    } else if (verificationRecord && verificationRecord.id_document_url) {
      idStatus = verificationRecord.id_verified === 0 ? 'pending' : 'verified';
    }
    
    const trustScore = calculateTrustScore(
      verificationStatus.email_verified,
      verificationStatus.phone_verified,
      verificationStatus.id_verified,
      false // payment verified
    );
    
    res.render('user_verification', {
      verification: {
        email_verified: verificationStatus.email_verified,
        phone_verified: verificationStatus.phone_verified,
        id_verified: verificationStatus.id_verified,
        id_status: idStatus,
        rejection_reason: verificationRecord?.id_rejection_reason || null
      },
      trustScore,
      message: req.session.message || null
    });
    
    delete req.session.message;
  } catch (err) {
    console.error('[VERIFICATION PAGE] Error:', err);
    res.status(500).send('Server error');
  }
});

// Upload ID verification documents
app.post('/verify/upload-id', isAuthenticated, verificationUploadLimiter, fraudDetectionMiddleware, uploadConfig.idVerification, async (req, res) => {
  try {
    const { document_type, selfie } = req.body;
    const userId = req.session.userId;
    const userIP = req.ip || req.connection.remoteAddress;
    
    // Track verification attempt for fraud detection
    trackVerificationAttempt(userIP, userId);
    
    // Check if this IP is suspicious
    if (req.suspiciousIP) {
      console.warn(`⚠️ [VERIFICATION] Suspicious IP detected: ${userIP} (${req.ipAttemptCount} attempts)`);
    }
    
    // Validate ID document upload
    if (!req.file) {
      req.session.message = { type: 'danger', text: 'Please upload your ID document' };
      return res.redirect('/verify');
    }
    
    // Validate selfie camera capture
    if (!selfie || !selfie.startsWith('data:image/')) {
      req.session.message = { type: 'danger', text: 'Please capture a selfie photo using your camera' };
      return res.redirect('/verify');
    }
    
    // Basic ID document validation (check file size and type)
    const fileSize = req.file.size;
    const mimeType = req.file.mimetype;
    
    if (fileSize > 5 * 1024 * 1024) {
      req.session.message = { type: 'danger', text: 'ID document file size too large (max 5MB)' };
      return res.redirect('/verify');
    }
    
    const validMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!validMimeTypes.includes(mimeType)) {
      req.session.message = { type: 'danger', text: 'Invalid file type. Please upload JPEG, PNG, or PDF only.' };
      return res.redirect('/verify');
    }
    
    const idDocumentPath = `/uploads/verifications/${req.file.filename}`;
    
    // Save base64 selfie to file
    const base64Data = selfie.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const selfieFilename = `${userId}_${Date.now()}_selfie.jpg`;
    const selfiePath = path.join(__dirname, 'public', 'uploads', 'verifications', selfieFilename);
    
    fs.writeFileSync(selfiePath, buffer);
    const selfieUrl = `/uploads/verifications/${selfieFilename}`;
    
    // Check if user already has a verification record
    const existing = await db.get(
      'SELECT * FROM user_verifications WHERE user_id = ?',
      [userId]
    );
    
    if (existing) {
      // Update existing record
      await db.run(
        `UPDATE user_verifications 
         SET id_document_type = ?, id_document_url = ?, id_selfie_url = ?, 
             id_verified = 0, id_rejection_reason = NULL, updated_at = ?
         WHERE user_id = ?`,
        [document_type, idDocumentPath, selfieUrl, new Date().toISOString(), userId]
      );
      console.log(`✅ [ID VERIFICATION] Updated existing record for user ${userId}`);
    } else {
      // Create new record
      await db.run(
        `INSERT INTO user_verifications 
         (user_id, id_document_type, id_document_url, id_selfie_url, id_verified, created_at, updated_at) 
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        [userId, document_type, idDocumentPath, selfieUrl, new Date().toISOString(), new Date().toISOString()]
      );
      console.log(`✅ [ID VERIFICATION] Created new record for user ${userId}`);
    }
    
    // Verify data was saved
    const saved = await db.get('SELECT * FROM user_verifications WHERE user_id = ?', [userId]);
    console.log(`📋 [ID VERIFICATION] Saved data:`, {
      userId: saved.user_id,
      docType: saved.id_document_type,
      docUrl: saved.id_document_url,
      selfieUrl: saved.id_selfie_url,
      verified: saved.id_verified
    });
    
    console.log(`✅ [ID VERIFICATION] Documents uploaded by user ${userId}`);
    req.session.message = { 
      type: 'success', 
      text: 'ID documents submitted successfully! We\'ll review them within 24-48 hours.' 
    };
    res.redirect('/verify');
  } catch (err) {
    console.error('[ID UPLOAD] Error:', err);
    req.session.message = { type: 'danger', text: 'Error uploading documents. Please try again.' };
    res.redirect('/verify');
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
    
    // Get user_id if logged in
    const userId = req.session && req.session.userId ? req.session.userId : null;
    
    // Create booking with payment_status = 'unpaid' and current price snapshot
    const result = await db.run(
      'INSERT INTO bookings (listing_id,name,email,checkin,checkout,payment_status,total_amount,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [listing_id, name, email, checkin, checkout, 'unpaid', totalAmount, userId, new Date().toISOString()]
    );
    
    const bookingId = result.lastInsertRowid;
    console.log(`✅ [BOOKING] Created booking ID: ${bookingId} for user: ${userId || 'guest'}`);
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

// ====== USER VERIFICATIONS (Super Admin Only) ======

app.get('/admin/verifications', isSuperAdmin, async (req, res) => {
  try {
    console.log('🔍 [VERIFICATIONS] Loading verifications page...');
    
    const filter = req.query.filter || null;
    console.log('🔍 [VERIFICATIONS] Filter:', filter);
    
    // Get all users with their verification status
    const allUsers = await db.all(`
      SELECT u.id, u.name, u.email, u.role, u.is_verified, u.phone_verified, u.id_verified, 
             u.created_at,
             v.phone_number, v.phone_verified as v_phone_verified, 
             v.id_document_type, v.id_document_url, v.id_selfie_url, 
             v.id_verified as v_id_verified, v.created_at as v_created_at
      FROM users u
      LEFT JOIN user_verifications v ON u.id = v.user_id
      WHERE u.role = 'user'
      ORDER BY u.created_at DESC
    `);
    
    console.log(`📋 [VERIFICATIONS] Loaded ${allUsers.length} users`);
    
    // Apply filter if specified
    let users = allUsers;
    if (filter) {
      switch(filter) {
        case 'email_verified':
          users = allUsers.filter(u => u.is_verified === 1);
          break;
        case 'phone_verified':
          users = allUsers.filter(u => u.phone_verified === 1);
          break;
        case 'id_verified':
          users = allUsers.filter(u => u.id_verified === 1);
          break;
        case 'pending':
          users = allUsers.filter(u => u.id_document_url && !u.id_verified);
          break;
        case 'not_submitted':
          users = allUsers.filter(u => !u.id_document_url);
          break;
        default:
          users = allUsers;
      }
      console.log(`📋 [VERIFICATIONS] Filtered to ${users.length} users (${filter})`);
    }
    
    // Get pending ID verifications
    const pending = await db.all(`
      SELECT u.id as user_id, u.name, u.email,
             v.phone_number, v.phone_verified, 
             v.id_document_type, v.id_document_url, v.id_selfie_url, 
             v.created_at, v.id_verified
      FROM users u
      INNER JOIN user_verifications v ON u.id = v.user_id
      WHERE u.role = 'user' AND v.id_document_url IS NOT NULL AND (v.id_verified = 0 OR v.id_verified IS NULL)
      ORDER BY v.created_at ASC
    `);
    
    console.log(`📋 [VERIFICATIONS] Found ${pending.length} pending verifications`);
    if (pending.length > 0) {
      console.log(`📋 [VERIFICATIONS] First pending:`, {
        userId: pending[0].user_id,
        name: pending[0].name,
        docType: pending[0].id_document_type,
        verified: pending[0].id_verified
      });
    }
    
    // Calculate stats from all users (not filtered)
    const stats = {
      email_verified: allUsers.filter(u => u.is_verified === 1).length,
      phone_verified: allUsers.filter(u => u.phone_verified === 1).length,
      id_verified: allUsers.filter(u => u.id_verified === 1).length,
      pending_review: pending.length
    };
    
    console.log('✅ [VERIFICATIONS] Rendering page with stats:', stats);
    res.render('admin_verifications', { 
      users, 
      pending, 
      stats, 
      filter,
      displayedUsers: users.length,
      csrfToken: res.locals.csrfToken 
    });
  } catch (err) {
    console.error('❌ [VERIFICATIONS] Error:', err.message);
    console.error('❌ [VERIFICATIONS] Stack:', err.stack);
    res.status(500).send('Error loading verifications');
  }
});

// Approve ID verification
app.post('/admin/verify-id/:userId/approve', isSuperAdmin, adminVerificationLimiter, async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Update user verification status
    await db.run('UPDATE users SET id_verified = 1 WHERE id = ?', [userId]);
    
    // Update verification record
    await db.run(
      `UPDATE user_verifications 
       SET id_verified = 1, id_verified_at = ?, id_verified_by = ?, updated_at = ?
       WHERE user_id = ?`,
      [new Date().toISOString(), req.session.userId, new Date().toISOString(), userId]
    );
    
    // Log activity
    const user = await db.get('SELECT name, email FROM users WHERE id = ?', [userId]);
    await logActivity({
      admin_id: req.session.userId,
      admin_name: req.session.userName,
      admin_email: req.session.userEmail,
      action_type: 'ID_VERIFICATION_APPROVED',
      action_description: `Approved ID verification for ${user.name} (${user.email})`,
      target_type: 'user',
      target_id: userId,
      ip_address: getClientIP(req)
    });
    
    console.log(`✅ [ID VERIFICATION] Approved for user ${userId} by ${req.session.userEmail}`);
    res.redirect('/admin/verifications');
  } catch (err) {
    console.error('❌ [ID VERIFICATION] Approval error:', err);
    res.status(500).send('Error approving verification');
  }
});

// Reject ID verification
app.post('/admin/verify-id/:userId/reject', isSuperAdmin, adminVerificationLimiter, async (req, res) => {
  try {
    const userId = req.params.userId;
    const { reason, notes } = req.body;
    const rejectionReason = notes ? `${reason}: ${notes}` : reason;
    
    // Update verification record with rejection reason
    await db.run(
      `UPDATE user_verifications 
       SET id_rejection_reason = ?, id_document_url = NULL, id_selfie_url = NULL, updated_at = ?
       WHERE user_id = ?`,
      [rejectionReason, new Date().toISOString(), userId]
    );
    
    // Log activity
    const user = await db.get('SELECT name, email FROM users WHERE id = ?', [userId]);
    await logActivity({
      admin_id: req.session.userId,
      admin_name: req.session.userName,
      admin_email: req.session.userEmail,
      action_type: 'ID_VERIFICATION_REJECTED',
      action_description: `Rejected ID verification for ${user.name} (${user.email}). Reason: ${rejectionReason}`,
      target_type: 'user',
      target_id: userId,
      ip_address: getClientIP(req)
    });
    
    // TODO: Send email notification to user about rejection
    
    console.log(`⚠️ [ID VERIFICATION] Rejected for user ${userId}: ${rejectionReason}`);
    res.redirect('/admin/verifications');
  } catch (err) {
    console.error('❌ [ID VERIFICATION] Rejection error:', err);
    res.status(500).send('Error rejecting verification');
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
    
    const locations = await db.all('SELECT * FROM locations WHERE is_active = 1 ORDER BY display_order, name');
    
    res.render('admin_listing_form', { listing: {}, images: [], filtersByCategory, selectedServices: [], locations });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin: create listing
app.post('/admin/listings/create', isAdmin, async (req, res) => {
  try {
    const { title, location_id, price, description, bedrooms, max_guests, services } = req.body;
    console.log('Creating new listing:', { title, location_id, price, description, bedrooms, max_guests });
    const result = await db.run(
      'INSERT INTO listings (title, location_id, price, description, bedrooms, max_guests, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [title, location_id, price, description, bedrooms || 1, max_guests || 2, new Date().toISOString()]
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
    
    // Load locations
    const locations = await db.all('SELECT * FROM locations WHERE is_active = 1 ORDER BY display_order, name');
    
    res.render('admin_listing_form', { listing, images, filtersByCategory, selectedServices, locations });
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
    const { title, location_id, price, description, bedrooms, max_guests, services } = req.body;
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
      'UPDATE listings SET title = ?, location_id = ?, price = ?, description = ?, bedrooms = ?, max_guests = ? WHERE id = ?',
      [title, location_id, priceNumber, description, bedrooms || 1, max_guests || 2, listingId]
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
    
    // FIRST: Only super_admin can delete users (authorization check)
    if (req.session.role !== 'super_admin') {
      console.error(`[DELETE USER] Non-super-admin attempted deletion: ${req.session.email || 'unknown'}`);
      return res.status(403).send('Only super administrators can delete users');
    }
    
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
    
    // Delete related data first (to avoid foreign key constraints)
    // Delete user's bookings
    await db.run('DELETE FROM bookings WHERE email = ?', [userToDelete.email]);
    
    // Delete user's email verification records
    await db.run('DELETE FROM email_verifications WHERE user_id = ?', [userId]);
    
    // Delete user's activity logs (as admin)
    await db.run('DELETE FROM activity_logs WHERE admin_id = ?', [userId]);
    
    // Delete the user
    await db.run('DELETE FROM users WHERE id = ?', [userId]);
    
    // Log the activity
    await logActivity({
      admin_id: req.session.userId,
      admin_name: req.session.userName,
      admin_email: req.session.userEmail,
      action_type: 'USER_DELETE',
      action_description: `Deleted user ${userToDelete.email} (ID: ${userId})`,
      ip_address: getClientIP(req)
    });
    
    console.log(`[DELETE USER] ✓ User deleted by ${req.session.userEmail}: ${userToDelete.email} (ID: ${userId})`);
    
    res.redirect('/admin/users');
  } catch (err) {
    console.error('[DELETE USER] Error:', err);
    res.status(500).send('Server error');
  }
});

// Admin: promote user to admin (super_admin only)
app.post('/admin/users/:id/promote-to-admin', isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Only super_admin can promote users to admin
    if (req.session.role !== 'super_admin') {
      console.error(`[PROMOTE USER] Non-super-admin attempted promotion: ${req.session.email || 'unknown'}`);
      return res.status(403).send('Only super administrators can create admin accounts');
    }
    
    // Get the user to be promoted
    const userToPromote = await db.get('SELECT id, email, role, name FROM users WHERE id = ?', [userId]);
    
    if (!userToPromote) {
      console.error(`[PROMOTE USER] User ${userId} not found`);
      return res.status(404).send('User not found');
    }
    
    // Check if user is already an admin
    if (userToPromote.role === 'admin' || userToPromote.role === 'super_admin') {
      return res.status(400).send('User is already an administrator');
    }
    
    // Promote to admin
    await db.run('UPDATE users SET role = ? WHERE id = ?', ['admin', userId]);
    
    // Log the activity
    await logActivity({
      admin_id: req.session.userId,
      admin_name: req.session.userName,
      admin_email: req.session.userEmail,
      action_type: 'USER_ROLE_CHANGE',
      action_description: `Promoted ${userToPromote.name} (${userToPromote.email}) to Admin`,
      ip_address: getClientIP(req)
    });
    
    console.log(`[PROMOTE USER] ✓ User promoted to admin by ${req.session.userEmail}: ${userToPromote.email} (ID: ${userId})`);
    
    res.redirect('/admin/users');
  } catch (err) {
    console.error('[PROMOTE USER] Error:', err);
    res.status(500).send('Server error');
  }
});

// Admin: demote admin to user (super_admin only)
app.post('/admin/users/:id/demote-to-user', isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Only super_admin can demote admins
    if (req.session.role !== 'super_admin') {
      console.error(`[DEMOTE USER] Non-super-admin attempted demotion: ${req.session.email || 'unknown'}`);
      return res.status(403).send('Only super administrators can modify admin accounts');
    }
    
    // Get the user to be demoted
    const userToDemote = await db.get('SELECT id, email, role, name FROM users WHERE id = ?', [userId]);
    
    if (!userToDemote) {
      console.error(`[DEMOTE USER] User ${userId} not found`);
      return res.status(404).send('User not found');
    }
    
    // Prevent demotion of super_admin accounts
    if (userToDemote.role === 'super_admin') {
      console.error(`[DEMOTE USER] Attempted to demote super_admin: ${userToDemote.email}`);
      return res.status(403).send('Cannot demote super administrator accounts');
    }
    
    // Check if user is not an admin
    if (userToDemote.role !== 'admin') {
      return res.status(400).send('User is not an administrator');
    }
    
    // Demote to regular user
    await db.run('UPDATE users SET role = ? WHERE id = ?', ['user', userId]);
    
    // Log the activity
    await logActivity({
      admin_id: req.session.userId,
      admin_name: req.session.userName,
      admin_email: req.session.userEmail,
      action_type: 'USER_ROLE_CHANGE',
      action_description: `Demoted ${userToDemote.name} (${userToDemote.email}) from Admin to User`,
      ip_address: getClientIP(req)
    });
    
    console.log(`[DEMOTE USER] ✓ Admin demoted to user by ${req.session.userEmail}: ${userToDemote.email} (ID: ${userId})`);
    
    res.redirect('/admin/users');
  } catch (err) {
    console.error('[DEMOTE USER] Error:', err);
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
    logger.error('Check user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ====== HEALTH CHECK ENDPOINT ======
app.get('/health', async (req, res) => {
  try {
    // Check database connectivity
    await db.get('SELECT 1');
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (err) {
    logger.error('Health check failed:', err);
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database connection failed'
    });
  }
});

// ====== DYNAMIC SITEMAP ======
const { generateSitemap } = require('./sitemap-generator');

app.get('/sitemap.xml', async (req, res) => {
  try {
    const sitemap = await generateSitemap();
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (err) {
    logger.error('Sitemap generation error:', err);
    res.status(500).send('Error generating sitemap');
  }
});

// ====== GLOBAL ERROR HANDLER ======
// 404 handler - must be after all routes
app.use((req, res, next) => {
  res.status(404).render('error', {
    message: 'Page not found',
    error: { status: 404 }
  });
});

// Global error handler - must be last
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  
  // Don't leak error details in production
  const errorMessage = process.env.NODE_ENV === 'production' 
    ? 'An unexpected error occurred. Please try again later.'
    : err.message;
  
  res.status(err.status || 500).render('error', {
    message: errorMessage,
    error: { status: err.status || 500 }
  });
});

// Start server after DB initialized
(async () => {
  try {
    await db.init();
    const PORT = process.env.PORT || 3000;
    const server = app.listen(PORT, () => logger.info(`Server listening on http://localhost:${PORT}`));
    
    // Handle server errors
    server.on('error', (err) => {
      logger.error('Server error:', err);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, closing server gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
    
  } catch (err) {
    logger.error('Failed to initialize DB', err);
    process.exit(1);
  }
})();
