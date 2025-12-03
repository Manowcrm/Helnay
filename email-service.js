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
    text: `Dear ${booking.name},

Great news! Your booking has been approved.

Booking Details:
Property: ${listing.title}
Location: ${listing.location}
Check-in: ${booking.checkin}
Check-out: ${booking.checkout}
Price: $${listing.price}/night

We look forward to hosting you!
If you have any questions, please don't hesitate to contact us.

Best regards,
Helnay Rentals Team`,
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
    text: `Dear ${booking.name},

We regret to inform you that your booking request could not be approved at this time.

Booking Details:
Property: ${listing.title}
Location: ${listing.location}
Check-in: ${booking.checkin}
Check-out: ${booking.checkout}

This may be due to:
- The property is already booked for these dates
- The dates are not available
- Other scheduling conflicts

Please feel free to browse our other available properties or contact us to find an alternative.

Best regards,
Helnay Rentals Team`,
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
    text: `Dear ${booking.name},

This is to inform you that your booking reservation has been updated and is no longer active.

Previous Booking Details:
Property: ${listing.title}
Location: ${listing.location}
Check-in Date: ${booking.checkin}
Check-out Date: ${booking.checkout}
Nightly Rate: $${listing.price}
Status: No longer active

If you have any questions about this change or need assistance with a new booking, our support team is here to help.

Need accommodation? We have many beautiful properties available. Visit our website to explore options or contact our team for personalized recommendations.

We hope to serve you in the future!

Best regards,
Helnay Rentals Team`,
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
        
        <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
        <p style="font-size: 12px; color: #6c757d; text-align: center;">
          Helnay Rentals | <a href="https://helnay.onrender.com" style="color: #0d6efd;">Visit Website</a><br>
          This is a transactional email regarding your booking.
        </p>
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

// Send welcome email to new users
async function sendWelcomeEmail(user) {
  if (!isEmailConfigured) {
    console.warn('⚠️ Email not sent - SendGrid API key not configured');
    return false;
  }

  const msg = {
    to: user.email,
    from: {
      email: getSenderEmail(),
      name: 'Helnay Rentals'
    },
    subject: '🎉 Welcome to Helnay Rentals!',
    text: `Dear ${user.name},

Welcome to Helnay Rentals!

Thank you for creating an account with us. We're excited to help you find your perfect vacation rental.

What You Can Do Now:
- Browse our collection of beautiful properties
- Book your dream vacation home
- Manage your bookings from your account
- Save your favorite listings

Getting Started:
Visit our website at https://helnay.onrender.com to explore available properties. From cozy city apartments to beachfront cottages and mountain retreats, we have something for everyone.

Need Help?
If you have any questions or need assistance, our support team is always ready to help. Simply use the contact form on our website.

Happy travels!

Best regards,
Helnay Rentals Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%); padding: 40px 20px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Helnay! 🎉</h1>
        </div>
        
        <div style="padding: 30px 20px;">
          <p style="font-size: 16px;">Dear ${user.name},</p>
          <p style="font-size: 16px;">Thank you for creating an account with <strong>Helnay Rentals</strong>. We're excited to help you find your perfect vacation rental!</p>
          
          <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #0d6efd;">
            <h3 style="margin-top: 0; color: #0d6efd;">What You Can Do Now</h3>
            <ul style="line-height: 1.8; color: #495057;">
              <li>Browse our collection of beautiful properties</li>
              <li>Book your dream vacation home</li>
              <li>Manage your bookings from your account</li>
              <li>Save your favorite listings</li>
            </ul>
          </div>
          
          <div style="background-color: #e7f3ff; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h3 style="margin-top: 0; color: #0a58ca;">Getting Started</h3>
            <p style="margin-bottom: 15px; color: #495057;">Visit our website to explore available properties. From cozy city apartments to beachfront cottages and mountain retreats, we have something for everyone.</p>
            <a href="https://helnay.onrender.com" style="display: inline-block; background-color: #0d6efd; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">Explore Properties</a>
          </div>
          
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ffc107;">
            <h3 style="margin-top: 0; color: #997404;">Need Help?</h3>
            <p style="margin: 0; color: #856404;">If you have any questions or need assistance, our support team is always ready to help. Simply use the contact form on our website.</p>
          </div>
          
          <p style="font-size: 16px; margin-top: 30px;">Happy travels!</p>
          <p style="margin-top: 20px;">Best regards,<br><strong>Helnay Rentals Team</strong></p>
        </div>
        
        <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 20px;">
        <p style="font-size: 12px; color: #6c757d; text-align: center; padding: 0 20px;">
          Helnay Rentals | <a href="https://helnay.onrender.com" style="color: #0d6efd;">Visit Website</a><br>
          You received this email because you created an account at Helnay Rentals.
        </p>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    console.log(`✓ Welcome email sent to ${user.email} via SendGrid`);
    return true;
  } catch (error) {
    console.warn(`⚠️ Welcome email failed (registration still successful): ${error.message}`);
    if (error.response) {
      console.warn('SendGrid error details:', error.response.body);
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

// Send reply to contact message
async function sendContactReply(replyData) {
  if (!isEmailConfigured) {
    console.warn('⚠️ Email not sent - SendGrid API key not configured');
    return false;
  }

  const msg = {
    to: replyData.to_email,
    from: {
      email: getSenderEmail(),
      name: 'Helnay Rentals Support'
    },
    subject: replyData.subject,
    text: `Dear ${replyData.to_name},

${replyData.reply}

Best regards,
Helnay Rentals Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <div style="background-color: #0d6efd; color: white; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
          <h2 style="margin: 0;">Helnay Rentals</h2>
        </div>
        
        <div style="padding: 30px 20px;">
          <p>Dear ${replyData.to_name},</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #0d6efd;">
            <p style="margin: 0; white-space: pre-wrap;">${replyData.reply}</p>
          </div>
          
          <p style="margin-top: 30px;">If you have any further questions, please don't hesitate to reach out.</p>
          
          <p style="margin-top: 30px;">Best regards,<br><strong>Helnay Rentals Team</strong></p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 15px; text-align: center; border-radius: 0 0 10px 10px; margin-top: 20px;">
          <p style="margin: 0; color: #6c757d; font-size: 0.9em;">This email was sent in response to your contact form submission.</p>
        </div>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    console.log(`✓ Contact reply sent to ${replyData.to_email} via SendGrid`);
    return true;
  } catch (error) {
    console.error('Error sending contact reply:', error);
    return false;
  }
}

