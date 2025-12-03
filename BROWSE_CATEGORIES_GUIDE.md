# Browse Categories Management System

## Overview
This system allows the super admin to manage the "Browse by Category" sections that appear on the homepage. Categories are now stored in the database and can be fully customized through the admin panel.

## Features Implemented

### 1. Database Structure
**Table:** `browse_categories`
- `id` - Primary key
- `title` - Category display name (e.g., "Entire Homes")
- `description` - Brief description of the category
- `filter_params` - URL query parameters for filtering listings (e.g., "category=home")
- `image_url` - Path to category image
- `display_order` - Order of appearance (lower numbers first)
- `is_active` - Enable/disable categories (1=active, 0=inactive)
- `created_at` - Timestamp

### 2. Default Categories (Seeded)
1. **Entire Homes** - Spacious homes perfect for families and groups
   - Filter: `category=home`
   
2. **City Stays** - Modern apartments in the heart of the city
   - Filter: `location=city`
   
3. **Beach Houses** - Coastal cottages with stunning ocean views
   - Filter: `location=seaside`
   
4. **Mountain Retreats** - Cozy cabins in scenic mountain locations
   - Filter: `location=highlands`

### 3. Admin Interface (`/admin/categories`)
Located at: `/admin/categories` (Super Admin only)

**Capabilities:**
- ✅ View all categories with preview cards
- ✅ Create new categories
- ✅ Edit existing categories (title, description, filter params, image URL, display order)
- ✅ Activate/Deactivate categories (hide without deleting)
- ✅ Delete categories
- ✅ Reorder categories using display order numbers
- ✅ All actions are logged in the activity log

**Features:**
- Visual cards showing category details
- Status badges (Active/Inactive)
- Image previews
- Filter parameters display
- Quick action buttons

### 4. Homepage Integration
The homepage now dynamically loads categories from the database:
- Only active categories are displayed (is_active = 1)
- Categories appear in order based on display_order
- Clicking a category filters listings using the filter_params
- Empty state handled gracefully if no categories exist

### 5. Activity Logging
All category management actions are logged:
- CREATE: New category created
- UPDATE: Category edited or status changed
- DELETE: Category removed
- Includes admin name, timestamp, IP address, and action details

## Usage Guide

### For Super Admin:

1. **Access Categories Management:**
   - Login to admin panel
   - Go to Dashboard → "Browse Categories" card
   - Or navigate directly to `/admin/categories`

2. **Create New Category:**
   - Click "Add New Category" button
   - Fill in required fields:
     * Title (e.g., "Luxury Villas")
     * Description (brief, shown in hover)
     * Filter Parameters (e.g., "type=villa" or "location=resort")
     * Image URL (upload to /public/images first)
     * Display Order (1, 2, 3... for ordering)
   - Click "Create Category"

3. **Edit Category:**
   - Click "Edit" button on any category card
   - Modify any field
   - Click "Save Changes"

4. **Deactivate/Activate:**
   - Click "Deactivate" to hide a category temporarily
   - Click "Activate" to make it visible again
   - Deactivated categories won't appear on homepage but data is preserved

5. **Delete Category:**
   - Click "Delete" button
   - Confirm deletion in modal
   - ⚠️ This permanently removes the category

6. **Reorder Categories:**
   - Edit each category's "Display Order" number
   - Lower numbers appear first (1, 2, 3...)
   - Save changes

### Filter Parameters Guide:
Use URL query parameters to filter listings:
- `category=home` - Filter by category
- `location=city` - Filter by location
- `type=apartment` - Filter by type
- Multiple: `location=seaside&type=cottage` - Combine filters

## Files Modified

### Backend:
1. **db.js**
   - Added `browse_categories` table definition
   - Added seeding for 4 default categories

2. **server.js**
   - Added routes:
     * GET `/admin/categories` - View all categories
     * POST `/admin/categories/create` - Create category
     * POST `/admin/categories/:id/edit` - Update category
     * POST `/admin/categories/:id/toggle` - Activate/deactivate
     * POST `/admin/categories/:id/delete` - Delete category
   - Modified GET `/` to load categories from database
   - All routes include activity logging

### Frontend:
1. **views/admin_categories.ejs** (NEW)
   - Full admin interface for category management
   - Bootstrap 5 design matching admin panel style
   - Modals for create/edit/delete operations
   - Visual category cards with images

2. **views/index.ejs**
   - Updated "Browse by Category" section
   - Now loads from database instead of hardcoded
   - Dynamic rendering based on active categories

3. **views/admin_dashboard.ejs**
   - Added "Browse Categories" card in super admin section
   - Links to `/admin/categories`

## Technical Details

### Security:
- Only super admins can access `/admin/categories`
- Uses `isSuperAdmin` middleware for all routes
- Regular admins cannot modify categories

### Database Queries:
```sql
-- Load active categories for homepage
SELECT * FROM browse_categories WHERE is_active = 1 ORDER BY display_order ASC

-- Load all categories for admin panel
SELECT * FROM browse_categories ORDER BY display_order ASC
```

### Activity Log Examples:
- "Created new browse category: Luxury Villas"
- "Updated browse category: Beach Houses"
- "Activated browse category: Mountain Retreats"
- "Deleted browse category: Old Category"

## Next Steps (Optional Enhancements)

1. **Image Upload:** Add file upload capability instead of manual URL entry
2. **Category Icons:** Add icon picker for custom Bootstrap icons per category
3. **Preview Mode:** Show live preview of how category will look on homepage
4. **Drag & Drop Reorder:** Visual drag-and-drop interface for ordering
5. **Analytics:** Track click counts for each category

## Testing

✅ Categories seeded on database initialization
✅ Homepage loads categories dynamically
✅ Admin panel displays all categories
✅ Create new category works
✅ Edit category works
✅ Toggle active status works
✅ Delete category works
✅ Activity logging works
✅ Only super admin can access

## Support

If categories don't appear on homepage:
1. Check that at least one category has `is_active = 1`
2. Verify display_order values are set
3. Check filter_params are valid URL parameters
4. Review activity log for any errors

To reset to defaults:
1. Delete all categories from admin panel
2. Restart server - default 4 categories will be re-seeded
