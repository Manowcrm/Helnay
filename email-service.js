const sgMail = require('@sendgrid/mail');

// Check if SendGrid is configured
const isEmailConfigured = !!process.env.SENDGRID_API_KEY;

if (!isEmailConfigured) {
  console.warn('⚠️ Email not configured. SENDGRID_API_KEY environment variable is required.');
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('✓ SendGrid email service configured');
}

// Get sender email - use ADMIN_EMAIL if set, otherwise use a default
const getSenderEmail = () => {
  return process.env.ADMIN_EMAIL || 'noreply@helnay.com';
};

// Send booking approval email
async function sendBookingApprovalEmail(booking, listing) {
  if (!isEmailConfigured) {
    console.warn('⚠️ Email not sent - SendGrid API key not configured');
    return false;
  }

  const msg = {
    to: booking.email,
    from: {
      email: getSenderEmail(),
      name: 'Helnay Rentals'
    },
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
    await sgMail.send(msg);
    console.log(`✓ Approval email sent to ${booking.email} via SendGrid`);
    return true;
  } catch (error) {
    console.warn(`⚠️ Email failed (booking still approved): ${error.message}`);
    if (error.response) {
      console.warn('SendGrid error details:', error.response.body);
    }
    return false;
  }
}

// Send booking denial email
async function sendBookingDenialEmail(booking, listing) {
  if (!isEmailConfigured) {
    console.warn('⚠️ Email not sent - SendGrid API key not configured');
    return false;
  }

  const msg = {
    to: booking.email,
    from: {
      email: getSenderEmail(),
      name: 'Helnay Rentals'
    },
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
    await sgMail.send(msg);
    console.log(`✓ Denial email sent to ${booking.email} via SendGrid`);
    return true;
  } catch (error) {
    console.error('Error sending denial email:', error);
    return false;
  }
}

// Send booking date change notification
async function sendBookingDateChangeEmail(booking, listing, oldCheckin, oldCheckout) {
  if (!isEmailConfigured) {
    console.warn('⚠️ Email not sent - SendGrid API key not configured');
    return false;
  }

  const msg = {
    to: booking.email,
    from: {
      email: getSenderEmail(),
      name: 'Helnay Rentals'
    },
    subject: '📅 Your Booking Dates Have Been Updated',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0d6efd;">Booking Dates Updated</h2>
        <p>Dear ${booking.name},</p>
        <p>Your booking dates have been updated as per your request.</p>
        
        <div style="background-color: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <h3 style="margin-top: 0;">Date Changes</h3>
          <div style="margin-bottom: 15px;">
            <p style="margin: 5px 0;"><strong>Check-in:</strong></p>
            <p style="margin: 5px 0; text-decoration: line-through; color: #6c757d;">Previous: ${oldCheckin}</p>
            <p style="margin: 5px 0; color: #28a745; font-weight: bold;">New: ${booking.checkin}</p>
          </div>
          <div>
            <p style="margin: 5px 0;"><strong>Check-out:</strong></p>
            <p style="margin: 5px 0; text-decoration: line-through; color: #6c757d;">Previous: ${oldCheckout}</p>
            <p style="margin: 5px 0; color: #28a745; font-weight: bold;">New: ${booking.checkout}</p>
          </div>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Updated Booking Details</h3>
          <p><strong>Property:</strong> ${listing.title}</p>
          <p><strong>Location:</strong> ${listing.location}</p>
          <p><strong>Price:</strong> $${listing.price}/night</p>
          <p><strong>Status:</strong> <span style="color: #28a745; font-weight: bold;">${booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}</span></p>
        </div>
        
        <p>If you have any questions about these changes or if this was not requested by you, please contact us immediately.</p>
        
        <p style="margin-top: 30px;">Best regards,<br>Helnay Rentals Team</p>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    console.log(`✓ Date change email sent to ${booking.email} via SendGrid`);
    return true;
  } catch (error) {
    console.error('Error sending date change email:', error);
    return false;
  }
}

