const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

/**
 * Upload a file to S3
 * @param {string} filePath - local file path
 * @param {string} key - S3 object key (path in bucket)
 * @returns {Promise<string>} - S3 URL
 */
async function uploadToS3(filePath, key) {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET environment variable not set');
  
  const fileStream = fs.createReadStream(filePath);
  const uploadParams = {
    Bucket: bucket,
    Key: key,
    Body: fileStream,
    ContentType: 'application/x-sqlite3'
  };

  await s3.send(new PutObjectCommand(uploadParams));
  return `s3://${bucket}/${key}`;
}

/**
 * Backup the SQLite database to S3
 * @returns {Promise<string>} - S3 URL of backup
 */
async function backupDatabase() {
  const dbPath = path.join(__dirname, 'data', 'helnay.db');
  if (!fs.existsSync(dbPath)) {
    throw new Error('Database file not found');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `backups/helnay-${timestamp}.db`;
  
  const s3Url = await uploadToS3(dbPath, key);
  console.log('Database backed up to:', s3Url);
  return s3Url;
}

module.exports = { uploadToS3, backupDatabase };
