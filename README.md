# Helnay

Professional home rental booking platform with admin dashboard and secure payment processing.

## 🌟 Features

- 🏠 Property listings with images and amenities
- 📅 Booking system with date/time validation
- 💳 Secure payment processing with Stripe
- 👥 User authentication and verification
- 📊 Admin dashboard for managing listings, bookings, and users
- 📧 Email notifications (approval, denial, cancellation, welcome)
- 🔍 Advanced search and filtering
- 📱 Responsive mobile-first design
- 🛡️ Enterprise-grade security and rate limiting
- 📈 Production logging and monitoring

## 🚀 Live Site

**Production:** https://helnay.onrender.com

## 🔧 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
# Copy the example file
cp .env.example .env

# Generate a secure session secret
node generate-session-secret.js

# Edit .env and add your API keys
```

### 3. Run Locally
```bash
# Development mode
npm run dev

# Production mode
NODE_ENV=production npm start
```

### 4. Access the Application
- Homepage: http://localhost:3000
- Admin: http://localhost:3000/admin
- Health Check: http://localhost:3000/health

## 📚 Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment instructions
- **[PRODUCTION-CHECKLIST.md](PRODUCTION-CHECKLIST.md)** - Pre-deployment checklist
- **[PRODUCTION-IMPROVEMENTS.md](PRODUCTION-IMPROVEMENTS.md)** - Recent improvements
- **[SECURITY_ENHANCEMENTS.md](SECURITY_ENHANCEMENTS.md)** - Security features
- **[STRIPE_SETUP.md](STRIPE_SETUP.md)** - Payment setup guide
- **[USER-REGISTRATION-GUIDE.md](USER-REGISTRATION-GUIDE.md)** - User guide

## 🔑 Environment Variables

**Required:**
- `SESSION_SECRET` - Secure random string (generate with `node generate-session-secret.js`)
- `STRIPE_SECRET_KEY` - Stripe secret key (sk_live_... for production)
- `STRIPE_PUBLISHABLE_KEY` - Stripe publishable key (pk_live_... for production)
- `SENDGRID_API_KEY` - SendGrid API key for emails
- `ADMIN_EMAIL` - Verified sender email in SendGrid

**Optional but Recommended:**
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` - For backups
- `COOKIE_DOMAIN` - Your domain for cookies
- `BASE_URL` - Your production URL
- `LOG_LEVEL` - Logging level (info, warn, error)

See [.env.example](.env.example) for all options.

## 💳 Payment Processing

Payments are processed securely through **Stripe**:
1. Create account at https://stripe.com
2. Get API keys from Stripe Dashboard
3. Configure webhook: `https://your-domain.com/webhook/stripe`
4. Add keys to `.env`

## 📧 Email Notifications

Powered by **SendGrid** (100 emails/day free):
- Welcome emails on registration
- Email verification
- Booking confirmations
- Admin notifications

## 🛡️ Security Features

- ✅ Rate limiting on all forms
- ✅ CSRF protection
- ✅ Input validation and sanitization
- ✅ SQL injection prevention
- ✅ XSS protection
- ✅ Secure session management
- ✅ Helmet security headers
- ✅ Environment validation

## 📊 Monitoring

### Health Check
```bash
curl https://your-domain.com/health
```

### Logs
Production logs are stored in:
- `logs/error.log` - Errors only
- `logs/combined.log` - All activity

## 🏗️ Tech Stack

- **Backend:** Node.js, Express
- **Database:** SQLite with better-sqlite3
- **Authentication:** bcrypt, express-session
- **Payments:** Stripe
- **Email:** SendGrid
- **Security:** Helmet, express-rate-limit, express-validator
- **Logging:** Winston, Morgan
- **Views:** EJS templates

## 📱 Browser Support

- Chrome, Firefox, Safari, Edge (latest 2 versions)
- Mobile browsers (iOS Safari, Chrome)
- Progressive Web App ready

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

Copyright © 2026 Helnay. All rights reserved.

## 🆘 Support

For issues or questions:
1. Check the documentation in the `/docs` folder
2. Review `PRODUCTION-CHECKLIST.md` for common issues
3. Check `logs/error.log` for error details
4. Contact: admin@helnay.com

## Tech Stack

- Node.js + Express
- SQLite (database)
- EJS (templating)
- Bootstrap 5
- Stripe (payments)
- SendGrid (email)

## Local Development

```bash
npm install
node server.js
```

Visit http://localhost:3000

## Deployment

Deployed on Render.com using Blueprint (render.yaml)