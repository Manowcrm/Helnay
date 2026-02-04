# 🧪 Quick Testing Guide - New UX Features

## ✅ How to Test Your New Features

### Prerequisites
1. Server is running at http://localhost:3000
2. You have a registered user account
3. You're logged in

---

## 1. 🔍 Test Advanced Search & Filters

### Steps:
1. Go to homepage (http://localhost:3000)
2. Click "Advanced Filters" to expand the filter panel
3. Try these searches:

**Test 1: Location Search**
- Enter "Mountain" in location field
- Click "Apply Filters"
- ✅ Should show only mountain listings

**Test 2: Price Range**
- Enter Min: 100, Max: 300
- ✅ Should show only listings between $100-$300

**Test 3: Category Filter**
- Select "Entire Home" from dropdown
- ✅ Should filter by category

**Test 4: Bedrooms Filter**
- Select "3+" bedrooms
- ✅ Should show only listings with 3+ bedrooms

**Test 5: Sort Options**
- Select "Price: Low to High"
- ✅ Listings should reorder cheapest first

**Test 6: Clear All**
- Click "Clear All Filters"
- ✅ Should reset to showing all listings

---

## 2. ❤️ Test Favorites System

### Steps:
1. On homepage, find a listing you like
2. Click the heart button (❤️) in the top-right corner

**Expected Behavior:**
- ✅ Heart fills with red color (no page reload!)
- ✅ Toast notification: "Added to favorites"
- ✅ Click heart again → removes from favorites
- ✅ Toast notification: "Removed from favorites"

**Persistence Test:**
1. Add 3-4 listings to favorites
2. Logout and login again
3. ✅ Hearts should still be filled on those listings

---

## 3. 📊 Test User Dashboard

### Steps:
1. Click "Dashboard" in the navigation menu (http://localhost:3000/dashboard)

**What You Should See:**

**Stats Cards (Top Row):**
- ✅ Active Bookings count
- ✅ Completed Bookings count
- ✅ Pending Bookings count
- ✅ Favorites count (should match number you favorited)

**Verification Status:**
- ✅ Shows your trust score
- ✅ Progress bar indicates verification level
- ✅ Status badge (Verified/Pending/Not Verified)

**My Bookings Table:**
- ✅ Shows all your bookings
- ✅ Color-coded status badges:
  - 🟢 Green = Approved
  - 🟡 Yellow = Pending
  - 🔴 Red = Rejected
  - ⚫ Gray = Cancelled
- ✅ Cancel button for upcoming bookings

**Saved Favorites Section:**
- ✅ Shows grid of favorited listings
- ✅ "View" button goes to listing page
- ✅ "Remove" button removes from favorites

**Test Cancel Booking:**
1. Find an upcoming booking (status: Approved)
2. Click "Cancel Booking"
3. Click "Yes, Cancel" in modal
4. ✅ Status changes to "Cancelled"

---

## 4. ⏳ Test Loading States

### Test 1: Global Loading Overlay
1. Submit a booking form
2. ✅ Screen should blur with spinner
3. ✅ "Loading..." message displays
4. ✅ Overlay disappears when complete

### Test 2: Form Loading States
1. Find any form with file upload
2. Click submit
3. ✅ Button shows spinner
4. ✅ Button text changes to "Loading..."
5. ✅ Button is disabled (can't click again)

### Test 3: Camera Capture Loading
1. Go to verification page
2. Click "Capture Selfie"
3. ✅ Button shows spinner during capture

### Test 4: Toast Notifications
1. Add a listing to favorites
2. ✅ Green toast appears: "Added to favorites"
3. ✅ Toast auto-dismisses after 5 seconds
4. Remove the favorite
5. ✅ Red toast appears: "Removed from favorites"

---

## 5. 📱 Test Mobile Responsive Design

### Using Chrome DevTools:
1. Press F12 to open DevTools
2. Click the device icon (Toggle Device Toolbar)
3. Select different devices:

**iPhone SE (375px):**
- ✅ 1 column listing grid
- ✅ Filters collapse by default
- ✅ Tables scroll horizontally
- ✅ Buttons full-width

**iPad (768px):**
- ✅ 2 column listing grid
- ✅ Navigation adapts
- ✅ Stats cards stack properly

**Desktop (1200px+):**
- ✅ 3 column listing grid
- ✅ Filters expanded by default
- ✅ Full navigation visible

**Touch Targets:**
- ✅ Favorite hearts are easy to tap
- ✅ Buttons min 48x48px
- ✅ Form inputs not too small

---

## 6. 🎨 Test Error Message Consistency

### Steps:
1. Try logging in with wrong password
2. ✅ Red error alert with icon
3. Try registering with invalid email
4. ✅ Red error alert with icon
5. Successfully log in
6. ✅ Green success alert with icon

**Visual Check:**
- ✅ All errors have red left border
- ✅ All successes have green left border
- ✅ Icons match message type
- ✅ Consistent padding/margins

---

## 🐛 Common Issues & Fixes

### Issue: Favorites not saving
**Fix:** Make sure you're logged in. Favorites require authentication.

### Issue: Dashboard shows "Error loading dashboard"
**Fix:** Check terminal for SQL errors. Verify database has `favorites` table.

### Issue: Search filters not working
**Fix:** Check URL parameters. Filters append to URL like `?location=Mountain&min_price=100`

### Issue: Loading overlay stuck
**Fix:** Check browser console (F12) for JavaScript errors.

### Issue: Heart button doesn't toggle
**Fix:** Check browser console. CSRF token might be missing or invalid.

### Issue: Mobile layout broken
**Fix:** Clear browser cache (Ctrl+Shift+R) and reload.

---

## 📊 Expected Database Changes After Testing

After testing, your database should have:

**New entries in `favorites` table:**
```sql
SELECT * FROM favorites;
-- Should show user_id, listing_id, created_at for each favorite
```

**Updated `bookings` table:**
```sql
SELECT * FROM bookings WHERE status = 'cancelled';
-- Should show cancelled bookings from dashboard
```

**Check favorites count:**
```sql
SELECT u.email, COUNT(f.id) as favorite_count
FROM users u
LEFT JOIN favorites f ON u.id = f.user_id
GROUP BY u.id;
-- Shows how many favorites each user has
```

---

## ✅ Testing Checklist

Use this checklist to verify all features:

### Search & Filters
- [ ] Location filter works
- [ ] Price min/max filters work
- [ ] Category filter works
- [ ] Bedrooms filter works
- [ ] Guests filter works
- [ ] Sort by price (low/high) works
- [ ] Sort by bedrooms works
- [ ] Sort by guests works
- [ ] Clear all resets filters
- [ ] Listing count badge updates
- [ ] URL parameters update

### Favorites
- [ ] Heart button toggles on/off
- [ ] No page reload (AJAX)
- [ ] Toast notification shows
- [ ] Favorites persist after logout
- [ ] Dashboard shows favorites
- [ ] Remove from dashboard works
- [ ] Favorite count in stats correct

### Dashboard
- [ ] Stats cards show correct numbers
- [ ] Bookings table displays
- [ ] Status badges color-coded
- [ ] Cancel booking works
- [ ] Modal confirmation works
- [ ] Verification status shows
- [ ] Trust score displays
- [ ] Favorites grid shows

### Loading States
- [ ] Global overlay shows
- [ ] Toast notifications work
- [ ] Auto-dismiss after 5 seconds
- [ ] Form buttons show spinner
- [ ] Camera capture shows loading
- [ ] Multiple toasts stack

### Mobile Responsive
- [ ] 1 column on mobile (375px)
- [ ] 2 columns on tablet (768px)
- [ ] 3 columns on desktop (1200px)
- [ ] Tables scroll on mobile
- [ ] Touch targets 48x48px+
- [ ] Navigation adapts
- [ ] Filters collapse on mobile

### Error Messages
- [ ] Login errors styled consistently
- [ ] Registration errors styled
- [ ] Booking errors styled
- [ ] Success messages styled
- [ ] Icons display correctly

---

## 🎉 Success Criteria

Your features are working correctly if:

✅ You can favorite listings without page reload  
✅ Dashboard shows all your activities in one place  
✅ Search filters reduce listings to exactly what you want  
✅ Loading spinners show during every operation  
✅ Mobile view works perfectly on phone screens  
✅ All error/success messages look the same  

**If all checkboxes are checked, features are production-ready!** 🚀

---

## 📸 Screenshots to Take (Optional)

Document your implementation:

1. Homepage with favorites (hearts filled)
2. Advanced filters panel expanded
3. User dashboard with stats
4. Bookings table with statuses
5. Favorites grid
6. Mobile view (375px width)
7. Toast notification
8. Loading overlay

Save in `screenshots/` folder for documentation.

---

## 🛠️ Developer Testing Tools

### Browser Console Commands

**Check favorite IDs:**
```javascript
// Run in browser console on homepage
console.log('Favorite IDs:', favoriteIds);
```

**Test loading overlay:**
```javascript
loadingOverlay.show();
setTimeout(() => loadingOverlay.hide(), 2000);
```

**Test toast:**
```javascript
showToast('Test message', 'success');
showToast('Error message', 'error');
```

**Check AJAX favorite:**
```javascript
// Should see fetch request in Network tab (F12 → Network)
// Look for: POST /favorites/toggle/:id
```

---

## 📞 Support

If you encounter issues:

1. Check browser console (F12 → Console)
2. Check server logs in terminal
3. Check database with: `node check-listings.js`
4. Refer to [UX-FEATURES-IMPLEMENTED.md](UX-FEATURES-IMPLEMENTED.md)

Happy testing! 🎉
