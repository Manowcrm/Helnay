# Helnay - Home Rental Platform

## 🚀 Deployment Instructions

### **Option 1: Render.com (Recommended - Free)**

1. **Create Render Account**
   - Go to [render.com](https://render.com)
   - Sign up with GitHub

2. **Deploy from GitHub**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository: `Manowcrm/Helnay`
   - Render will auto-detect settings from `render.yaml`

3. **Set Environment Variables**
   - In Render dashboard, go to your service → Environment
   - Add these variables (use your actual values from `.env`):
     ```
     SMTP_HOST=smtp.gmail.com
     SMTP_USER=your-email@gmail.com
     SMTP_PASS=your-gmail-app-password
     ADMIN_EMAIL=your-admin-email@gmail.com
     AWS_REGION=your-aws-region
     AWS_ACCESS_KEY_ID=your-aws-access-key
     AWS_SECRET_ACCESS_KEY=your-aws-secret-key
     S3_BUCKET=your-s3-bucket-name
     ```
   
   **⚠️ Important:** Copy these from your local `.env` file, never commit them to Git!

4. **Deploy**
   - Click "Create Web Service"
   - Wait 2-3 minutes for deployment
   - Your site will be live at: `https://helnay.onrender.com`

5. **Custom Domain (Optional)**
   - Go to Settings → Custom Domain
   - Add your own domain (e.g., `helnay.com`)

---

### **Option 2: Railway.app (Easy Alternative)**

1. **Create Account**
   - Visit [railway.app](https://railway.app)
   - Login with GitHub

2. **Deploy**
   - Click "New Project" → "Deploy from GitHub"
   - Select `Manowcrm/Helnay`
   - Add environment variables (copy from your `.env` file)
   - Railway auto-deploys on push

**Your URL:** `https://helnay.up.railway.app`

---

### **Option 3: Heroku (Popular Choice)**

1. **Install Heroku CLI**
   ```powershell
   # Windows - Run in PowerShell as Admin
   winget install Heroku.HerokuCLI
   ```

2. **Deploy**
   ```powershell
   # Login
   heroku login

   # Create app
   heroku create helnay-rental

   # Set environment variables (use your actual values)
   heroku config:set SMTP_HOST=smtp.gmail.com
   heroku config:set SMTP_USER=your-email@gmail.com
   heroku config:set SMTP_PASS=your-gmail-app-password
   heroku config:set ADMIN_EMAIL=your-admin-email@gmail.com
   heroku config:set SESSION_SECRET=your-random-secret-key

   # Deploy
   git push heroku main
   ```

**Your URL:** `https://helnay-rental.herokuapp.com`

⚠️ **Note:** Heroku no longer has a free tier ($5-7/month minimum)

---

### **Option 4: Vercel (Fast but requires adaptation)**

Vercel is great but requires converting to serverless functions. Best for static sites.

---

### **Option 5: DigitalOcean App Platform**

- $5/month minimum
- Full control
- Great for scaling

---

## 🔧 **Pre-Deployment Checklist**

Before going public, ensure:

- [ ] Change admin password from `admin123`
- [ ] Review email credentials security
- [ ] Set strong `SESSION_SECRET`
- [ ] Enable HTTPS (auto on Render/Railway)
- [ ] Test booking flow
- [ ] Test email notifications
- [ ] Set up database backups

---

## 🎯 **Recommended: Start with Render.com**

**Why?**
- ✅ Free tier (750 hours/month)
- ✅ SQLite works with persistent disk
- ✅ Auto-deploys on Git push
- ✅ Free SSL/HTTPS
- ✅ Easy to use
- ✅ Great for your use case

---

## 📱 **After Deployment**

1. **Test Your Live Site**
   - Visit your public URL
   - Create a test booking
   - Check email notifications
   - Test admin login

2. **Share Your Link**
   - Your site is now accessible worldwide!
   - Example: `https://helnay.onrender.com`

3. **Monitor**
   - Check Render dashboard for logs
   - Monitor email delivery
   - Track user registrations

---

## 🆘 **Need Help?**

If you encounter issues:
1. Check Render logs: Dashboard → Logs
2. Verify environment variables are set
3. Ensure database disk is mounted
4. Test locally first: `npm start`

---

## 🚀 **Ready to Deploy?**

Choose Render.com and follow the steps above. Your app will be live in 5 minutes!
