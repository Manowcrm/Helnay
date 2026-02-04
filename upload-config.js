const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads', 'verifications');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: userId_timestamp_random_originalname
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    const sanitizedName = basename.replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${req.session.userId}_${Date.now()}_${uniqueSuffix}_${sanitizedName}${ext}`);
  }
});

// File filter - only accept images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG) and PDF are allowed!'));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});

// Export configured upload middleware
module.exports = {
  // For single file upload
  single: (fieldName) => upload.single(fieldName),
  
  // For ID verification (only ID document - selfie is captured via camera as base64)
  idVerification: upload.single('id_document'),
  
  // For property listing images
  listingImages: upload.array('images', 10),
  
  // Upload directory path
  uploadDir: uploadDir
};
