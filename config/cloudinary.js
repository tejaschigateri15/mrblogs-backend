import cloudinary from 'cloudinary'; // Import the cloudinary module directly

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_KEY_SECRET
});

export default cloudinary;
