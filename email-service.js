const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Send booking approval email
async function sendBookingApprovalEmail(booking, listing) {
  const mailOptions = {
    from: `"Helnay Rentals" <${process.env.SMTP_USER}>`,
    to: booking.email,
    subject: '✅ Your Booking has been Approved!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745;">Booking Approved!</h2>
        <p>Dear ${booking.name},</p>
        <p>Great news! Your booking has been approved.</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Booking Details</h3>
          <p><strong>Property:</strong> ${listing.title}</p>
          <p><strong>Location:</strong> ${listing.location}</p>
          <p><strong>Check-in:</strong> ${booking.checkin}</p>
          <p><strong>Check-out:</strong> ${booking.checkout}</p>
          <p><strong>Price:</strong> $${listing.price}/night</p>
        </div>
        
        <p>We look forward to hosting you!</p>
        <p>If you have any questions, please don't hesitate to contact us.</p>
        
        <p style="margin-top: 30px;">Best regards,<br>Helnay Rentals Team</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✓ Approval email sent to ${booking.email}`);
    return true;
  } catch (error) {
    console.error('Error sending approval email:', error);
    return false;
  }
}

// Send booking denial email
async function sendBookingDenialEmail(booking, listing) {
  const mailOptions = {
    from: `"Helnay Rentals" <${process.env.SMTP_USER}>`,
    to: booking.email,
    subject: 'Booking Status Update',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">Booking Not Approved</h2>
        <p>Dear ${booking.name},</p>
        <p>We regret to inform you that your booking request could not be approved at this time.</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Booking Details</h3>
          <p><strong>Property:</strong> ${listing.title}</p>
          <p><strong>Location:</strong> ${listing.location}</p>
          <p><strong>Check-in:</strong> ${booking.checkin}</p>
          <p><strong>Check-out:</strong> ${booking.checkout}</p>
        </div>
        
        <p>This may be due to:</p>
        <ul>
          <li>The property is already booked for these dates</li>
          <li>The dates are not available</li>
          <li>Other scheduling conflicts</li>
        </ul>
        
        <p>Please feel free to browse our other available properties or contact us to find an alternative.</p>
        
        <p style="margin-top: 30px;">Best regards,<br>Helnay Rentals Team</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✓ Denial email sent to ${booking.email}`);
    return true;
  } catch (error) {
    console.error('Error sending denial email:', error);
    return false;
  }
}

module.exports = {
  sendBookingApprovalEmail,
  sendBookingDenialEmail
};
