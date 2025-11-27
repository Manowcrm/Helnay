# Helnay

Home rental booking platform with admin dashboard and email notifications.

## Features

- 🏠 Property listings with images
- 📅 Booking system with date/time validation
- 💳 Secure payment processing with Stripe
- 👥 User authentication (admin & regular users)
- 📊 Admin dashboard for managing listings, bookings, and users
- 📧 Email notifications (approval, denial, cancellation, welcome)
- 🔍 Search and filter properties
- 📱 Responsive design

## Live Site

https://helnay.onrender.com

**Admin Credentials:**
- Email: `sysadmin.portal@helnay.com`
- Password: `Hln@y2024$ecureAdm!n`

## Payment Processing

Payments are processed securely through **Stripe**. Users can pay for their bookings with credit/debit cards.

**Setup:**
1. Create a Stripe account at https://stripe.com
2. Get your API keys from the Stripe Dashboard
3. Set environment variables:
   - `STRIPE_SECRET_KEY` - Your Stripe secret key (sk_test_... or sk_live_...)
   - `STRIPE_PUBLISHABLE_KEY` - Your Stripe publishable key (pk_test_... or pk_live_...)
   - `STRIPE_WEBHOOK_SECRET` - Your webhook signing secret (whsec_...)

**Webhook Setup:**
For production, configure a webhook endpoint at `https://your-domain.com/webhook/stripe` to receive payment confirmation events.

## Email Notifications

Email notifications are powered by **SendGrid** (100 emails/day on free tier). Users receive emails for:
- 🎉 Welcome emails on registration
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