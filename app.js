import cookie from 'cookie';
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import blogschema from "./models/blog_schema.js";
import bcrypt from "bcrypt";
import profile from "./models/signup.js";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary"
import multer from "multer";
import TestImage from "./models/test_image.js";
import userprofile from "./models/user_profile.js";
import stripe from 'stripe';
import redis from 'redis';
import Category from "./models/Category.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  generateAccessToken,
  generateAccessTokenWithId,
} from "./token/AccessToken.js";
import generateRefreshToken from "./token/RefreshToken.js";
import verifyToken from './middleware/verifytoken.js';
import verifyTestToken from './middleware/verifyTestToken.js';
import asyncRedis from 'async-redis';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import compression from 'compression';
import sendEmail from './utils/nodemail.js';
import logger from './utils/logger.js';


dotenv.config();

const app = express();
app.set('trust proxy', 1);
app.use(helmet());

const port = process.env.port || 8080;
const dburi = process.env.mongoURI;


const limiter = rateLimit({
  windowMs: 100 * 60 * 1000,
  max: 1000, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Add a custom key generator function
  keyGenerator: (req) => {
    // Use the leftmost IP in the X-Forwarded-For header
    return req.ip || req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  },
});

// Security middleware

// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 1000 // limit each IP to 100 requests per windowMs
// });
app.use(limiter);


app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(hpp());

// Compression middleware
app.use(compression());

app.use(cors());

app.options('*', cors());

app.disable('x-powered-by');
app.use(express.json());

app.use(cookieParser());

app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: '35mb',
    parameterLimit: 50000,
  }),
);

// for local
const client = asyncRedis.createClient({
  
  socket: {
        host:  "localhost",
    // host:  "redis-service",

        port: 6379
    }
});

// console.log(process.env.REDIS_URL);

// cloud redis
// const client = asyncRedis.createClient({ url: process.env.REDIS_URL });
console.log("client : ",process.env.REDIS_URL);

client.on('error', (err) => {
  logger.error('Redis error:', err);
});

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});


mongoose.connect(dburi)
  .then((result) => {
    app.listen(port, () => {
      logger.info(`Server is running on port ${port}`);
    });
  })
  .catch((err) => {
    logger.error('MongoDB connection error:', err);
  });

cloudinary.config({

  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_KEY_SECRET
});


const uploader = multer({
  limits: { fileSize: 10 * 1024 * 1024 } // allow 10MB
});

function cloudinaryStorage(req, file) {
  return {
    destination: (req, file, callback) => {
      callback(null, ''); // Use Cloudinary's built-in storage
    },
    filename: (req, file, callback) => {
      callback(null, file.originalname);
    },
  };
}


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const Stripe = stripe(process.env.STRIPE_PRIVATE_KEY);

const checkCache = (req, res, next) => {
  const key = req.originalUrl;
  client.get(key, (err, data) => {
    if (err) throw err;

    if (data !== null) {
      res.status(200).json(JSON.parse(data));
    } else {
      next();
    }
  });
};


app.get('/', (req, res) => {
  res.send('hello world_123');
});

app.get('/test123', (req, res) => {
  res.send('hello from test123');
});

app.post('/', async (req, res) => {
  const { title, subtitle, body, author, comments, tags, views } = req.body;

  const data = new blogschema({
    title,
    subtitle,
    body,
    author,
    comments,
    tags,
    views
  });

  try {
    const dataToSave = await data.save();

    res.status(200).json(dataToSave);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//signup

app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  logger.info('Registration attempt:', { username, email });
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const data = new profile({
      username,
      email,
      password: hashedPassword
    });
    
    const dataToSave = await data.save();
    const { username: savedUsername, email: savedEmail } = dataToSave;
    
    logger.info('User registered successfully:', { 
      username: savedUsername, 
      email: savedEmail 
    });
    
    res.status(200).json({ username: savedUsername, email: savedEmail });
  } catch (error) {
    logger.error('Registration failed:', { 
      username,
      email,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: error.message });
  }
});

