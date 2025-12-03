/**
 * Database Backup Script for Helnay Rentals
 * Automatically backs up the SQLite database with rotation
 */

const fs = require('fs');
const path = require('path');

// Configuration
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'data');
const DB_FILE = path.join(DB_PATH, 'helnay.db');
const SESSION_FILE = path.join(DB_PATH, 'sessions.db');
const BACKUP_DIR = path.join(DB_PATH, 'backups');
const MAX_BACKUPS = 30; // Keep last 30 backups

/**
 * Create backup directory if it doesn't exist
 */
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log('✅ Created backup directory:', BACKUP_DIR);
  }
}

/**
 * Generate backup filename with timestamp
 */
function getBackupFilename(dbName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${dbName}_backup_${timestamp}.db`;
}

/**
 * Copy database file to backup location
 */
function backupDatabase(sourceFile, dbName) {
  if (!fs.existsSync(sourceFile)) {
    console.warn(`⚠️ Database file not found: ${sourceFile}`);
    return false;
  }

  const backupFile = path.join(BACKUP_DIR, getBackupFilename(dbName));
  
  try {
    fs.copyFileSync(sourceFile, backupFile);
    const stats = fs.statSync(backupFile);
    console.log(`✅ Backed up ${dbName}: ${backupFile} (${(stats.size / 1024).toFixed(2)} KB)`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to backup ${dbName}:`, error.message);
    return false;
  }
}

/**
 * Remove old backups, keeping only the most recent MAX_BACKUPS
 */
function rotateBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.db'))
      .map(f => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time); // Sort by modification time, newest first

    // Delete old backups
    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(MAX_BACKUPS);
      toDelete.forEach(file => {
        fs.unlinkSync(file.path);
        console.log(`🗑️ Deleted old backup: ${file.name}`);
      });
    }

    console.log(`📊 Total backups: ${Math.min(files.length, MAX_BACKUPS)}`);
  } catch (error) {
    console.error('❌ Failed to rotate backups:', error.message);
  }
}

/**
 * Main backup function
 */
function performBackup() {
  console.log('\n🔄 Starting database backup...');
  console.log('⏰ Timestamp:', new Date().toISOString());
  
  ensureBackupDir();
  
  let success = true;
  
  // Backup main database
  if (!backupDatabase(DB_FILE, 'helnay')) {
    success = false;
  }
  
  // Backup session database
  if (!backupDatabase(SESSION_FILE, 'sessions')) {
    success = false;
  }
  
  // Rotate old backups
  rotateBackups();
  
  if (success) {
    console.log('✅ Backup completed successfully\n');
  } else {
    console.log('⚠️ Backup completed with warnings\n');
  }
  
  return success;
}

/**
 * Manual backup - run directly
 */
if (require.main === module) {
  performBackup();
}

module.exports = {
  performBackup,
  BACKUP_DIR
};
