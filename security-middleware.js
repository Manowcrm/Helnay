const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: 'Too many login attempts from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for registration
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 registration requests per hour
  message: 'Too many accounts created from this IP, please try again after an hour',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.error(`❌ [RATE LIMIT] Registration blocked for IP: ${req.ip}`);
    res.render('register', {
      message: null,
      error: 'Too many registration attempts from this IP address. Please try again after an hour.',
      csrfToken: res.locals.csrfToken,
      formData: req.body
    });
  }
});

// Rate limiting for password reset
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many password reset attempts, please try again after an hour',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for contact form
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many messages sent, please try again after an hour',
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation rules
const registerValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces')
    .escape(),
  
  body('email')
    .trim()
    .isEmail()
    .withMessage('Invalid email address')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email is too long'),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*]/)
    .withMessage('Password must contain at least one special character (!@#$%^&*)'),
];

const loginValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Invalid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

const listingValidation = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters')
    .escape(),
  
  body('description')
    .trim()
    .isLength({ min: 20, max: 5000 })
    .withMessage('Description must be between 20 and 5000 characters')
    .escape(),
  
  body('price')
    .isFloat({ min: 0, max: 1000000 })
    .withMessage('Price must be a valid number between 0 and 1,000,000'),
  
  body('location')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Location must be between 2 and 200 characters')
    .escape(),
];

const bookingValidation = [
  body('listing_id')
    .isInt({ min: 1 })
    .withMessage('Invalid listing ID'),
  
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  
  body('email')
    .trim()
    .isEmail()
    .withMessage('Invalid email address')
    .normalizeEmail(),
  
  body('checkin_date')
    .isDate()
    .withMessage('Invalid check-in date')
    .custom((value) => {
      const checkIn = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (checkIn < today) {
        throw new Error('Check-in date cannot be in the past');
      }
      return true;
    }),
  
  body('checkin_time')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Invalid check-in time format (HH:MM)'),
  
  body('checkout_date')
    .isDate()
    .withMessage('Invalid check-out date')
    .custom((value, { req }) => {
      const checkInDate = new Date(req.body.checkin_date);
      const checkOutDate = new Date(value);
      if (checkOutDate < checkInDate) {
        throw new Error('Check-out date must be on or after check-in date');
      }
      return true;
    }),
  
  body('checkout_time')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Invalid check-out time format (HH:MM)'),
];

const contactValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .escape(),
  
  body('email')
    .trim()
    .isEmail()
    .withMessage('Invalid email address')
    .normalizeEmail(),
  
  body('message')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Message must be between 10 and 2000 characters')
    .escape(),
];

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Log validation failures for debugging
    console.log('[VALIDATION] Failed:', req.path);
    console.log('[VALIDATION] Errors:', errors.array().map(e => e.msg).join('; '));
    
    // For API requests, return JSON
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    // For form submissions, show error message directly on the page
    const errorMessages = errors.array().map(err => err.msg).join(', ');
    
    // Determine which view to render based on the route
    const viewName = req.path.includes('/register') ? 'register' : 
                     req.path.includes('/login') ? 'login' : 
                     req.path.includes('/contact') ? 'contact' : 
                     req.path.includes('/bookings') ? 'bookings' : null;
    
    if (viewName) {
      // Render the same page with error messages
      const renderData = {
        message: null,
        error: `❌ ${errorMessages}`,
        csrfToken: res.locals.csrfToken,
        // Preserve form data so user doesn't have to retype everything
        formData: req.body
      };
      
      // For bookings, we need to fetch listings data
      if (viewName === 'bookings') {
        const db = require('./db');
        db.all('SELECT id, title, price, location FROM listings').then(listings => {
          renderData.listings = listings;
          renderData.selectedListingId = req.body.listing_id ? parseInt(req.body.listing_id) : null;
          return res.render(viewName, renderData);
        }).catch(err => {
          console.error('[VALIDATION] Error fetching listings:', err);
          req.session.error = errorMessages;
          return res.redirect('back');
        });
        return; // Exit here, render will happen in promise
      }
      
      return res.render(viewName, renderData);
    }
    
    // Fallback to redirect with session error
    req.session.error = errorMessages;
    return res.redirect('back');
  }
  next();
};

// SQL injection protection - ensure parameterized queries
const sanitizeDbParams = (params) => {
  if (Array.isArray(params)) {
    return params.map(param => {
      if (typeof param === 'string') {
        // Remove any SQL keywords and dangerous characters
        return param.replace(/['";\\]/g, '');
      }
      return param;
    });
  }
  return params;
};

module.exports = {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  contactLimiter,
  apiLimiter,
  registerValidation,
  loginValidation,
  listingValidation,
  bookingValidation,
  contactValidation,
  handleValidationErrors,
  sanitizeDbParams,
};
