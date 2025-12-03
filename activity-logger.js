const db = require('./db');

/**
 * Log admin activity for audit trail and accountability
 * @param {Object} data - Activity data
 * @param {number} data.admin_id - ID of admin performing action
 * @param {string} data.admin_name - Name of admin
 * @param {string} data.admin_email - Email of admin
 * @param {string} data.action_type - Type of action (CREATE, UPDATE, DELETE, LOGIN, etc.)
 * @param {string} data.action_description - Human-readable description
 * @param {string} data.target_type - Type of target (listing, booking, user, etc.)
 * @param {number} data.target_id - ID of affected resource
 * @param {string} data.ip_address - IP address of admin
 */
async function logActivity(data) {
  try {
    await db.run(
      `INSERT INTO activity_logs (admin_id, admin_name, admin_email, action_type, action_description, target_type, target_id, ip_address, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.admin_id,
        data.admin_name,
        data.admin_email,
        data.action_type,
        data.action_description,
        data.target_type || null,
        data.target_id || null,
        data.ip_address || null,
        new Date().toISOString()
      ]
    );
    console.log(`📝 Activity logged: ${data.action_type} by ${data.admin_name}`);
  } catch (err) {
    console.error('❌ Failed to log activity:', err.message);
  }
}

/**
 * Get client IP address from request
 * @param {Object} req - Express request object
 * @returns {string} IP address
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         'unknown';
}

/**
 * Middleware to automatically log admin actions
 * Usage: app.post('/admin/listings', logAdminAction('CREATE', 'listing'), async (req, res) => {...})
 */
function logAdminAction(actionType, targetType) {
  return async (req, res, next) => {
    // Store original methods
    const originalJson = res.json;
    const originalSend = res.send;
    const originalRedirect = res.redirect;
    
    let logged = false;
    
    const logActivity = async (targetId = null) => {
      if (logged || !req.session.userId || req.session.role !== 'admin') return;
      logged = true;
      
      const actionDescriptions = {
        'CREATE_LISTING': `Created new listing`,
        'UPDATE_LISTING': `Updated listing #${targetId}`,
        'DELETE_LISTING': `Deleted listing #${targetId}`,
        'CREATE_BOOKING': `Created booking`,
        'UPDATE_BOOKING': `Updated booking #${targetId}`,
        'DELETE_BOOKING': `Deleted booking #${targetId}`,
        'APPROVE_BOOKING': `Approved booking #${targetId}`,
        'DENY_BOOKING': `Denied booking #${targetId}`,
        'CREATE_FILTER': `Created filter service`,
        'UPDATE_FILTER': `Updated filter service #${targetId}`,
        'DELETE_FILTER': `Deleted filter service #${targetId}`,
        'CREATE_ADMIN': `Created new admin user`,
        'UPDATE_ADMIN': `Updated admin user #${targetId}`,
        'DEACTIVATE_ADMIN': `Deactivated admin user #${targetId}`,
        'DELETE_CONTACT': `Deleted contact message #${targetId}`,
        'REPLY_CONTACT': `Replied to contact message #${targetId}`,
        'LOGIN': `Logged in to admin panel`
      };
      
      await require('./activity-logger').logActivity({
        admin_id: req.session.userId,
        admin_name: req.session.userName,
        admin_email: req.session.userEmail,
        action_type: actionType,
        action_description: actionDescriptions[actionType] || `${actionType} on ${targetType}`,
        target_type: targetType,
        target_id: targetId || req.params.id || null,
        ip_address: getClientIP(req)
      });
    };
    
    // Override response methods to log after successful response
    res.json = function(data) {
      logActivity(data?.id || data?.insertedId).catch(console.error);
      return originalJson.call(this, data);
    };
    
    res.send = function(data) {
      logActivity().catch(console.error);
      return originalSend.call(this, data);
    };
    
    res.redirect = function(url) {
      logActivity().catch(console.error);
      return originalRedirect.call(this, url);
    };
    
    next();
  };
}

/**
 * Get recent activity logs with optional filters
 * @param {Object} options - Filter options
 * @param {number} options.admin_id - Filter by specific admin
 * @param {number} options.limit - Number of records to return
 * @param {number} options.offset - Offset for pagination
 * @returns {Promise<Array>} Activity logs
 */
async function getActivityLogs(options = {}) {
  const { admin_id, limit = 100, offset = 0 } = options;
  
  let query = 'SELECT * FROM activity_logs';
  let params = [];
  
  if (admin_id) {
    query += ' WHERE admin_id = ?';
    params.push(admin_id);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  return await db.all(query, params);
}

/**
 * Get activity statistics for dashboard
 * @returns {Promise<Object>} Statistics object
 */
async function getActivityStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [totalLogs, todayLogs, adminStats] = await Promise.all([
    db.get('SELECT COUNT(*) as count FROM activity_logs'),
    db.get('SELECT COUNT(*) as count FROM activity_logs WHERE created_at >= ?', [today.toISOString()]),
    db.all(`SELECT admin_id, admin_name, admin_email, COUNT(*) as action_count 
            FROM activity_logs 
            GROUP BY admin_id 
            ORDER BY action_count DESC`)
  ]);
  
  return {
    totalLogs: totalLogs?.count || 0,
    todayLogs: todayLogs?.count || 0,
    adminStats: adminStats || []
  };
}

module.exports = {
  logActivity,
  getClientIP,
  logAdminAction,
  getActivityLogs,
  getActivityStats
};
