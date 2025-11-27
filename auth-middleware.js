// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
}

// Middleware to check if user is admin
function isAdmin(req, res, next) {
  console.log('[ADMIN CHECK] Session data:', {
    hasSession: !!req.session,
    userId: req.session?.userId,
    role: req.session?.role,
    sessionID: req.sessionID
  });
  
  if (req.session && req.session.userId && req.session.role === 'admin') {
    console.log('[ADMIN CHECK] ✓ Access granted');
    return next();
  }
  
  console.log('[ADMIN CHECK] ✗ Access denied - Missing session or not admin');
  res.status(403).send('Access denied. Admin only.');
}

module.exports = { isAuthenticated, isAdmin };
