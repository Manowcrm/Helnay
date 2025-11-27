# Stripe Payment Setup Guide

## 1. Create Stripe Account

1. Go to https://stripe.com
2. Click "Sign up" and create your account
3. Verify your email address

## 2. Get Your API Keys

### For Testing (Development):
1. Log in to Stripe Dashboard
2. Click **Developers** in the left sidebar
3. Click **API keys**
4. You'll see:
   - **Publishable key** (starts with `pk_test_`)
   - **Secret key** (starts with `sk_test_`) - Click "Reveal test key"

### For Production (Live):
1. Toggle from "Test mode" to "Live mode" in the dashboard
2. Complete your business profile
3. Add bank account details
4. Get your live keys (`pk_live_...` and `sk_live_...`)

## 3. Add Keys to Render Environment Variables

1. Go to https://dashboard.render.com
2. Select your **Helnay** service
3. Click **Environment** in the left sidebar
4. Add these environment variables:

```
STRIPE_SECRET_KEY=sk_test_your_actual_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_publishable_key_here
```

5. Click **Save Changes**
6. Your service will automatically redeploy

## 4. Test the Payment Flow

### Using Stripe Test Cards:

**Successful Payment:**
- Card: `4242 4242 4242 4242`
- Expiry: Any future date (e.g., 12/34)
- CVC: Any 3 digits (e.g., 123)
- ZIP: Any 5 digits (e.g., 12345)

**Payment Requires Authentication (3D Secure):**
- Card: `4000 0025 0000 3155`
- Expiry: Any future date
- CVC: Any 3 digits
- ZIP: Any 5 digits

**Card Declined:**
- Card: `4000 0000 0000 9995`
- Expiry: Any future date
- CVC: Any 3 digits
- ZIP: Any 5 digits

### Test Flow:
1. Go to https://helnay.onrender.com
2. Click "Book Now" on any listing
3. Fill in the booking form
4. You'll be redirected to the payment page
5. Enter a test card number
6. Click "Pay"
7. You should see the success page

## 5. Set Up Webhooks (Optional - For Production)

Webhooks ensure payment confirmation even if the user closes their browser.

1. In Stripe Dashboard, go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Enter your webhook URL: `https://helnay.onrender.com/webhook/stripe`
4. Select events to listen for: `payment_intent.succeeded`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)
7. Add to Render environment variables:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_your_signing_secret_here
   ```

## 6. Go Live (When Ready)

When you're ready to accept real payments:

1. Complete Stripe onboarding (business info, bank account)
2. Switch to **Live mode** in Stripe Dashboard
3. Get your live API keys (`pk_live_...` and `sk_live_...`)
4. Update environment variables in Render with live keys
5. Set up production webhook with live mode
6. Test with a real card (you can refund it immediately)

## Payment Features

✅ **What's Included:**
- Secure card payment processing
- Automatic booking cost calculation (nights × price)
- Payment status tracking (paid/unpaid)
- Admin dashboard shows payment status
- PCI-compliant (Stripe handles card data)
- Payment confirmation page
- Stripe receipt emails to customers

✅ **Security:**
- Card details never touch your server
- All processing through Stripe's secure infrastructure
- HTTPS required for live mode
- Webhook signature verification

## Troubleshooting

**"Payment system is not configured" message:**
- Check that `STRIPE_PUBLISHABLE_KEY` is set in Render environment variables
- Make sure you saved changes and redeployed

**Payment fails immediately:**
- Verify `STRIPE_SECRET_KEY` is correct in environment variables
- Check Stripe Dashboard → Logs for error details

**Payment succeeds but booking shows "unpaid":**
- This is normal for test mode without webhooks
- Users will still see success page
- Set up webhooks for automatic status updates

## Support

- Stripe Documentation: https://stripe.com/docs
- Stripe Test Cards: https://stripe.com/docs/testing
- Stripe Dashboard: https://dashboard.stripe.com

Need help? Contact support through the Stripe dashboard.
