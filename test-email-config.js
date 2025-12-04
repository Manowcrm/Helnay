// Quick test to verify email configuration is working with info@helnay.com
require('dotenv').config();

console.log('\n📧 EMAIL CONFIGURATION CHECK\n');
console.log('=' .repeat(60));

// Check SMTP configuration
console.log('\n🔧 SMTP Settings:');
console.log(`   Host: ${process.env.SMTP_HOST || '❌ NOT SET'}`);
console.log(`   Port: ${process.env.SMTP_PORT || '❌ NOT SET'}`);
console.log(`   User: ${process.env.SMTP_USER || '❌ NOT SET'}`);
console.log(`   Pass: ${process.env.SMTP_PASS ? '✅ Set (hidden)' : '❌ NOT SET'}`);
console.log(`   Admin: ${process.env.ADMIN_EMAIL || '❌ NOT SET'}`);

// Verify correct email is configured
console.log('\n✅ Email Account Verification:');
if (process.env.SMTP_USER === 'info@helnay.com') {
  console.log('   ✓ Correct domain email configured (info@helnay.com)');
} else if (process.env.SMTP_USER && process.env.SMTP_USER.includes('@gmail.com')) {
  console.log('   ⚠️  Still using Gmail account:', process.env.SMTP_USER);
  console.log('   → Update to: info@helnay.com');
} else if (process.env.SMTP_USER) {
  console.log('   ℹ️  Current email:', process.env.SMTP_USER);
} else {
  console.log('   ❌ No email configured!');
}

if (process.env.ADMIN_EMAIL === 'info@helnay.com') {
  console.log('   ✓ Admin email correctly set (info@helnay.com)');
} else {
  console.log('   ⚠️  Admin email should be: info@helnay.com');
}

// Check if App Password is configured
console.log('\n🔑 App Password Check:');
if (!process.env.SMTP_PASS) {
  console.log('   ❌ No SMTP password configured!');
  console.log('   → Generate App Password at: https://myaccount.google.com/apppasswords');
} else if (process.env.SMTP_PASS.length === 16) {
  console.log('   ✓ App Password configured (16 characters - correct format)');
} else if (process.env.SMTP_PASS.includes(' ')) {
  console.log('   ⚠️  Password contains spaces - remove them!');
  console.log('   Current length:', process.env.SMTP_PASS.length);
} else {
  console.log('   ℹ️  Password configured');
  console.log('   Length:', process.env.SMTP_PASS.length, 'characters');
}

// Test SMTP connection
console.log('\n🧪 Testing SMTP Connection...');

const nodemailer = require('nodemailer');

if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  transporter.verify((error, success) => {
    if (error) {
      console.log('   ❌ SMTP Connection Failed!');
      console.log('   Error:', error.message);
      console.log('\n💡 Troubleshooting:');
      console.log('   1. Make sure you generated an App Password (not regular password)');
      console.log('   2. Enable 2FA at: https://myaccount.google.com/security');
      console.log('   3. Generate App Password at: https://myaccount.google.com/apppasswords');
      console.log('   4. Remove spaces from the 16-character password');
      console.log('   5. Update SMTP_PASS in .env file');
    } else {
      console.log('   ✅ SMTP Connection Successful!');
      console.log('   📤 Ready to send emails from:', process.env.SMTP_USER);
    }

    // Summary
    console.log('\n' + '=' .repeat(60));
    console.log('📋 SUMMARY\n');
    
    if (process.env.SMTP_USER === 'info@helnay.com' && !error) {
      console.log('✅ Configuration Complete!');
      console.log('   All emails will be sent from: info@helnay.com');
      console.log('   Your website will send professional emails.');
      console.log('\n📝 Next Steps:');
      console.log('   1. Update Render environment variables with same settings');
      console.log('   2. Test registration at: https://helnay.com/register');
      console.log('   3. Check email arrives from info@helnay.com');
    } else {
      console.log('⚠️  Configuration Needs Updates');
      console.log('\n📝 Required Actions:');
      
      if (process.env.SMTP_USER !== 'info@helnay.com') {
        console.log('   1. Update SMTP_USER=info@helnay.com in .env');
        console.log('   2. Update ADMIN_EMAIL=info@helnay.com in .env');
      }
      
      if (error) {
        console.log('   3. Generate new App Password for info@helnay.com');
        console.log('      → https://myaccount.google.com/apppasswords');
        console.log('   4. Update SMTP_PASS in .env with 16-char password (no spaces)');
      }
      
      console.log('   5. Run this test again: node test-email-config.js');
      console.log('   6. Update same settings on Render dashboard');
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log('\n');
  });
} else {
  console.log('   ⚠️  Cannot test - missing SMTP credentials');
  console.log('\n📝 Setup Instructions:');
  console.log('   1. Go to: https://myaccount.google.com/apppasswords');
  console.log('   2. Log in with: info@helnay.com');
  console.log('   3. Generate App Password for "Mail - Other (Helnay Website)"');
  console.log('   4. Copy the 16-character password (remove spaces)');
  console.log('   5. Update .env file:');
  console.log('      SMTP_USER=info@helnay.com');
  console.log('      SMTP_PASS=your-16-char-password-here');
  console.log('      ADMIN_EMAIL=info@helnay.com');
  console.log('   6. Run: node test-email-config.js');
  console.log('\n' + '=' .repeat(60));
  console.log('\n');
}
