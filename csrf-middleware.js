// CSRF Protection Middleware (Custom Implementation)
// Using double-submit cookie pattern since csurf is deprecated

const crypto = require('crypto');

/**
 * Generates a random CSRF token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware to generate and attach CSRF token to session and locals
 * This makes the token available to all views via res.locals.csrfToken
 */
function csrfProtection(req, res, next) {
  // Initialize CSRF token in session if it doesn't exist
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateToken();
  }
  
  // Make token available to views
  res.locals.csrfToken = req.session.csrfToken;
  
  next();
}

/**
 * Middleware to verify CSRF token on POST/PUT/DELETE/PATCH requests
 * Compares token from request body with token in session
 */
function verifyCsrfToken(req, res, next) {
  // Skip verification for GET and HEAD requests
  if (req.method === 'GET' || req.method === 'HEAD') {
    return next();
  }
  
  // Get token from request body or headers
  const token = req.body._csrf || req.headers['csrf-token'] || req.headers['x-csrf-token'];
  
  // Compare with session token
  if (!token || token !== req.session.csrfToken) {
    console.error('❌ [CSRF] Invalid or missing CSRF token');
    console.error(`[CSRF] Method: ${req.method}, Path: ${req.path}`);
    console.error(`[CSRF] Received token: ${token ? token.substring(0, 10) + '...' : 'NONE'}`);
    console.error(`[CSRF] Expected token: ${req.session.csrfToken ? req.session.csrfToken.substring(0, 10) + '...' : 'NONE'}`);
    return res.status(403).render('error', { 
      message: 'Invalid security token. Please refresh the page and try again.',
      error: { status: 403 }
    });
  }
  
  console.log(`✓ [CSRF] Valid token for ${req.method} ${req.path}`);
  // Token is valid, proceed
  next();
}

/**
 * Error handling middleware for CSRF errors
 */
function handleCsrfError(err, req, res, next) {
  if (err.code === 'EBADCSRFTOKEN') {
    res.status(403).render('error', {
      message: 'Form validation failed. Please refresh the page and try again.',
      error: { status: 403 }
    });
  } else {
    next(err);
  }
}

module.exports = {
  csrfProtection,
  verifyCsrfToken,
  handleCsrfError
};
