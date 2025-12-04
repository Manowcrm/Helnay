# 📧 Google Workspace SMTP Setup for info@helnay.com

## ✅ Email Configuration Updated

All email communications will now use: **info@helnay.com**

---

## 🔧 Google Workspace SMTP Settings

### Current Configuration:
```
SMTP Host: smtp.gmail.com
SMTP Port: 587
Email: info@helnay.com
Security: STARTTLS (TLS on port 587)
```

---

## 🔑 CRITICAL: Generate App Password for info@helnay.com

**IMPORTANT:** You MUST generate a new App Password for info@helnay.com to replace the old Gmail password!

### Step-by-Step Instructions:

### 1. Enable 2-Factor Authentication (if not already enabled)
1. Go to: https://myaccount.google.com/security
2. Log in with **info@helnay.com**
3. Find "2-Step Verification" section
4. Click "Get Started" and follow setup
5. Verify with phone number

### 2. Generate App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Log in with **info@helnay.com**
3. Select:
   - **App**: Mail
   - **Device**: Other (Custom name)
4. Name it: "Helnay Website SMTP"
5. Click "Generate"
6. **COPY THE 16-CHARACTER PASSWORD** (shown once!)
   - Example: `abcd efgh ijkl mnop`
   - Remove spaces: `abcdefghijklmnop`

### 3. Update Environment Variables

#### On Render Dashboard:
1. Go to: https://dashboard.render.com
2. Select your Helnay service
3. Click "Environment" tab
4. Update these variables:

```
SMTP_USER=info@helnay.com
SMTP_PASS=your-new-16-char-app-password-here
ADMIN_EMAIL=info@helnay.com
```

5. Click "Save Changes"
6. Render will auto-redeploy (takes 2-3 minutes)

#### Local Development (.env file):
Already updated in your `.env` file - just replace the `SMTP_PASS` value with your new App Password:

```env
SMTP_USER=info@helnay.com
SMTP_PASS=your-new-16-char-app-password-here
ADMIN_EMAIL=info@helnay.com
```

---

## 📨 What Emails Will Be Sent

All emails will now come from: **Helnay Rentals <info@helnay.com>**

### Types of Emails:

1. **Registration & Verification**
   - Subject: "✉️ Verify Your Email Address"
   - Contains verification link (24-hour expiry)

2. **Booking Confirmations**
   - Subject: "✅ Your Booking has been Approved!"
   - Booking details, check-in/out dates

3. **Booking Updates**
   - Subject: "📅 Your Booking Dates Have Been Updated"
   - Shows old vs new dates

4. **Booking Cancellations**
   - Subject: "Booking Update - Reservation Status Changed"
   - Cancellation notification

5. **Welcome Emails**
   - Subject: "🎉 Welcome to Helnay Rentals!"
   - Sent to new users after verification

6. **Contact Form Notifications**
   - To admin: "📬 New Contact Form Submission"
   - Reply-to set to customer's email

7. **Contact Replies**
   - From admin panel, reply to customer inquiries

---

## 🧪 Testing Email Configuration

After updating the App Password on Render, test emails:

### 1. Test Registration Email
```bash
# Have someone register at: https://helnay.com/register
# They should receive email from: info@helnay.com
```

### 2. Check Render Logs
```
Go to: Render Dashboard → Logs

Look for:
✓ SMTP email service configured
✓ Verification email sent to [email]

If you see errors:
❌ Email send error: Invalid login
→ App Password is wrong, regenerate it
```

### 3. Test Contact Form
```
1. Go to: https://helnay.com/contact
2. Fill out form
3. Check info@helnay.com inbox for notification
```

---

## 🔍 Troubleshooting

### Error: "Invalid login: 535-5.7.8 Username and Password not accepted"

**Solution:**
- Your App Password is incorrect
- Regenerate App Password at: https://myaccount.google.com/apppasswords
- Update SMTP_PASS in Render environment variables
- Make sure you removed spaces from the 16-character password

### Error: "Authentication failed"

**Solution:**
- 2FA might not be enabled on info@helnay.com
- Enable 2FA first at: https://myaccount.google.com/security
- Then generate App Password

### Emails Going to Spam

**Solutions:**
1. **Add SPF Record** to your DNS:
   ```
   Type: TXT
   Name: @
   Value: v=spf1 include:_spf.google.com ~all
   ```

2. **Add DKIM** (Google Workspace Admin):
   - Go to: admin.google.com
   - Security → Authentication
   - Generate DKIM key
   - Add to DNS records

3. **Add DMARC** to your DNS:
   ```
   Type: TXT
   Name: _dmarc
   Value: v=DMARC1; p=none; rua=mailto:info@helnay.com
   ```

### Google Workspace Daily Sending Limits

- **Free Trial**: 500 emails/day
- **Business Starter**: 2,000 emails/day
- **Business Standard/Plus**: 2,000 emails/day

For your website traffic, this should be more than enough!

---

## ✅ Verification Checklist

After setting up, verify:

- [ ] 2FA enabled on info@helnay.com
- [ ] App Password generated
- [ ] SMTP_USER updated to info@helnay.com on Render
- [ ] SMTP_PASS updated with new App Password on Render
- [ ] ADMIN_EMAIL updated to info@helnay.com on Render
- [ ] Render redeployed (automatic after saving env vars)
- [ ] Test registration email received from info@helnay.com
- [ ] Check Render logs show "✓ Verification email sent"
- [ ] Emails not going to spam (check inbox)
- [ ] Contact form notification received in info@helnay.com inbox

---

## 📋 Current Email Configuration Summary

### Before (Gmail):
```
From: Helnay Rentals <manowcrmabd@gmail.com>
Issues: Generic Gmail address, not professional
```

### After (Google Workspace):
```
From: Helnay Rentals <info@helnay.com>
Benefits: 
  ✅ Professional domain email
  ✅ Better deliverability
  ✅ Builds trust with customers
  ✅ Matches your website domain
```

---

## 🔐 Security Best Practices

1. **Never share your App Password** - it's as sensitive as your password
2. **Store in environment variables** - never commit to Git
3. **Regenerate if compromised** - easy to create new one
4. **Monitor email usage** - check Google Workspace dashboard
5. **Enable alerts** - get notified of suspicious activity

---

## 📞 Need Help?

**If emails still don't send after setup:**

1. Check Render logs for specific error messages
2. Verify info@helnay.com can send emails (send test email manually)
3. Confirm Google Workspace account is fully activated
4. Make sure billing is set up (if trial expired)
5. Check Google Workspace Admin console for any restrictions

**Common Issues:**
- Forgot to remove spaces from App Password
- Used regular password instead of App Password
- 2FA not enabled before generating App Password
- Wrong email address (typo in info@helnay.com)

---

Last Updated: December 4, 2025