// Send booking cancellation notification
async function sendBookingCancellationEmail(booking, listing) {
  if (!isEmailConfigured) {
    console.warn('⚠️ Email not sent - SendGrid API key not configured');
    return false;
  }

  const msg = {
    to: booking.email,
    from: {
      email: getSenderEmail(),
      name: 'Helnay Rentals'
    },
    subject: 'Booking Update - Reservation Status Changed',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0d6efd;">Booking Status Update</h2>
        <p>Dear ${booking.name},</p>
        <p>This is to inform you that your booking reservation has been updated and is no longer active.</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #0d6efd;">
          <h3 style="margin-top: 0;">Previous Booking Details</h3>
          <p><strong>Property:</strong> ${listing.title}</p>
          <p><strong>Location:</strong> ${listing.location}</p>
          <p><strong>Check-in Date:</strong> ${booking.checkin}</p>
          <p><strong>Check-out Date:</strong> ${booking.checkout}</p>
          <p><strong>Nightly Rate:</strong> $${listing.price}</p>
          <p style="margin-top: 15px; padding: 10px; background: #fff; border-radius: 3px;"><strong>Status:</strong> <span style="color: #6c757d;">No longer active</span></p>
        </div>
        
        <p>If you have any questions about this change or need assistance with a new booking, our support team is here to help.</p>
        
        <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #0d6efd;">
          <p style="margin: 0;"><strong>Need accommodation?</strong> We have many beautiful properties available. Visit our website to explore options or contact our team for personalized recommendations.</p>
        </div>
        
        <p>We hope to serve you in the future!</p>
        
        <p style="margin-top: 30px;">Best regards,<br>Helnay Rentals Team</p>
      </div>
    `
  };

  try {
    const response = await sgMail.send(msg);
    console.log(`✓ Cancellation email sent to ${booking.email} via SendGrid`);
    console.log('SendGrid response:', JSON.stringify(response[0].statusCode));
    return true;
  } catch (error) {
    console.error('Error sending cancellation email:', error);
    if (error.response) {
      console.error('SendGrid error details:', JSON.stringify(error.response.body));
    }
    return false;
  }
}

// Send contact form notification to admin
async function sendContactNotificationToAdmin(contactData) {
  if (!isEmailConfigured) {
    console.warn('⚠️ Email not sent - SendGrid API key not configured');
    return false;
  }

  const adminEmail = process.env.ADMIN_EMAIL || getSenderEmail();
  
  const msg = {
    to: adminEmail,
    from: {
      email: getSenderEmail(),
      name: 'Helnay Contact Form'
    },
    replyTo: contactData.email,
    subject: `📬 New Contact Form Submission from ${contactData.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0d6efd;">New Contact Form Message</h2>
        <p>You have received a new message from your website contact form.</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #0d6efd;">
          <h3 style="margin-top: 0;">Contact Details</h3>
          <p><strong>Name:</strong> ${contactData.name}</p>
          <p><strong>Email:</strong> <a href="mailto:${contactData.email}">${contactData.email}</a></p>
          <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <div style="background-color: #fff; padding: 20px; border-radius: 5px; margin: 20px 0; border: 1px solid #dee2e6;">
          <h3 style="margin-top: 0;">Message</h3>
          <p style="white-space: pre-wrap;">${contactData.message}</p>
        </div>
        
        <div style="background-color: #d1ecf1; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #0dcaf0;">
          <p style="margin: 0;"><strong>💡 Quick Reply:</strong> You can reply directly to this email to respond to ${contactData.name}. Their email address is set as the reply-to address.</p>
        </div>
        
        <p style="margin-top: 30px; color: #6c757d; font-size: 0.9em;">This email was sent from your Helnay Rentals contact form.</p>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    console.log(`✓ Contact notification sent to admin (${adminEmail}) via SendGrid`);
    return true;
  } catch (error) {
    console.error('Error sending admin notification:', error);
    return false;
  }
}

module.exports = {
  sendBookingApprovalEmail,
  sendBookingDenialEmail,
  sendBookingDateChangeEmail,
  sendBookingCancellationEmail,
  sendContactNotificationToAdmin
};
