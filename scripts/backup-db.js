#!/usr/bin/env node
/**
 * CLI script to backup the database to S3
 * Usage: node scripts/backup-db.js
 */
require('dotenv').config();
const { backupDatabase } = require('../s3-backup');

backupDatabase()
  .then(url => {
    console.log('✅ Backup successful:', url);
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Backup failed:', err.message);
    process.exit(1);
  });
