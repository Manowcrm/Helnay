// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
}

// Middleware to check if user is admin
function isAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.role === 'admin') {
    return next();
  }
  res.status(403).send('Access denied. Admin only.');
}

module.exports = { isAuthenticated, isAdmin };
