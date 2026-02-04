const db = require('./db');

// Track verification attempts by IP
const verificationAttempts = new Map();

// Clean up old attempts every hour
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [ip, attempts] of verificationAttempts.entries()) {
    const recentAttempts = attempts.filter(time => time > oneHourAgo);
    if (recentAttempts.length === 0) {
      verificationAttempts.delete(ip);
    } else {
      verificationAttempts.set(ip, recentAttempts);
    }
  }
}, 60 * 60 * 1000);

/**
 * Track verification attempt from an IP address
 */
function trackVerificationAttempt(ip, userId) {
  if (!verificationAttempts.has(ip)) {
    verificationAttempts.set(ip, []);
  }
  verificationAttempts.get(ip).push(Date.now());
  
  // Log to database for audit trail
  db.run(
    `INSERT INTO verification_attempts (ip_address, user_id, attempt_time) VALUES (?, ?, ?)`,
    [ip, userId, new Date().toISOString()]
  ).catch(err => console.error('Failed to log verification attempt:', err));
}

/**
 * Check if IP address is suspicious
 */
function isSuspiciousIP(ip) {
  if (!verificationAttempts.has(ip)) {
    return { suspicious: false, attemptCount: 0 };
  }
  
  const attempts = verificationAttempts.get(ip);
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  const recentAttempts = attempts.filter(time => time > oneHourAgo);
  
  // More than 5 attempts in an hour is suspicious
  const suspicious = recentAttempts.length > 5;
  
  if (suspicious) {
    console.warn(`⚠️ [FRAUD DETECTION] Suspicious activity from IP: ${ip} (${recentAttempts.length} attempts in 1 hour)`);
  }
  
  return {
    suspicious,
    attemptCount: recentAttempts.length,
    shouldBlock: recentAttempts.length > 10 // Block after 10 attempts
  };
}

/**
 * Get fraud statistics for an IP
 */
async function getIPStatistics(ip) {
  try {
    const stats = await db.get(
      `SELECT 
        COUNT(*) as total_attempts,
        COUNT(DISTINCT user_id) as unique_users,
        MAX(attempt_time) as last_attempt
      FROM verification_attempts 
      WHERE ip_address = ? AND attempt_time > datetime('now', '-24 hours')`,
      [ip]
    );
    
    return stats || { total_attempts: 0, unique_users: 0, last_attempt: null };
  } catch (err) {
    console.error('Failed to get IP statistics:', err);
    return { total_attempts: 0, unique_users: 0, last_attempt: null };
  }
}

/**
 * Check for multiple accounts from same IP
 */
async function checkMultipleAccounts(ip) {
  try {
    const result = await db.get(
      `SELECT COUNT(DISTINCT user_id) as user_count 
      FROM verification_attempts 
      WHERE ip_address = ? AND attempt_time > datetime('now', '-7 days')`,
      [ip]
    );
    
    // More than 3 different user accounts from same IP in a week is suspicious
    const suspicious = result && result.user_count > 3;
    
    if (suspicious) {
      console.warn(`⚠️ [FRAUD DETECTION] Multiple accounts detected from IP: ${ip} (${result.user_count} users)`);
    }
    
    return { suspicious, userCount: result ? result.user_count : 0 };
  } catch (err) {
    console.error('Failed to check multiple accounts:', err);
    return { suspicious: false, userCount: 0 };
  }
}

/**
 * Middleware to check for suspicious activity
 */
function fraudDetectionMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const check = isSuspiciousIP(ip);
  
  if (check.shouldBlock) {
    console.error(`❌ [FRAUD DETECTION] Blocked request from IP: ${ip}`);
    return res.status(429).send('Too many verification attempts. Please contact support.');
  }
  
  if (check.suspicious) {
    req.suspiciousIP = true;
    req.ipAttemptCount = check.attemptCount;
  }
  
  next();
}

module.exports = {
  trackVerificationAttempt,
  isSuspiciousIP,
  getIPStatistics,
  checkMultipleAccounts,
  fraudDetectionMiddleware
};
