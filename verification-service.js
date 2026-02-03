const db = require('./db');
const crypto = require('crypto');

// Generate random 6-digit OTP code
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Send OTP code (placeholder - integrate with Twilio/SMS service)
async function sendPhoneOTP(phoneNumber, code) {
  // TODO: Integrate with Twilio, Vonage, or other SMS provider
  // For now, just log it (in production, this would send SMS)
  console.log(`📱 [PHONE VERIFICATION] OTP for ${phoneNumber}: ${code}`);
  
  // In development, you can also email the code
  // or display it in the UI for testing
  
  return { success: true, message: 'OTP sent (logged to console)' };
}

// Create phone verification code
async function createPhoneVerification(userId, phoneNumber) {
  try {
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
    
    // Store code in database
    await db.run(
      `INSERT INTO phone_verification_codes (user_id, phone_number, code, expires_at, created_at) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, phoneNumber, code, expiresAt, new Date().toISOString()]
    );
    
    // Send OTP
    await sendPhoneOTP(phoneNumber, code);
    
    return { success: true, message: 'Verification code sent' };
  } catch (error) {
    console.error('[PHONE VERIFICATION] Error:', error);
    return { success: false, message: 'Failed to send verification code' };
  }
}

// Verify phone OTP code
async function verifyPhoneOTP(userId, phoneNumber, code) {
  try {
    // Get the most recent code for this user/phone
    const record = await db.get(
      `SELECT * FROM phone_verification_codes 
       WHERE user_id = ? AND phone_number = ? AND verified = 0 
       ORDER BY created_at DESC LIMIT 1`,
      [userId, phoneNumber]
    );
    
    if (!record) {
      return { success: false, message: 'No verification code found' };
    }
    
    // Check if expired
    if (new Date(record.expires_at) < new Date()) {
      return { success: false, message: 'Verification code expired' };
    }
    
    // Check attempts
    if (record.attempts >= 5) {
      return { success: false, message: 'Too many failed attempts. Request a new code.' };
    }
    
    // Verify code
    if (record.code !== code) {
      // Increment attempts
      await db.run(
        `UPDATE phone_verification_codes SET attempts = attempts + 1 WHERE id = ?`,
        [record.id]
      );
      return { success: false, message: 'Invalid verification code' };
    }
    
    // Mark code as verified
    await db.run(
      `UPDATE phone_verification_codes SET verified = 1 WHERE id = ?`,
      [record.id]
    );
    
    // Update user verification status
    await db.run(
      `UPDATE users SET phone_verified = 1 WHERE id = ?`,
      [userId]
    );
    
    // Update or create user_verifications record
    const existingVerification = await db.get(
      `SELECT * FROM user_verifications WHERE user_id = ?`,
      [userId]
    );
    
    if (existingVerification) {
      await db.run(
        `UPDATE user_verifications 
         SET phone_number = ?, phone_verified = 1, phone_verified_at = ?, updated_at = ?
         WHERE user_id = ?`,
        [phoneNumber, new Date().toISOString(), new Date().toISOString(), userId]
      );
    } else {
      await db.run(
        `INSERT INTO user_verifications 
         (user_id, phone_number, phone_verified, phone_verified_at, created_at, updated_at) 
         VALUES (?, ?, 1, ?, ?, ?)`,
        [userId, phoneNumber, new Date().toISOString(), new Date().toISOString(), new Date().toISOString()]
      );
    }
    
    return { success: true, message: 'Phone verified successfully!' };
  } catch (error) {
    console.error('[PHONE VERIFICATION] Error:', error);
    return { success: false, message: 'Verification failed' };
  }
}

// Get user verification status
async function getUserVerificationStatus(userId) {
  try {
    const user = await db.get(
      `SELECT phone_verified, id_verified, is_verified as email_verified FROM users WHERE id = ?`,
      [userId]
    );
    
    const verification = await db.get(
      `SELECT * FROM user_verifications WHERE user_id = ?`,
      [userId]
    );
    
    return {
      email_verified: user?.email_verified === 1,
      phone_verified: user?.phone_verified === 1,
      id_verified: user?.id_verified === 1,
      trust_score: verification?.trust_score || 0,
      verification_details: verification
    };
  } catch (error) {
    console.error('[VERIFICATION STATUS] Error:', error);
    return null;
  }
}

// Calculate trust score based on verifications
function calculateTrustScore(emailVerified, phoneVerified, idVerified, paymentVerified) {
  let score = 0;
  if (emailVerified) score += 25;
  if (phoneVerified) score += 25;
  if (idVerified) score += 30;
  if (paymentVerified) score += 20;
  return score;
}

module.exports = {
  generateOTP,
  createPhoneVerification,
  verifyPhoneOTP,
  getUserVerificationStatus,
  calculateTrustScore
};
