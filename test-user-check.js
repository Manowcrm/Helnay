// Test registration and email verification system
const https = require('https');

console.log('\n🧪 TESTING REGISTRATION SYSTEM ON PRODUCTION\n');
console.log('=' .repeat(60));

async function testUserCheck(email) {
  console.log(`\n🔍 Checking if ${email} exists...\n`);
  
  // Note: You need to be logged in as admin to use this endpoint
  // This script is just for reference - you need to check in browser
  
  console.log('📍 Admin must visit this URL (after logging in):');
  console.log(`   https://helnay.com/admin/api/check-user?email=${encodeURIComponent(email)}`);
  console.log('');
  console.log('Expected responses:');
  console.log('');
  console.log('✅ If user exists:');
  console.log('   {');
  console.log('     "exists": true,');
  console.log('     "user": {');
  console.log('       "name": "...",');
  console.log('       "email": "...",');
  console.log('       "is_verified": true/false');
  console.log('     },');
  console.log('     "verification": {');
  console.log('       "total_tokens_sent": 1,');
  console.log('       "active_token": {...} or null');
  console.log('     }');
  console.log('   }');
  console.log('');
  console.log('❌ If user does NOT exist:');
  console.log('   {');
  console.log('     "exists": false,');
  console.log('     "email": "...",');
  console.log('     "message": "User not found - needs to register"');
  console.log('   }');
  console.log('');
}

async function main() {
  const testEmail = 'almutain1@roehampton.ac.uk';
  
  console.log('📝 STEPS TO DIAGNOSE:');
  console.log('');
  console.log('1. Login to admin panel at https://helnay.com/login');
  console.log('   Use your admin credentials');
  console.log('');
  console.log('2. Open this URL in the browser:');
  console.log(`   https://helnay.com/admin/api/check-user?email=${encodeURIComponent(testEmail)}`);
  console.log('');
  console.log('3. Check the JSON response');
  console.log('');
  
  await testUserCheck(testEmail);
  
  console.log('\n' + '='.repeat(60));
  console.log('\n💡 TROUBLESHOOTING TIPS:\n');
  console.log('If user exists but not verified:');
  console.log('  → User needs to click verification email link');
  console.log('  → Or use resend link at login page');
  console.log('');
  console.log('If user does NOT exist:');
  console.log('  → User needs to register first');
  console.log('  → Go to https://helnay.com/register');
  console.log('  → Complete registration form');
  console.log('  → Check email for verification link');
  console.log('');
  console.log('If registration fails:');
  console.log('  → Check Render logs for errors');
  console.log('  → Verify SMTP is configured (should see "✓ SMTP email service configured")');
  console.log('  → Test with different email address');
  console.log('');
  console.log('✅ Once verified, user can login at https://helnay.com/login');
  console.log('');
}

main();
