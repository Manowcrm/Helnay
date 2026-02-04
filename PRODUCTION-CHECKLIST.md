# Production Deployment Checklist

## ✅ Pre-Deployment Checks

### Security
- [x] Environment variables validation (no test/placeholder keys)
- [x] Session secret required (no fallback)
- [x] Rate limiting on all forms
- [x] CSRF protection enabled
- [x] Helmet security headers configured
- [x] Input validation on all routes
- [x] SQL injection protection (parameterized queries)
- [x] XSS protection (input escaping)
- [x] Removed debug routes
- [x] Global error handler (no stack traces to users)

### Performance
- [x] Static asset caching (1 day in production)
- [x] ETags enabled
- [x] HTTP request logging (Morgan)
- [x] Session cleanup configured
- [x] Database connection pooling

### Monitoring & Logging
- [x] Winston logger configured
- [x] Log files rotation (5MB max, 5 files)
- [x] Error logs separate from combined logs
- [x] Health check endpoint (/health)
- [x] Request logging in production

### SEO
- [x] robots.txt created
- [x] sitemap.xml created
- [ ] Meta tags for all pages (recommended)
- [ ] Open Graph tags (recommended)
- [ ] Canonical URLs (recommended)

### Email
- [ ] SendGrid API key configured
- [ ] Verified sender email in SendGrid
- [ ] Email templates tested
- [ ] Unsubscribe links added (recommended)

### Payment
- [ ] Stripe live keys configured (not test keys)
- [ ] Webhook endpoint configured
- [ ] Webhook secret set
- [ ] Test transactions completed

### Database
- [ ] Backups configured (S3 or alternative)
- [ ] Database indexes optimized
- [ ] Migration scripts ready

## 🚀 Deployment Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Environment Variables
Copy `.env.example` to `.env` and fill in all values:

**Required:**
- `SESSION_SECRET` - Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `STRIPE_SECRET_KEY` - Get from Stripe Dashboard (use live key: sk_live_...)
- `STRIPE_PUBLISHABLE_KEY` - Get from Stripe Dashboard (use live key: pk_live_...)
- `STRIPE_WEBHOOK_SECRET` - Create webhook at https://dashboard.stripe.com/webhooks
- `SENDGRID_API_KEY` - Get from SendGrid Dashboard
- `ADMIN_EMAIL` - Must be verified in SendGrid

**Recommended:**
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` - For database backups
- `COOKIE_DOMAIN` - Set to your domain (e.g., `.helnay.com`)
- `BASE_URL` - Your production URL (e.g., `https://helnay.com`)
- `LOG_LEVEL` - Set to `info` or `warn` in production

**Optional:**
- `REQUIRE_EMAIL_VERIFICATION=true` - Require users to verify email before login

### 3. Database Setup
```bash
# Database will auto-initialize on first run
# Ensure write permissions: /opt/render/project/src/data/ (on Render)
```

### 4. Test Locally
```bash
NODE_ENV=production npm start
```

Visit:
- http://localhost:3000 - Homepage
- http://localhost:3000/health - Health check
- http://localhost:3000/admin - Admin dashboard

### 5. Deploy to Production

**Render.com (Recommended):**
1. Push code to GitHub
2. Connect repository in Render dashboard
3. Set environment variables in Render
4. Deploy from `main` branch
5. Monitor logs for startup errors

**Custom Server:**
```bash
# Using PM2 for process management
npm install -g pm2
pm2 start server.js --name helnay
pm2 save
pm2 startup
```

## 📊 Post-Deployment Checks

### Immediate (First 5 minutes)
- [ ] Health check responds: `curl https://your-domain.com/health`
- [ ] Homepage loads without errors
- [ ] Static assets load (CSS, images)
- [ ] Login/register forms work
- [ ] HTTPS certificate valid

### Within 24 hours
- [ ] User registration flow works end-to-end
- [ ] Email verification emails arrive
- [ ] Payment processing works (test with real card in live mode)
- [ ] Admin dashboard accessible
- [ ] Booking creation and approval flow
- [ ] Contact form sends emails

### Within 1 week
- [ ] Monitor error logs for issues
- [ ] Check health endpoint regularly
- [ ] Verify backups are running (if configured)
- [ ] Test on mobile devices
- [ ] Check page load times
- [ ] Monitor Stripe dashboard for transactions

## 🔧 Production Configuration

### Render Environment Variables
```
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
SESSION_SECRET=<generate-random-32-byte-hex>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
SENDGRID_API_KEY=SG...
ADMIN_EMAIL=admin@yourdomain.com
AWS_REGION=eu-west-2
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=your-bucket-name
COOKIE_DOMAIN=.yourdomain.com
BASE_URL=https://yourdomain.com
REQUIRE_EMAIL_VERIFICATION=true
```

### Stripe Webhook Configuration
1. Go to: https://dashboard.stripe.com/webhooks
2. Add endpoint: `https://yourdomain.com/webhook/stripe`
3. Select events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
4. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`

### SendGrid Setup
1. Verify your sender email at: https://app.sendgrid.com/settings/sender_auth
2. Create API key with "Mail Send" permissions
3. Add API key to `SENDGRID_API_KEY`
4. Set `ADMIN_EMAIL` to your verified sender email

## 🛡️ Security Best Practices

- **Never commit .env file to Git** - It's in .gitignore
- **Use strong session secret** - 32+ random bytes
- **Enable HTTPS only** - Configure in your hosting provider
- **Regular backups** - Daily database backups recommended
- **Monitor logs** - Check error.log daily for issues
- **Update dependencies** - Run `npm audit` monthly
- **Rate limiting** - Already configured, monitor for abuse
- **GDPR compliance** - Add privacy policy if serving EU users

## 📞 Support & Monitoring

### Health Check
```bash
# Should return status: healthy
curl https://yourdomain.com/health
```

### View Logs
```bash
# On Render: View in dashboard
# With PM2: pm2 logs helnay
# Direct: tail -f logs/error.log logs/combined.log
```

### Common Issues

**Database locked error:**
- Ensure only one process is accessing the database
- Check file permissions on data/ directory

**Session not persisting:**
- Verify SESSION_SECRET is set
- Check cookie domain matches your domain
- Ensure HTTPS is enabled

**Emails not sending:**
- Verify SendGrid API key is correct
- Check sender email is verified in SendGrid
- Look for errors in logs/error.log

**Stripe payments failing:**
- Use live keys (sk_live_..., pk_live_...)
- Verify webhook endpoint is accessible
- Check webhook secret matches

## 🎉 You're Live!

Your Helnay rental platform is now production-ready. Monitor the health endpoint and error logs regularly to ensure smooth operation.

For issues, check:
1. logs/error.log
2. Render dashboard logs
3. Stripe dashboard
4. SendGrid activity feed
