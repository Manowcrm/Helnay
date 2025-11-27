# Helnay

Home rental booking platform with admin dashboard and email notifications.

## Features

- 🏠 Property listings with images
- 📅 Booking system with date/time validation
- 👥 User authentication (admin & regular users)
- 📊 Admin dashboard for managing listings, bookings, and users
- 📧 Email notifications (approval, denial, cancellation)
- 🔍 Search and filter properties
- 📱 Responsive design

## Live Site

https://helnay.onrender.com

**Admin Credentials:**
- Email: `sysadmin.portal@helnay.com`
- Password: `Hln@y2024$ecureAdm!n`

## Email Notifications

**Important:** Render.com's free tier blocks outbound SMTP connections (ports 25, 465, 587), so email notifications may fail with timeout errors. Bookings will still be approved/denied successfully, but users won't receive email confirmations.

**Solutions for production:**
1. **SendGrid** (Free tier: 100 emails/day) - Recommended
2. **Mailgun** (Free tier: 5,000 emails/month)
3. **AWS SES** (Pay as you go, very cheap)

These services use HTTP APIs instead of SMTP, so they work on all hosting platforms.

## Tech Stack

- Node.js + Express
- SQLite (database)
- EJS (templating)
- Bootstrap 5
- Nodemailer (email)

## Local Development

```bash
npm install
node server.js
```

Visit http://localhost:3000

## Deployment

Deployed on Render.com using Blueprint (render.yaml)