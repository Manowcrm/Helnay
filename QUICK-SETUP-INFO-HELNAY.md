# 🚀 QUICK SETUP: info@helnay.com Email Configuration

## ⚡ What You Need to Do RIGHT NOW

### Step 1: Generate App Password (5 minutes)

1. **Go to**: https://myaccount.google.com/apppasswords
2. **Log in with**: info@helnay.com
3. **If prompted to enable 2FA first**:
   - Go to: https://myaccount.google.com/security
   - Enable "2-Step Verification"
   - Verify with your phone
   - Then go back to App Passwords

4. **Generate Password**:
   - Select App: **Mail**
   - Select Device: **Other (Custom name)**
   - Name it: **Helnay Website SMTP**
   - Click **Generate**

5. **COPY THE 16-CHARACTER PASSWORD**:
   - Example: `abcd efgh ijkl mnop`
   - **Remove spaces**: `abcdefghijklmnop`
   - **Save it somewhere safe** (you'll need it twice)

### Step 2: Update Render (2 minutes)

1. **Go to**: https://dashboard.render.com
2. **Select** your Helnay service
3. **Click** "Environment" tab
4. **Update** these 3 variables:

```
SMTP_USER=info@helnay.com
SMTP_PASS=paste-your-16-char-password-here (no spaces!)
ADMIN_EMAIL=info@helnay.com
```

5. **Click** "Save Changes"
6. **Wait** 2-3 minutes for auto-redeploy

### Step 3: Update Local .env (1 minute)

Open your `.env` file and update:

```env
SMTP_USER=info@helnay.com
SMTP_PASS=paste-your-16-char-password-here
ADMIN_EMAIL=info@helnay.com
```

### Step 4: Test It! (2 minutes)

Run the test script:
```bash
node test-email-config.js
```

You should see:
```
✅ SMTP Connection Successful!
📤 Ready to send emails from: info@helnay.com
```

---

## ✅ What This Changes

### Before:
- Emails from: `manowcrmabd@gmail.com` ❌
- Generic Gmail address
- Less professional

### After:
- Emails from: `info@helnay.com` ✅
- Professional domain email
- Matches your website
- Better customer trust

---

## 📧 All Email Types Updated

Every email your website sends will now use `info@helnay.com`:

1. ✉️ **Registration Verification**
   - "Verify Your Email Address"
   - From: Helnay Rentals <info@helnay.com>

2. ✅ **Booking Confirmations**
   - "Your Booking has been Approved!"
   - From: Helnay Rentals <info@helnay.com>

3. 📅 **Booking Updates**
   - Date changes, cancellations
   - From: Helnay Rentals <info@helnay.com>

4. 🎉 **Welcome Emails**
   - New user welcome
   - From: Helnay Rentals <info@helnay.com>

5. 📬 **Contact Form**
   - Admin notifications
   - From: Helnay Contact Form <info@helnay.com>

6. 💬 **Admin Replies**
   - Responses to customer inquiries
   - From: Helnay Rentals Support <info@helnay.com>

---

## 🔍 Troubleshooting

### Error: "Invalid login: 535-5.7.8"
✅ **Solution**: Generate new App Password
- Your App Password is wrong or expired
- Go to: https://myaccount.google.com/apppasswords
- Generate new password for info@helnay.com
- Update in Render + .env file

### Error: "Username and Password not accepted"
✅ **Solution**: Enable 2FA first
- Go to: https://myaccount.google.com/security
- Enable "2-Step Verification"
- Then generate App Password

### Emails Going to Spam
✅ **Solution**: Add DNS records (optional but recommended)

Add to your domain DNS (helnay.com):

**SPF Record:**
```
Type: TXT
Name: @
Value: v=spf1 include:_spf.google.com ~all
```

**DMARC Record:**
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:info@helnay.com
```

---

## 📋 Verification Checklist

After setup, check these:

- [ ] App Password generated for info@helnay.com
- [ ] SMTP_USER updated to info@helnay.com (Render + local)
- [ ] SMTP_PASS updated with new App Password (Render + local)
- [ ] ADMIN_EMAIL updated to info@helnay.com (Render + local)
- [ ] Render redeployed (check Logs tab)
- [ ] Test script shows: ✅ SMTP Connection Successful
- [ ] Test registration at https://helnay.com/register
- [ ] Verification email received from info@helnay.com
- [ ] Email NOT in spam folder

---

## 🎯 Timeline

| Step | Time | Action |
|------|------|--------|
| 1 | 5 min | Generate App Password |
| 2 | 2 min | Update Render environment |
| 3 | 3 min | Wait for Render redeploy |
| 4 | 1 min | Update local .env |
| 5 | 1 min | Run test script |
| 6 | 2 min | Test registration |
| **Total** | **~15 min** | **Complete setup** |

---

## 💡 Tips

✅ **Save your App Password** - Store it in a password manager

✅ **Don't share it** - It's as sensitive as your password

✅ **Can regenerate anytime** - If lost, just create a new one

✅ **No regular password** - ONLY App Password works for SMTP

✅ **Remove spaces** - 16 characters, no spaces: `abcdefghijklmnop`

---

## 📞 Need Help?

**If emails still don't work:**

1. Check Render logs for errors
2. Verify info@helnay.com can send emails manually
3. Confirm Google Workspace is fully activated
4. Make sure 2FA is enabled
5. Try regenerating App Password

**Documentation:**
- Full guide: `GOOGLE-WORKSPACE-SMTP-SETUP.md`
- Test script: `node test-email-config.js`

---

**Last Updated**: December 4, 2025

**Status**: Configuration updated, awaiting App Password setup