// Send email verification email
async function sendVerificationEmail(user, token) {
  if (!isEmailConfigured) {
    console.warn('⚠️ Email not sent - SendGrid API key not configured');
    return false;
  }

  const verificationUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/verify-email/${token}`;

  const msg = {
    to: user.email,
    from: {
      email: getSenderEmail(),
      name: 'Helnay Rentals'
    },
    subject: '✉️ Verify Your Email Address',
    text: `Dear ${user.name},

Thank you for registering with Helnay Rentals!

Please verify your email address by clicking the link below:
${verificationUrl}

This link will expire in 24 hours.

If you didn't create an account, please ignore this email.

Best regards,
Helnay Rentals Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #0d6efd; margin-bottom: 20px;">Verify Your Email</h2>
          <p style="font-size: 16px; line-height: 1.6;">Dear ${user.name},</p>
          <p style="font-size: 16px; line-height: 1.6;">Thank you for registering with Helnay Rentals!</p>
          <p style="font-size: 16px; line-height: 1.6;">Please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #0d6efd; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; display: inline-block;">Verify Email Address</a>
          </div>
          <p style="font-size: 14px; color: #6c757d; line-height: 1.6;">This link will expire in 24 hours.</p>
          <p style="font-size: 14px; color: #6c757d; line-height: 1.6;">If you didn't create an account, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #dee2e6;">
          <p style="font-size: 14px; color: #6c757d;">Best regards,<br>Helnay Rentals Team</p>
        </div>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    console.log(`✓ Verification email sent to ${user.email}`);
    return true;
  } catch (error) {
    console.error('Email send error:', error.message);
    if (error.response) {
      console.error('SendGrid error details:', error.response.body);
    }
    return false;
  }
}

module.exports = {
  sendBookingApprovalEmail,
  sendBookingDenialEmail,
  sendBookingDateChangeEmail,
  sendBookingCancellationEmail,
  sendContactNotificationToAdmin,
  sendWelcomeEmail,
  sendContactReply,
  sendVerificationEmail
};
