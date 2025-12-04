// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
}

// Middleware to check if user is admin (includes both admin and super_admin)
function isAdmin(req, res, next) {
  console.log('[ADMIN CHECK] Session data:', {
    hasSession: !!req.session,
    userId: req.session?.userId,
    role: req.session?.role,
    sessionID: req.sessionID
  });
  
  if (req.session && req.session.userId && (req.session.role === 'admin' || req.session.role === 'super_admin')) {
    // Check if admin is active
    const db = require('./db');
    db.get('SELECT is_active FROM users WHERE id = ?', [req.session.userId])
      .then(user => {
        if (user && user.is_active === 1) {
          console.log('[ADMIN CHECK] ✓ Access granted to', req.session.role);
          return next();
        } else {
          console.log('[ADMIN CHECK] ✗ Admin account is deactivated');
          req.session.destroy();
          res.status(403).send('Your admin account has been deactivated. Please contact the system administrator.');
        }
      })
      .catch(err => {
        console.error('[ADMIN CHECK] Database error:', err);
        res.status(500).send('Server error');
      });
    return;
  }
  
  console.log('[ADMIN CHECK] ✗ Access denied - Missing session or not admin/super_admin');
  res.status(403).send('Access denied. Admin only.');
}

// Middleware to check if user is super admin
function isSuperAdmin(req, res, next) {
  console.log('[SUPER ADMIN CHECK] Session data:', {
    hasSession: !!req.session,
    userId: req.session?.userId,
    role: req.session?.role,
    adminLevel: req.session?.adminLevel
  });
  
  if (req.session && req.session.userId && req.session.role === 'admin' && req.session.adminLevel === 'super_admin') {
    console.log('[SUPER ADMIN CHECK] ✓ Access granted');
    return next();
  }
  
  console.log('[SUPER ADMIN CHECK] ✗ Access denied - Not super admin');
  res.status(403).send('Access denied. Super Admin only.');
}

module.exports = { isAuthenticated, isAdmin, isSuperAdmin };
