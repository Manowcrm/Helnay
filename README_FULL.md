# Helnay — Home Rental Demo

This repository is a starter home rental website built with Node.js + Express + SQLite and EJS templates.

Features included:
- Home page with listings
- Listing detail pages
- About and Contact pages (contact messages saved to the DB)
- Booking form that stores bookings in SQLite
- Admin view to list bookings (`/admin/bookings`)

Quick start (Windows PowerShell):

```powershell
# 1) Install dependencies
npm install

# 2) Start development server (auto-restarts with changes)
npm run dev

# or run normally:
npm start
```

The application will create a `data/helnay.db` SQLite database on first run and seed sample listings.

DB files are ignored by `.gitignore`.

Next steps and suggestions:
- Add authentication for listing owners and admin pages
- Add search, filters, images upload and galleries
- Integrate a payment provider for deposits
- Add calendar and availability checks

If you want, I can:
- Add user authentication and protected admin UI
- Add file uploads for listing photos
- Deploy this to a platform (Heroku, Render, Vercel with backend)
