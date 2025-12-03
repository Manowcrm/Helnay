# Connect helnay.com to Render via Cloudflare

## Step 1: Add Your Domain to Cloudflare

1. **Go to Cloudflare Dashboard**: https://dash.cloudflare.com/
2. **Click "Add a Site"**
3. **Enter your domain**: `helnay.com`
4. **Select Free Plan** (unless you want paid features)
5. **Click "Add Site"**

Cloudflare will scan your existing DNS records (this takes ~1 minute).

---

## Step 2: Update Nameservers at Your Domain Registrar

Cloudflare will give you **2 nameservers** that look like:
```
ns1.cloudflare.com
ns2.cloudflare.com
```
(Your actual nameservers will be different - copy them from Cloudflare)

### Update at Your Registrar:
1. **Log into your domain registrar** (where you bought helnay.com - GoDaddy, Namecheap, etc.)
2. **Find DNS/Nameserver settings**
3. **Replace existing nameservers** with Cloudflare's nameservers
4. **Save changes**

⏱️ **This can take 24-48 hours to propagate** (but often works in 1-2 hours)

---

## Step 3: Get Your Render Deployment URL

1. **Go to Render Dashboard**: https://dashboard.render.com/
2. **Find your Helnay service**
3. **Copy the URL** - looks like: `helnay.onrender.com` or `helnay-xyz.onrender.com`

---

## Step 4: Add DNS Records in Cloudflare

### Option A: Using CNAME (Recommended)

1. **Go to Cloudflare Dashboard** → Your site → **DNS** → **Records**
2. **Click "Add record"**

**For www.helnay.com:**
- Type: `CNAME`
- Name: `www`
- Target: `helnay.onrender.com` (your Render URL without https://)
- Proxy status: **Proxied** (orange cloud) ☁️
- TTL: Auto
- **Click "Save"**

**For root domain (helnay.com):**
- Type: `CNAME`
- Name: `@`
- Target: `helnay.onrender.com` (your Render URL without https://)
- Proxy status: **Proxied** (orange cloud) ☁️
- TTL: Auto
- **Click "Save"**

### Option B: Using A Record (Alternative)

If CNAME doesn't work for root domain:

1. **Ping your Render URL to get IP**:
   ```powershell
   nslookup helnay.onrender.com
   ```
   Copy the IP address (e.g., `216.24.57.1`)

2. **Add A Record**:
   - Type: `A`
   - Name: `@`
   - IPv4 address: `[IP from step 1]`
   - Proxy status: **Proxied** (orange cloud) ☁️
   - **Click "Save"**

---

## Step 5: Configure Custom Domain in Render

1. **Go to Render Dashboard** → Your Helnay service
2. **Click "Settings"** → **Custom Domains**
3. **Click "Add Custom Domain"**
4. **Enter**: `helnay.com`
5. **Click "Save"**
6. **Repeat for**: `www.helnay.com`

Render will automatically provision SSL certificates.

---

## Step 6: Configure Cloudflare SSL Settings

1. **Go to Cloudflare Dashboard** → Your site → **SSL/TLS**
2. **Set SSL/TLS encryption mode to**: `Full (strict)`
3. **Enable "Always Use HTTPS"**:
   - Go to **SSL/TLS** → **Edge Certificates**
   - Toggle **"Always Use HTTPS"** to ON

---

## Step 7: Update Your App Configuration (Optional)

If you have any hardcoded URLs in your code:

### Update Environment Variables on Render:
1. Go to Render Dashboard → Your service → **Environment**
2. Add/Update:
   ```
   BASE_URL=https://helnay.com
   ```
3. **Save Changes** (this will redeploy)

---

## Step 8: Test Your Setup

After DNS propagates (wait 1-24 hours):

### Test Commands:
```powershell
# Check DNS resolution
nslookup helnay.com
nslookup www.helnay.com

# Test HTTP access
curl -I https://helnay.com
curl -I https://www.helnay.com
```

### Browser Test:
1. Open: `https://helnay.com`
2. Open: `https://www.helnay.com`
3. Both should show your Helnay rental site! 🎉

---

## Cloudflare Benefits You Get FREE:

✅ **Global CDN** - Fast loading worldwide  
✅ **DDoS Protection** - Security against attacks  
✅ **Free SSL Certificate** - HTTPS automatically  
✅ **Caching** - Faster page loads  
✅ **Analytics** - Traffic insights  
✅ **Always Online** - Cached version if Render goes down  

---

## Troubleshooting

### Domain not resolving?
- Wait 24-48 hours for nameservers to propagate
- Check nameservers: `nslookup -type=ns helnay.com`

### SSL errors?
- Make sure Cloudflare SSL mode is **Full (strict)**
- Wait for Render to provision SSL certificate (takes 5-10 minutes)

### "Too many redirects"?
- Change Cloudflare SSL mode from "Flexible" to **"Full (strict)"**

### Site not loading?
- Verify Render URL works: `https://helnay.onrender.com`
- Check DNS records are correct in Cloudflare
- Make sure proxy is enabled (orange cloud)

---

## Quick Reference

| Setting | Value |
|---------|-------|
| Domain | helnay.com |
| Cloudflare SSL | Full (strict) |
| DNS Record Type | CNAME |
| DNS Target | helnay.onrender.com |
| Proxy Status | Proxied (orange cloud) |

---

## Need Help?

- **Cloudflare Docs**: https://developers.cloudflare.com/dns/
- **Render Docs**: https://render.com/docs/custom-domains
- **Check DNS Propagation**: https://www.whatsmydns.net/#CNAME/helnay.com

---

**Once setup is complete, your site will be live at:**
- 🌐 https://helnay.com
- 🌐 https://www.helnay.com

The old URL (helnay.onrender.com) will still work too!
