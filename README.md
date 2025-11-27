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

Email notifications are powered by **SendGrid** (100 emails/day on free tier). Users receive emails for:
- ✅ Booking approvals
- ❌ Booking denials
- 📅 Booking date changes
- 🚫 Booking cancellations
- 📬 Contact form submissions (to admin)

**Configuration:**
Set the `SENDGRID_API_KEY` environment variable with your SendGrid API key.

## Tech Stack

- Node.js + Express
- SQLite (database)
- EJS (templating)
- Bootstrap 5
- SendGrid (email)

## Local Development

```bash
npm install
node server.js
```

Visit http://localhost:3000

## Deployment

Deployed on Render.com using Blueprint (render.yaml)