const db = require('./db');

/**
 * Dynamic Sitemap Generator
 * Generates sitemap.xml with all listings dynamically
 */

async function generateSitemap() {
  const baseUrl = 'https://helnay.com';
  const today = new Date().toISOString().split('T')[0];
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  
  // Homepage
  xml += `  <url>\n`;
  xml += `    <loc>${baseUrl}/</loc>\n`;
  xml += `    <lastmod>${today}</lastmod>\n`;
  xml += `    <changefreq>daily</changefreq>\n`;
  xml += `    <priority>1.0</priority>\n`;
  xml += `  </url>\n\n`;
  
  // Category pages
  const categories = [
    { url: '/beach-houses', priority: 0.9 },
    { url: '/city-stays', priority: 0.9 },
    { url: '/mountain-retreats', priority: 0.9 },
    { url: '/entire-homes', priority: 0.9 }
  ];
  
  categories.forEach(cat => {
    xml += `  <url>\n`;
    xml += `    <loc>${baseUrl}${cat.url}</loc>\n`;
    xml += `    <changefreq>daily</changefreq>\n`;
    xml += `    <priority>${cat.priority}</priority>\n`;
    xml += `  </url>\n\n`;
  });
  
  // Static pages
  const staticPages = [
    { url: '/about', priority: 0.7 },
    { url: '/contact', priority: 0.7 },
    { url: '/become-a-host', priority: 0.8 }
  ];
  
  staticPages.forEach(page => {
    xml += `  <url>\n`;
    xml += `    <loc>${baseUrl}${page.url}</loc>\n`;
    xml += `    <changefreq>monthly</changefreq>\n`;
    xml += `    <priority>${page.priority}</priority>\n`;
    xml += `  </url>\n\n`;
  });
  
  // Get all listings from database
  try {
    const listings = await db.all('SELECT id, created_at FROM listings ORDER BY id');
    
    listings.forEach(listing => {
      const lastmod = listing.created_at ? listing.created_at.split('T')[0] : today;
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/listings/${listing.id}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.8</priority>\n`;
      xml += `  </url>\n`;
    });
  } catch (err) {
    console.error('Error fetching listings for sitemap:', err);
  }
  
  xml += '</urlset>';
  
  return xml;
}

module.exports = { generateSitemap };
