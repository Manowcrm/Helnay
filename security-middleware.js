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
  
  body('check_in')
    .isISO8601()
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
  
  body('check_out')
    .isISO8601()
    .withMessage('Invalid check-out date')
    .custom((value, { req }) => {
      const checkIn = new Date(req.body.check_in);
      const checkOut = new Date(value);
      if (checkOut <= checkIn) {
        throw new Error('Check-out date must be after check-in date');
      }
      return true;
    }),
  
  body('guests')
    .isInt({ min: 1, max: 50 })
    .withMessage('Number of guests must be between 1 and 50'),
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
    // For API requests, return JSON
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(400).json({ errors: errors.array() });
    }
    // For form submissions, flash errors and redirect back
    const errorMessages = errors.array().map(err => err.msg).join(', ');
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
