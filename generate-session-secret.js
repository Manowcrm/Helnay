#!/usr/bin/env node
/**
 * Generate a secure random SESSION_SECRET for production
 * 
 * Usage:
 *   node generate-session-secret.js
 * 
 * This will generate a cryptographically secure random 32-byte hex string
 * suitable for use as SESSION_SECRET in your .env file
 */

const crypto = require('crypto');

const sessionSecret = crypto.randomBytes(32).toString('hex');

console.log('\n🔐 GENERATED SESSION SECRET\n');
console.log('Copy this to your .env file:\n');
console.log(`SESSION_SECRET=${sessionSecret}\n`);
console.log('⚠️  Keep this secret! Never commit it to Git.\n');
