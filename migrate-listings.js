require('dotenv').config();
const db = require('./db');

(async () => {
  try {
    await db.init();
    
    console.log('Adding missing columns to listings table...');
    
    // Add columns one by one
    const columnsToAdd = [
      { name: 'bedrooms', type: 'INTEGER DEFAULT 1' },
      { name: 'bathrooms', type: 'INTEGER DEFAULT 1' },
      { name: 'type', type: 'TEXT' },
      { name: 'max_guests', type: 'INTEGER' },
      { name: 'amenities', type: 'TEXT' }
    ];
    
    for (const col of columnsToAdd) {
      try {
        await db.run(`ALTER TABLE listings ADD COLUMN ${col.name} ${col.type}`);
        console.log(`✓ Added column: ${col.name}`);
      } catch (err) {
        if (err.message.includes('duplicate column name')) {
          console.log(`  Column ${col.name} already exists`);
        } else {
          console.error(`✗ Error adding ${col.name}:`, err.message);
        }
      }
    }
    
    // Verify the schema
    const info = await db.all('PRAGMA table_info(listings)');
    console.log('\nCurrent listings table columns:');
    info.forEach(col => console.log(`  - ${col.name} (${col.type})`));
    
    console.log('\n✓ Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
