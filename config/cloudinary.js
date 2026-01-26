const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'drsz9dqpo',
  api_key: process.env.CLOUDINARY_API_KEY || '459677147625943',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'i8PWcWKwuK0GTM49kjdFc-ICzu0',
});

module.exports = cloudinary;