//login

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  logger.info('Login attempt:', { email });

  try {
    const data = await profile.findOne({ email: email });
    
    if (!data) {
      logger.warn('Login failed - Email not found:', { email });
      return res.status(500).json({ error: "Email is incorrect" });
    }

    const { username } = data;
    logger.debug('User found:', { email, username });

    const profile_data = await userprofile.findOne({ name: username });
    if (profile_data) {
      logger.debug('Profile data found:', { username });
    }

    const sessionId = uuidv4();
    logger.debug('Session created:', { sessionId });

    const isMatch = await bcrypt.compare(password, data.password);
    
    if (!isMatch) {
      logger.warn('Login failed - Incorrect password:', { email });
      return res.status(500).json({ error: "Password is incorrect" });
    }

    logger.info('Password verified:', { email });
    const data_id = data._id;

    const testacessToken = generateAccessTokenWithId({
      sessionId: sessionId,
    });
    
    const accessToken = generateAccessToken({
      email: data.email,
      id: data_id.toString(),
      username: data.username,
    });
    
    const refreshToken = generateRefreshToken({
      email: data.email,
      id: data_id.toString(),
    });

    logger.debug('Tokens generated:', { 
      email,
      sessionId,
      userId: data_id.toString()
    });

    const info = {
      id: data_id.toString(),
      username: data.username,
      email: data.email,
    };

    // Set cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 7 * 60 * 60 * 1000,
    });

    res.cookie("testacessToken123", testacessToken, {
      httpOnly: true,
      sameSite: "strict",
      maxAge: 7 * 60 * 60 * 1000,
    });

    // Save session in Redis
    await client.setex(sessionId, 7 * 60 * 60, data_id.toString());
    logger.info('Login successful:', { 
      email, 
      username: data.username,
      sessionId 
    });

    res.status(200).json({ info, accessToken, refreshToken, testacessToken });
  } catch (error) {
    logger.error('Login error:', {
      email,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

// forgot password
app.post("/forgotpassword", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await profile.findOne({ email: email });
    if (user) {
      const token = jwt.sign({ email: email }, process.env.RESET_PASSWORD_KEY, {
        expiresIn: "20m",
      });
      user.resetPasswordToken = token;
      user.resetPasswordExpires = Date.now() + 20 * 60 * 1000; // 20 minutes in milliseconds
      await user.save();

      // const baseUrl = `${req.protocol}://${req.get('host')}`;
      const link = `${req.get("origin")}/reset-password?token=${token}`;
      // console.log("link",link);
      await sendEmail({
        to: user.email,
        subject: "MR BLOGS - Reset Your Password",
        token: token,
        link: link,
      });

      logger.info('Password reset requested:', { email });
      res.status(200).json({ message: "Password reset email sent" });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (error) {
    logger.error('Password reset request error:', error);
    console.error("Error in forgot password:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// reset password
app.post("/resetpassword", async (req, res) => {
  try {
    const { token } = req.body;
    const { password } = req.body;

    // Calculate current time in IST
    const now = new Date();
    // const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istNow = new Date(now.getTime());

    const user = await profile.findOne({
      resetPasswordToken: token,
    });

    if (!user) {
      return res.status(404).json({ error: "Invalid reset token" });
    }
    // console.log(istNow)
    // console.log(user.resetPasswordExpires)

    // Check if token has expired
    if (user.resetPasswordExpires < istNow) {
      return res.status(400).json({ error: "Reset token has expired" });
    }

    // Validate password
    if (!password || password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters long" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    logger.info('Password reset successful for token:', { token });
    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    logger.error('Password reset error:', error);
    console.error("Error resetting password:", error);
    res
      .status(500)
      .json({ error: "An error occurred while resetting the password" });
  }
});

// uploadin the profile
app.post("/upload", async (req, res) => {
  try {
    const { name, phoneno, bio, insta, linkedin, username, image } = req.body;
    console.log(req.body);

    //find and update the username asosiated with the profile with userprofile model and if not found create a new one

    const user = await profile.findOneAndUpdate(
      { username: username },
      { username: name },
      { new: true }
    );

    // first find whether the user exists or not if not then create a new one
    const getprofile = await userprofile.findOne({ name: username });
    if (getprofile) {
      // if user exists then update the profile
      const updateprofile = await userprofile.findOneAndUpdate(
        { name: username },
        { name, profile_pic: image, phoneno, bio, instagram: insta, linkedin },
        { new: true }
      );
      const updateprofileincomments = await blogschema.updateMany(
        { "comments.username": username },
        { "comments.$.username": name },
        { new: true }
      );
      console.log("updated profile : ", updateprofile);
    } else {
      // if user does not exists then create a new profile
      const user_profile = new userprofile({
        name,
        profile_pic: image,
        phoneno,
        bio,
        instagram: insta,
        linkedin,
      });
      await user_profile.save();
    }

    const checkblogs = await blogschema.find({ author: username });
    //also update the blog author name and author image in the blog schema
    if (checkblogs) {
      const updateblog = await blogschema.updateMany(
        { author: username },
        { author: name, author_img: image },
        { new: true }
      );
    }

    console.log(
      "body = ",
      name,
      "no. ",
      phoneno,
      "bio ",
      bio,
      "insta ",
      insta,
      "linkedin ",
      linkedin,
      "\nusername = ",
      username
    );
    const cacheKey = `profile_${username}`;
    await client.del(cacheKey);
    logger.debug('Cache invalidated', { key: cacheKey });

    logger.info('Profile updated:', { username, newUsername: name });
    res.status(200).json(req.body);
  } catch (error) {
    logger.error('Profile update error:', error);
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// get profile data

app.get("/api/getprofile/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const cacheKey = `profile_${username}`;

    const cachedData = await client.get(cacheKey);
    if (cachedData) {
      logger.debug('Cache hit', { cacheKey, endpoint: 'getprofile' });
      return res.status(200).json(JSON.parse(cachedData));
    }

    logger.debug('Fetching profile from database:', { username });
    const data = await userprofile.findOne({ name: username });

    await client.setex(cacheKey, 300, JSON.stringify(data));
    logger.info('Profile fetched successfully:', { username });

    res.status(200).json(data);
  } catch (error) {
    logger.error('Error fetching profile:', { 
      username: req.params.username,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/getprofile", verifyToken, async (req, res) => {
  try {
    const username = req.user.username;
    const cacheKey = `profile_${username}`;

    const cachedData = await client.get(cacheKey);
    if (cachedData) {
      logger.debug('Cache hit', { cacheKey, endpoint: 'getprofile' });
      return res.status(200).json(JSON.parse(cachedData));
    }

    logger.debug('Fetching authenticated profile from database:', { username });
    const data = await userprofile.findOne({ name: username });

    await client.setex(cacheKey, 300, JSON.stringify(data));
    logger.info('Authenticated profile fetched successfully:', { username });

    res.status(200).json(data);
  } catch (error) {
    logger.error('Error fetching authenticated profile:', { 
      username: req.user.username,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/getprofilepic/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const cacheKey = `profile_pic:${username}`;

    const cachedImage = await client.get(cacheKey);
    if (cachedImage) {
      logger.info('Cache hit for profile picture:', { username, cacheKey });
      return res.status(200).json(JSON.parse(cachedImage));
    }

    logger.debug('Fetching profile picture from database:', { username });
    const data = await userprofile.findOne({ name: username });
    
    if (data && data.profile_pic.length > 0) {
      const image = data.profile_pic;
      await client.setex(cacheKey, 300, JSON.stringify(image));
      logger.info('Profile picture fetched successfully:', { username });
      return res.status(200).json(image);
    } else {
      logger.warn('Profile picture not found:', { username });
      return res.status(404).json({ message: "Profile picture not found" });
    }
  } catch (error) {
    logger.error('Error fetching profile picture:', { 
      username: req.params.username,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ message: "Internal server error" });
  }
});

// create blog
app.post("/api/createblog", verifyTestToken, async (req, res) => {
  const { author, author_img, image, title, content, tag, category } = req.body;

  logger.info('Blog creation attempt:', { 
    author, 
    title,
    category,
    contentLength: content?.length 
  });

  if (!content || content.length < 10 || !title || !tag || !category || !image || !author) {
    logger.warn('Blog creation validation failed:', {
      author,
      hasContent: !!content,
      contentLength: content?.length,
      hasTitle: !!title,
      hasTag: !!tag,
      hasCategory: !!category,
      hasImage: !!image
    });
    return res.status(400).json({ message: "Please fill in all fields with valid data" });
  }

  try {
    logger.debug('Verifying author profile:', { author });
    const authorProfile = await profile.findOne({ username: author });
    if (!authorProfile) {
      logger.warn('Blog creation failed - Author not found:', { author });
      return res.status(404).json({ message: "Author not found" });
    }
    const auth_id = authorProfile._id;

    let authorImg = author_img;
    if (!author_img) {
      logger.debug('Fetching author profile picture:', { author });
      const authorImageProfile = await userprofile.findOne({ name: author });
      authorImg = authorImageProfile ? authorImageProfile.profile_pic : null;
    }

    const data = new blogschema({
      author,
      author_img: authorImg,
      author_id: auth_id,
      blog_image: image,
      title,
      body: content,
      tags: tag,
      category,
    });

    const dataToSave = await data.save();
    logger.info('Blog saved successfully:', { 
      blogId: dataToSave._id,
      author,
      title,
      category
    });

    // Invalidate caches
    const cacheKeys = [
      `category:${category}`,
      "allblogs",
      `blog:${dataToSave._id}`,
      `userblog:${author}`,
    ];
    
    for (const key of cacheKeys) {
      await client.del(key);
      logger.debug('Cache invalidated:', { key });
    }

    res.status(200).json(dataToSave);
  } catch (error) {
    logger.error('Blog creation error:', { 
      author,
      title,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// get all blogs

app.get("/api/getblog/all", async (req, res) => {
  try {
    // const cacheKey = 'allblogs';
    // console.log(req.ip)
    // const cachedData = await client.get(cacheKey);
    // if (cachedData) {
    //   console.log('Cache hit:', cacheKey)
    //   return res.status(200).json(JSON.parse(cachedData));
    // }

    const allblogs = await blogschema.find();

    // await client.setex(cacheKey, 300, JSON.stringify(allblogs));

    res.status(200).json(allblogs);
  } catch (error) {
    console.error("Error fetching blogs:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/getblog", async (req, res) => {
  try {
    const cacheKey = "allblogs";

    // Check if data is already cached
    const cachedData = await client.get(cacheKey);
    if (cachedData) {
      logger.info('Cache hit', { cacheKey, endpoint: 'getblog' });
      return res.status(200).json(JSON.parse(cachedData));
    }

    // Fetch non-private blogs with selected fields
    const allblogs = await blogschema
      .find({ isPrivate: false })
      .select("_id author author_img blog_image title body tags date isPrivate")
      .exec();

    // console.log(allblogs)

    await client.setex(cacheKey, 300, JSON.stringify(allblogs));

    res.status(200).json(allblogs);
  } catch (error) {
    console.error("Error fetching blogs:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

function getCurrentISTTime() {
  return new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
}

async function trackView(blog, visitorIp) {
  try {
    const nowIST = getCurrentISTTime();
    const COOLDOWN_PERIOD = 30 * 60 * 1000;

    // Initialize views object if it doesn't exist
    if (!blog.views) {
      logger.info('Initializing views for blog:', { blog_id: blog._id });
      blog.views = { 
        count: 0, 
        uniqueVisitors: [], 
        lastViewedAt: nowIST 
      };
    }

    // Ensure lastViewedAt is a Date object
    const lastViewedAtDate = blog.views.lastViewedAt ? new Date(blog.views.lastViewedAt) : null;
    const isNewVisitor = !blog.views.uniqueVisitors.includes(visitorIp);
    
    const isViewCooldownPassed = !lastViewedAtDate || 
      (nowIST.getTime() - lastViewedAtDate.getTime() > COOLDOWN_PERIOD);

    if (isNewVisitor || isViewCooldownPassed) {
      blog.views.count = (blog.views.count || 0) + 1;
      blog.views.lastViewedAt = nowIST;
      
      if (isNewVisitor) {
        blog.views.uniqueVisitors.push(visitorIp);
        logger.info('New visitor view tracked:', { 
          blog_id: blog._id, 
          visitorIp,
          totalViews: blog.views.count,
          uniqueVisitors: blog.views.uniqueVisitors.length
        });
      } else {
        logger.info('Repeat visitor view tracked:', { 
          blog_id: blog._id,
          visitorIp,
          totalViews: blog.views.count
        });
      }
      
      if (blog.save) {
        await blog.save();
      }
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Error tracking view:', { 
      blog_id: blog._id, 
      visitorIp, 
      error: error.message,
      stack: error.stack 
    });
    return false;
  }
}

app.get("/api/blog/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const visitorIp = req.ip.replace(/^.*:/, ""); // Extract IPv4 address if IPv6 format
    const cacheKey = `blog:${id}`;

    let blog;
    const cachedBlog = await client.get(cacheKey);

    if (cachedBlog) {
      logger.debug('Cache hit', { cacheKey, endpoint: 'getblog', blogId: id });
      blog = JSON.parse(cachedBlog);

      // Fetch the document from the DB if it was a cache hit but needs to be updated
      blog = await blogschema.findById(id);
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
    } else {
      // Fetch blog from DB directly if not in cache
      blog = await blogschema.findById(id);
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
    }

    const wasUpdated = await trackView(blog, visitorIp);

    if (wasUpdated || !cachedBlog) {
      await client.setex(cacheKey, 300, JSON.stringify(blog));
    }

    return res.status(200).json(blog);
  } catch (error) {
    console.error("Error fetching blog:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/api/getblog/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const visitorIp = req.ip.replace(/^.*:/, "");
    const cacheKey = `blog:${id}`;

    let blog;
    const cachedBlog = await client.get(cacheKey);

    if (cachedBlog) {
      logger.debug('Cache hit', { cacheKey, endpoint: 'getblog', blogId: id });
      blog = JSON.parse(cachedBlog);
    } else {
      // Blog is not in cache, fetch from DB
      blog = await blogschema
        .findById(id)
        .select(
          "_id author author_img blog_image title body tags category comments views date"
        );
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }

      await client.setex(cacheKey, 300, JSON.stringify(blog));
    }

    const wasUpdated = await trackView(blog, visitorIp);

    if (wasUpdated) {
      await client.setex(cacheKey, 300, JSON.stringify(blog));
    }

    return res.status(200).json(blog);
  } catch (error) {
    console.error("Error fetching blog:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// get blog by id

// app.get('/api/getblog/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const cacheKey = `blog:${id}`;

//     const cachedBlog = await client.get(cacheKey);
//     if (cachedBlog) {
//       console.log('Cache hit:', cacheKey);
//       return res.status(200).json(JSON.parse(cachedBlog));
//     }

//     const blog = await blogschema.findById(id);
//     if (blog) {
//       await client.setex(cacheKey, 300, JSON.stringify(blog));

//       return res.status(200).json(blog);
//     } else {
//       return res.status(404).json({ message: 'Blog not found' });
//     }
//   } catch (error) {
//     console.error('Error fetching blog:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });

// get user blog

app.get("/api/userblog/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const cacheKey = `userblog:${username}`;
    const cachedBlog = await client.get(cacheKey);
    if (cachedBlog) {
      logger.debug('Cache hit', { cacheKey, endpoint: 'getblogsbycategory' });
      return res.status(200).json(JSON.parse(cachedBlog));
    }

    const blog = await blogschema.find({ author: username });
    await client.setex(cacheKey, 300, JSON.stringify(blog));

    res.status(200).json(blog);
  } catch (error) {
    console.log(error);
  }
});

// get saved blogs

app.get("/api/savedblog/:username", async (req, res) => {
  try {
    const { username } = req.params;

    const cacheKey = `savedblog:${username}`;
    const cachedBlog = await client.get(cacheKey);
    if (cachedBlog) {
      logger.debug('Cache hit', { cacheKey, endpoint: 'getallblogs' });
      return res.status(200).json(JSON.parse(cachedBlog));
    }

    const userProfile = await userprofile.findOne({ name: username });

    if (
      !userProfile ||
      !userProfile.saved_blogs ||
      userProfile.saved_blogs.length === 0
    ) {
      return res.status(200).json({ message: "No saved blogs" });
    }

    const blog = await blogschema.find({
      _id: { $in: userProfile.saved_blogs },
    });

    if (blog.length === 0) {
      return res.status(200).json({ message: "No saved blogs" });
    }

    await client.setex(cacheKey, 150, JSON.stringify(blog));

    res.status(200).json(blog);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// save blog

app.post("/api/saveblog", async (req, res) => {
  const { username, blog_id } = req.body;
  try {
    const updated = await userprofile.findOneAndUpdate(
      { name: username },
      { $addToSet: { saved_blogs: blog_id } },
      { new: true }
    );

    // Invalidate relevant caches
    const cacheKeys = [
      `savedblog:${username}`,
      `recentlySaved:${username}`,
      `likesSaved:${blog_id}:${username}`
    ];

    for (const key of cacheKeys) {
      await client.del(key);
      logger.info('Cache invalidated:', { key });
    }

    logger.info('Blog saved:', { username, blog_id });
    res.status(200).send("Blog saved successfully");
  } catch (error) {
    logger.error('Error saving blog:', { username, blog_id, error: error.message });
    res.status(500).send("Internal Server Error");
  }
});

// add comments to the blog

app.post("/api/postcomment",verifyTestToken, async (req, res) => {
  const { blog_id, username, comment } = req.body;

  if (!blog_id || !username || !comment) {
    return res.status(400).send("Missing required fields");
  }

  try {
    const user = await userprofile.findOne({ name: username });

    if (!user) {
      return res.status(404).send("User not found");
    }

    const user_img = user.profile_pic;

    const updated = await blogschema.findOneAndUpdate(
      { _id: blog_id },
      { $push: { comments: { username, user_img, comment } } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).send("Blog not found");
    }

    // // delete the cache
    // const cacheKey = `comments:${blog_id}`;
    // await client.del(cacheKey);
    // console.log(`Cache invalidated for key: ${cacheKey}`);
    console.log("blog id", blog_id);
    const cacheKeys = `blog:${blog_id}`;
    await client.del(cacheKeys);
    logger.debug('Cache invalidated', { key: cacheKeys, type: 'blog_comments' });

    console.log("updated:", updated);
    logger.info('New comment posted:', { blog_id, username });
    return res.status(200).send("Comment posted successfully");
  } catch (error) {
    logger.error('Comment posting error:', error);
    console.error("Error posting comment:", error);
    return res.status(500).send("Internal Server Error");
  }
});

// get comments of the blog
app.get("/api/getcomment/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const cacheKey = `comments:${id}`;
    const cachedComments = await client.get(cacheKey);
    if (cachedComments) {
      logger.debug('Cache hit', { cacheKey, endpoint: 'getcomments', blogId: id });
      return res.status(200).json(JSON.parse(cachedComments));
    }

    const blog = await blogschema.findById(id);
    await client.setex(cacheKey, 300, JSON.stringify(blog.comments));
    res.status(200).json(blog.comments);
  } catch (error) {
    console.log(error);
  }
});

// get blog by category
app.get("/api/category/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const cacheKey = `category:${category}`;

    const cachedBlogs = await client.get(cacheKey);
    if (cachedBlogs) {
      logger.info('Cache hit for category:', { category, cacheKey });
      return res.status(200).json(JSON.parse(cachedBlogs));
    }

    let blogs;
    if (category === "Health") {
      blogs = await blogschema.find({
        category: { $in: ["Health", "Personal Development"] },
      });
    } else if (category === "Others") {
      blogs = await blogschema.find({
        category: {
          $nin: [
            "Health",
            "Personal Development",
            "Technology",
            "Science",
            "Business",
            "Automobile",
          ],
        },
      });
    } else {
      blogs = await blogschema.find({ category: category });
    }

    logger.info('Blogs fetched by category:', { category, count: blogs.length });
    await client.setex(cacheKey, 300, JSON.stringify(blogs));
    res.status(200).json(blogs);
  } catch (error) {
    logger.error('Error fetching blogs by category:', { category: req.params.category, error: error.message });
    res.status(500).json({ message: "Internal server error" });
  }
});

// follow category
app.post("/api/followcategory",verifyTestToken, async (req, res) => {
  const { category, username } = req.body;
  try {
    const getuserinfo = await userprofile.findOne({ name: username });

    if (!getuserinfo || !getuserinfo.followed_topics) {
      logger.warn('Follow category failed - User not found or no followed topics:', { username, category });
      res.status(404).send("User not found or followed_topics is null");
      return;
    }

    const { followed_topics } = getuserinfo;

    if (followed_topics.includes(category)) {
      logger.info('Category already followed:', { username, category });
      res.status(200).send("Category already followed");
      return;
    }

    const isCategory = await Category.findOne({ name: category });

    if (!isCategory) {
      const newCategory = new Category({
        name: category,
        followed_by: [username],
      });
      await newCategory.save();
      logger.info('New category created and followed:', { category, username });
    } else {
      const updated = await Category.findOneAndUpdate(
        { name: category },
        { $addToSet: { followed_by: username } },
        { new: true }
      );
      logger.info('Category followed:', { category, username });
    }

    await client.del(`categoryInfo:${category}`);
    logger.info('Category cache invalidated:', { category });

    res.status(200).send("Category followed successfully");
  } catch (error) {
    logger.error('Error following category:', { category, username, error: error.message });
    res.status(500).send("Internal Server Error");
  }
});

// category followed by user

app.get("/api/getcategoryinfo/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const cacheKey = `categoryInfo:${category}`;

    const cachedCategory = await client.get(cacheKey);
    if (cachedCategory) {
      logger.debug('Cache hit', { cacheKey, endpoint: 'getcategoryinfo', category });
      return res.status(200).json(JSON.parse(cachedCategory));
    }

    const data = await Category.findOne({ name: category });
    if (!data) {
      return res.status(404).json({ message: "Category not found" });
    }

    await client.setex(cacheKey, 300, JSON.stringify(data)); // Cache for 30 minutes

    res.status(200).json(data);
  } catch (error) {
    console.error("Error fetching category info:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// recently saved
app.get("/api/recentlysaved/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const cacheKey = `recentlySaved:${username}`;

    const cachedRecentlySaved = await client.get(cacheKey);
    if (cachedRecentlySaved) {
      const { recently_savedblog, blog_id, profile_pic } =
        JSON.parse(cachedRecentlySaved);
      console.log("Cache hit:", cacheKey);
      return res.status(200).json({ recently_savedblog, blog_id, profile_pic });
    }

    const userProfile = await userprofile.findOne({ name: username });
    if (
      !userProfile ||
      !userProfile.saved_blogs ||
      userProfile.saved_blogs.length === 0
    ) {
      res.status(200).json({ message: "No saved blogs" });
      return;
    }

    const recently_savedblog = await blogschema
      .find({ _id: { $in: userProfile.saved_blogs } })
      .limit(2)
      .sort({ $natural: +1 });

    await client.setex(
      cacheKey,
      300,
      JSON.stringify({
        recently_savedblog,
        blog_id: userProfile.saved_blogs,
        profile_pic: userProfile.profile_pic,
      })
    );

    res.status(200).json({
      recently_savedblog,
      blog_id: userProfile.saved_blogs,
      profile_pic: userProfile.profile_pic,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/api/getIP", async (req, res) => {
  const ip = req.socket.remoteAddress;
  res.status(200).json(ip);
});

app.get("/api/getuserlikeandcomment/:id/:username", async (req, res) => {
  const { id, username } = req.params;
  logger.info('Fetching user likes and comments:', { blogId: id, username });

  try {
    const blog = await blogschema.findById(id);
    if (!blog) {
      logger.warn('Blog not found:', { blogId: id });
      return res.status(404).json({ message: "Blog not found" });
    }

    const { likes, comments } = blog;
    const isliked = likes.likedby.includes(username);
    
    const cacheKey = `userLikeComment:${id}:${username}`;
    await client.setex(
      cacheKey,
      220,
      JSON.stringify({ likes, comments, isliked })
    );
    
    logger.debug('Cache updated:', { 
      cacheKey,
      blogId: id, 
      username,
      likesCount: likes.likedby.length,
      commentsCount: comments.length,
      isliked
    });

    logger.info('Successfully fetched user likes and comments:', { 
      blogId: id, 
      username 
    });
    res.status(200).json({ likes, comments, isliked });
  } catch (error) {
    logger.error('Error fetching user likes and comments:', { 
      blogId: id,
      username,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/likeblog", verifyTestToken,async (req, res) => {
  const { blog_id, username } = req.body;
  try {
    const updated = await blogschema.findOneAndUpdate(
      { _id: blog_id },
      { $addToSet: { "likes.likedby": username } },
      { new: true }
    );
    
    const cacheKey = `likesSaved:${blog_id}:${username}`;
    await client.del(cacheKey);
    logger.info('Blog liked:', { blog_id, username });
    res.status(200).send("Blog liked successfully");
  } catch (error) {
    logger.error('Error liking blog:', { blog_id, username, error: error.message });
    res.status(500).send("Internal Server Error");
  }
});

app.post("/api/unlikeblog", async (req, res) => {
  const { blog_id, username } = req.body;
  try {
    const updated = await blogschema.findOneAndUpdate(
      { _id: blog_id },
      { $pull: { "likes.likedby": username } },
      { new: true }
    );
    logger.info('Blog unliked:', { blog_id, username });
    res.status(200).send("Blog unliked successfully");
  } catch (error) {
    logger.error('Error unliking blog:', { blog_id, username, error: error.message });
    res.status(500).send("Internal Server Error");
  }
});

// summarization of the blog

app.post('/api/summarize', verifyTestToken,async(req,res)=>{
  logger.info('Summarization request received');

  const request_body = req.body;
  const { body } = request_body;

  if (!body || typeof body !== 'string') {
    logger.warn('Invalid summarization request - missing or invalid body');
    return res.status(400).json({ error: "Invalid input: Body text is required" });
  }

  logger.debug('Summarization request details:', { 
    textLength: body.length 
  });

  const prompt = `
        Summarize the following text :

        Original text:
        ${body}


        Instructions:
        1. Keep the summary concise and to the point.   

`;
// and provide the response in HTML format with inline styling
// 2. Use headings, paragraphs, and lists to organize the content.
//         3. Use inline styling to enhance readability and visual appeal.
//         4. Ensure proper spacing and alignment for a polished look.
//         5. Don't use line-height property and text-align property .

  try {
    logger.debug('Sending request to Gemini API');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    logger.info('Summary generated successfully:', {
      originalLength: body.length,
      summaryLength: text.length
    });

    res.status(200).json(text);
  } catch (error) {
    logger.error('Summarization error:', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: "Failed to generate summary" });
  }
  // console.log(text);
})

app.post('/api/generateText',async(req,res)=>{
  const { prompt } = req.body;
  const result = await model.generateContent(prompt );
  const response = await result.response;
  const text = response.text();
  res.status(200).json(text);
})

app.get("/api/getlikesandsaved", async (req, res) => {
  const { blog_id, username } = req.query;
  let saved = false;
  let liked = false;

  try {
    const cacheKey = `likesSaved:${blog_id}:${username}`;

    const cachedData = await client.get(cacheKey);
    if (cachedData) {
      logger.debug('Cache hit', { cacheKey, endpoint: 'getlikesandsaved', blogId: blog_id, username });
      const { saved, liked } = JSON.parse(cachedData);
      return res.status(200).json({ saved, liked });
    }

    const profile = await userprofile.findOne({ name: username });
    if (
      profile &&
      profile.saved_blogs &&
      profile.saved_blogs.includes(blog_id)
    ) {
      saved = true;
    }

    const blog = await blogschema.findById(blog_id);
    if (
      blog &&
      blog.likes &&
      blog.likes.likedby &&
      blog.likes.likedby.includes(username)
    ) {
      liked = true;
    }

    await client.setex(cacheKey, 120, JSON.stringify({ saved, liked }));

    res.status(200).json({ saved, liked });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/popular", async (req, res) => {
  const mostliked = await blogschema.find().sort({ likes: -1 }).limit(3);
  const mostcommented = await blogschema.find().sort({ comments: -1 }).limit(3);
  const mostLikeAndComments = mostliked.filter((blog) => {
    return mostcommented.some((commentedBlog) =>
      commentedBlog._id.equals(blog._id)
    );
  });

  res.status(200).json(mostLikeAndComments);
});

app.get("/hellox", (req, res) => {
  res.send("hello");
});

// get all the comments of blog of an author
app.get("/api/getallcomments/:author", async (req, res) => {
  const { author } = req.params;
  logger.info('Fetching all comments for author:', { author });

  try {
    const cacheKey = `commentsxs:${author}`;
    logger.debug('Searching for blogs by author:', { author });
    
    const blogs = await blogschema.find({ author: author });
    logger.debug('Found blogs:', { 
      author, 
      blogCount: blogs.length 
    });

    let allComments = [];
    blogs.forEach((blog) => {
      if (blog.comments && blog.comments.length > 0) {
        allComments = allComments.concat(blog.comments);
        logger.debug('Processing blog comments:', { 
          blogId: blog._id,
          commentCount: blog.comments.length 
        });
      }
    });

    const flattenedComments = allComments.flat();
    logger.info('Successfully fetched all comments:', { 
      author, 
      totalComments: flattenedComments.length 
    });

    res.status(200).json(flattenedComments);
  } catch (error) {
    logger.error('Error fetching author comments:', { 
      author,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/api/deleteblog/:id", verifyTestToken, async (req, res) => {
  const { id } = req.params;
  try {
    // First get the blog to access its data before deletion
    const blog = await blogschema.findById(id);
    if (!blog) {
      logger.warn('Blog deletion failed - not found:', { id });
      return res.status(404).json({ message: "Blog not found" });
    }
    
    const { author, category } = blog;
    logger.info('Starting blog deletion:', { id, author, category });
    
    // Delete the blog
    const data = await blogschema.findByIdAndDelete(id);
    
    // Invalidate all related caches
    const cacheKeys = [
      `blog:${id}`,                 // Individual blog cache
      `allblogs`,                   // All blogs list
      `userblog:${author}`,         // Author's blogs
      `category:${category}`,       // Category blogs
      `comments:${id}`,             // Blog comments
      `likesSaved:${id}:*`          // Any likes/saves for this blog
    ];
    
    for (const key of cacheKeys) {
      if (key.includes('*')) {
        // For pattern-based deletion, we'd need a different approach
        // Redis SCAN would be ideal but for simplicity we'll log this case
        logger.info('Note: Consider implementing pattern-based cache deletion for:', { pattern: key });
      } else {
        await client.del(key);
        logger.debug('Cache invalidated:', { key });
      }
    }
    
    logger.info('Blog deleted successfully:', { id, author });
    res.status(200).json(data);
  } catch (error) {
    logger.error('Blog deletion error:', { 
      id, 
      error: error.message,
      stack: error.stack 
    });
    console.error("Error deleting blog:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//edit blog

app.post("/api/editblog", verifyTestToken, async (req, res) => {
  const { author, image, title, content, tag, category } = req.body;
  const id = req.query.blog_id;

  try {
    console.log("user", req.user.username);
    console.log("session id from middleware ", req.sessionId); // Add this line to log the session ID

    // check if session id exists in redis and grab its value
    const sessionId = req.sessionId;
    const sessionData = await client.get(sessionId);
    // if (!sessionData) {
    //   return res.status(401).json({ error: "Session expired" });
    // }
    logger.debug('Session data retrieved:', { sessionData });

    const authorProfile = await profile.findOne({
      username: req.user.username,
    });
    if (!authorProfile) {
      return res.status(404).json({ error: "Author not found" });
    }
    const authorId = authorProfile._id;

    let authorImg = req.body.author_img;
    if (!authorImg) {
      const userProfile = await userprofile.findOne({ name: author });
      authorImg = userProfile ? userProfile.profile_pic : null;
    }

    // Update the blog document
    const updatedBlog = await blogschema.findByIdAndUpdate(
      id,
      {
        author,
        author_img: authorImg,
        author_id: authorId,
        blog_image: image,
        title,
        body: content,
        tags: tag,
        category,
      },
      { new: true }
    );

    if (!updatedBlog) {
      return res.status(404).json({ error: "Blog not found" });
    }
    // delete the cache
    const cacheKey1 = `blog:${id}`;
    await client.del(cacheKey1);

    const cacheKey2 = "allblogs";
    await client.del(cacheKey2);

    // also delete userblog
    const cacheKey3 = `userblog:${author}`;
    await client.del(cacheKey3);

    // console.log("updated blog : ",updatedBlog);
    logger.info('Blog edited:', { id, author, title });
    res.status(200).json(updatedBlog);
  } catch (error) {
    logger.error('Blog edit error:', error);
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// test the edit blog api with test token
app.post("/api/testeditblog", verifyTestToken, async (req, res) => {
  const sessionId = req.sessionId;
  logger.info('Test edit blog request received:', { sessionId });

  try {
    const sessionData = await client.get(sessionId);
    if (!sessionData) {
      logger.warn('Test edit blog failed - Session expired:', { sessionId });
      return res.status(401).json({ error: "Session expired" });
    }
    logger.debug('Session data retrieved:', { sessionId, userId: sessionData });

    // check the sessiondata which is user id exits in Profile
    const authProfile = await profile.findById(sessionData);
    if (!authProfile) {
      logger.warn('Test edit blog failed - Author not found:', { sessionId, userId: sessionData });
      return res.status(404).json({ error: "Author not found" });
    }
    logger.debug('Author profile found:', { 
      sessionId, 
      userId: sessionData, 
      username: authProfile.username 
    });

    // if author exists then update the blog
    const { author, image, title, content, tag, category } = req.body;
    const id = req.query.blog_id;

    // verify sessionData and author_id from blog 
    const blog = await blogschema.findById(id);
    if (!blog) {
      logger.warn('Test edit blog failed - Blog not found:', { blogId: id });
      return res.status(404).json({ error: "Blog not found" });
    }

    if (blog.author_id.toString() !== authProfile._id.toString()) {
      logger.warn('Test edit blog failed - Unauthorized:', { 
        blogId: id, 
        requestUserId: authProfile._id.toString(), 
        blogAuthorId: blog.author_id.toString() 
      });
      return res.status(403).json({ error: "You are not authorized to edit this blog" });
    }

    logger.info('Starting blog update:', { 
      blogId: id, 
      author, 
      title,
      category,
      contentLength: content?.length 
    });

    // update the blog
    const updatedBlog = await blogschema.findByIdAndUpdate(
      id,
      {
        author,
        author_img: image,
        author_id: authProfile._id,
        blog_image: image,
        title,
        body: content,
        tags: tag,
        category,
      },
      { new: true }
    );

    if (!updatedBlog) {
      logger.error('Test edit blog failed - Update failed:', { blogId: id });
      return res.status(404).json({ error: "Blog not found" });
    }

    // Invalidate caches
    const cacheKeys = [
      `blog:${id}`,
      "allblogs",
      `userblog:${author}`
    ];

    for (const key of cacheKeys) {
      await client.del(key);
      logger.debug('Cache invalidated:', { key });
    }

    logger.info('Blog updated successfully:', { 
      blogId: id, 
      author, 
      title,
      category 
    });

    res.status(200).json({ message: "Blog updated successfully 👍👍👍" });
  } catch (error) {
    logger.error('Test edit blog error:', { 
      sessionId,
      blogId: req.query.blog_id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

// logout
app.delete("/api/logout",verifyTestToken,async (req, res) => {
  const sessionId = req.sessionId;
  console.log("session id : ", sessionId);
  // delete the session data from redis
  await client.del(sessionId);
  console.log("session data deleted from redis : ", sessionId);
  logger.info("session data deleted from redis : ", sessionId);
  res.status(200).json({ message: "Logged out successfully" });

})

app.get("/api/updatePrivate/:id", async (req, res) => {
  const { id } = req.params;
  logger.info('Setting blog to private:', { blogId: id });

  try {
    const updated = await blogschema.findByIdAndUpdate(
      id,
      { $set: { isPrivate: true } },
      { new: true }
    );

    if (!updated) {
      logger.warn('Blog not found for privacy update:', { blogId: id });
      return res.status(404).json({ message: "Blog not found" });
    }

    logger.info('Blog privacy updated successfully:', { 
      blogId: id, 
      author: updated.author,
      isPrivate: true 
    });
    res.status(200).json(updated);
  } catch (error) {
    logger.error('Error updating blog privacy:', { 
      blogId: id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/api/togglePrivate/:id", verifyTestToken,async (req, res) => {
  const { id } = req.params;
  logger.info('Toggling blog privacy:', { blogId: id });

  try {
    const blog = await blogschema.findById(id);
    if (!blog) {
      logger.warn('Blog not found for privacy toggle:', { blogId: id });
      return res.status(404).json({ message: "Blog not found" });
    }

    const { isPrivate } = blog;
    logger.debug('Current privacy status:', { 
      blogId: id, 
      isPrivate,
      author: blog.author 
    });

    const updated = await blogschema.findByIdAndUpdate(
      id,
      { $set: { isPrivate: !isPrivate } },
      { new: true }
    );

    const { isPrivate: updatedPrivate } = updated;
    logger.info('Blog privacy toggled successfully:', { 
      blogId: id,
      author: updated.author,
      previousState: isPrivate,
      newState: updatedPrivate
    });

    res.status(200).json(updatedPrivate);
  } catch (error) {
    logger.error('Error toggling blog privacy:', { 
      blogId: id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ message: "Internal server error" });
  }
});

// app.get('/updateallblogs',async(req,res)=>{
//   const blog = await blogschema.find();
//   blog.map(async(blog)=>{
//     const { _id } = blog;
//     const updated = await blogschema.findByIdAndUpdate(_id,{ $set: { isPrivate: false } },{ new: true });
//     console.log("updated : ",updated);
//   })})

// ------------ ElderHub - port(3000) --------------

// app.post('/create-checkout-session',async(req,res)=>{
//   const { amount } = req.body;
//   console.log("price id : ",amount);
//   try{
//     const session = await Stripe.checkout.sessions.create({
//       mode: 'payment',
//       payment_method_types: ['card'],
//       line_items: [
//         {
//           price_data:{
//             currency: 'inr',
//             product_data: {
//               name: 'Donation',
//               images: ['https://m.economictimes.com/thumb/msid-63293846,width-1200,height-900,resizemode-4,imgsize-49958/donation-charity.jpg'],
//             },
//             unit_amount: amount,

//           },
//           quantity: 1,
//         },

//       ],
//       success_url: 'http://localhost:5173/sucess',
//       cancel_url: 'http://localhost:5173/unsucess',
//     });
//     res.json({ url: session.url })
//   }
//   catch(error){
//     console.log(error);
//   }

// })

// Add logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});
