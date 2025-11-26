require('dotenv').config();
const nodemailer = require('nodemailer');

// Test email configuration
async function testEmail() {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  console.log('Testing email configuration...');
  console.log('SMTP_HOST:', process.env.SMTP_HOST);
  console.log('SMTP_PORT:', process.env.SMTP_PORT);
  console.log('SMTP_USER:', process.env.SMTP_USER);
  console.log('SMTP_PASS:', process.env.SMTP_PASS ? '***' + process.env.SMTP_PASS.slice(-2) : 'NOT SET');

  try {
    // Verify connection
    await transporter.verify();
    console.log('✓ SMTP connection verified successfully!');

    // Send test email
    const info = await transporter.sendMail({
      from: `"Helnay Test" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER, // Send to yourself for testing
      subject: 'Test Email from Helnay',
      text: 'If you receive this, email is working!',
      html: '<b>If you receive this, email is working!</b>'
    });

    console.log('✓ Test email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('\nCheck your inbox at:', process.env.SMTP_USER);
  } catch (error) {
    console.error('✗ Email test failed:');
    console.error('Error:', error.message);
    if (error.code) console.error('Error Code:', error.code);
    if (error.response) console.error('Server Response:', error.response);
  }
}

testEmail();
