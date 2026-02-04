# Email Not Sending - SMTP Authentication Issue

## Problem
Users are not receiving verification emails because the Gmail SMTP credentials are invalid.

Error: `Invalid login: 535-5.7.8 Username and Password not accepted`

## Root Cause
Gmail no longer accepts regular account passwords for SMTP authentication. You need to use an **App Password**.

## Solution: Generate Gmail App Password

### Step 1: Enable 2-Step Verification
1. Go to your Google Account: https://myaccount.google.com
2. Navigate to **Security**
3. Enable **2-Step Verification** if not already enabled

### Step 2: Generate App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Sign in with your Google Workspace account (info@helnay.com)
3. Select **Mail** as the app
4. Select **Other (Custom name)** as the device
5. Enter "Helnay Rental Platform" as the name
6. Click **Generate**
7. **Copy the 16-character password** (example: `abcd efgh ijkl mnop`)

### Step 3: Update Environment Variables

#### For Render.com Production:
1. Go to your Render dashboard: https://dashboard.render.com
2. Select your Helnay service
3. Go to **Environment** tab
4. Update `SMTP_PASS` with the new 16-character app password (remove spaces)
5. Save changes and redeploy

#### For Local Development (.env file):
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=info@helnay.com
SMTP_PASS=abcdefghijklmnop   ← Replace with your 16-char app password (no spaces)
ADMIN_EMAIL=info@helnay.com
BASE_URL=https://helnay.com
REQUIRE_EMAIL_VERIFICATION=true
```

## Alternative: Use SendGrid Instead

If you prefer not to use Gmail SMTP, you can use SendGrid (more reliable for production):

1. Sign up at: https://sendgrid.com (free tier: 100 emails/day)
2. Create an API key
3. Update your email-service.js to use SendGrid
4. Set `SENDGRID_API_KEY` in Render environment variables

## Testing After Setup

Run this command to test email sending:
```bash
node test-email-verification.js
```

Expected output:
```
✅ SMTP Server is ready to send emails
✅ Test email sent successfully!
```

## Important Notes

- App passwords are 16 characters long (ignore spaces)
- Keep your app password secure - don't commit to GitHub
- The .env file is already in .gitignore (safe)
- Update BOTH Render (production) AND local .env
- BASE_URL must be https://helnay.com for production emails

## Current Status

❌ SMTP_PASS is invalid - needs to be updated with App Password
✅ SMTP configuration is correct
✅ Code is working properly
✅ BASE_URL updated to https://helnay.com
