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
import axios from "axios";
import { v2 as cloudinary } from "cloudinary"
import multer from "multer";
import TestImage from "./models/test_image.js";
import userprofile from "./models/user_profile.js";
import stripe from 'stripe';
import redis from 'redis';
import Category from "./models/Category.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import generateAccessToken from "./token/AccessToken.js";
import generateRefreshToken from "./token/RefreshToken.js";
import verifyToken from './middleware/verifytoken.js';
import asyncRedis from 'async-redis';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import compression from 'compression';


dotenv.config();

const app = express();

const port = process.env.PORT || 3000; // Use uppercase 'PORT' for consistency

const dburi = process.env.mongoURI;

// Security middleware
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
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
        // host:  "localhost",
        host:  "redis-service",
  
        port: 6379
    }
  });
  
// console.log(process.env.REDIS_URL);

// cloud redis
// const client = asyncRedis.createClient({ url: process.env.REDIS_URL });

client.on('error', (err) => {
  console.error('Redis error:', err);
});

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});


mongoose.connect(dburi)
  .then((result) => {
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((err) => console.log(err));

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


const googleGenerativeAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = googleGenerativeAI.getGenerativeModel({model: "gemini-pro"});

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
  res.send('hello 123');
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
  console.log(req.body);
  const hashedPassword = await bcrypt.hash(password, 10);
  const data = new profile({
    username,
    email,
    password: hashedPassword
    })
  try {
    const dataToSave = await data.save();
    const { username, email } = dataToSave;
    res.status(200).json({ username, email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }

})

//login

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const data = await profile.findOne({ email: email });
  // console.log("data : ",data )
  if(data){
    const { username } = data;
    const profile_data = await userprofile.findOne({ name: username });
    if(profile_data){
      const { profile_pic } = profile_data;
    }
  }


  if (data) {
    const isMatch = await bcrypt.compare(password, data.password);

    if (isMatch) {
      const data_id = data._id;
      const accessToken = generateAccessToken({ email: data.email, id: data_id.toString() ,username: data.username});
      const refreshToken = generateRefreshToken({ email: data.email, id: data_id.toString() });

      const info = {
        id: data_id.toString(),
        username: data.username,
        email: data.email,
        // profile_pic: profile_pic
      }
      res.cookie('accessToken', accessToken, {
      httpOnly: true,
      sameSite: 'strict',
      
      maxAge: 7 * 60 * 60 * 1000, // 7 hours in milliseconds
    });
    
      res.status(200).json({ info,accessToken, refreshToken });
      // console.log("access Token :",accessToken,"\nRefresh token", refreshToken);
      
    } else {
      res.status(500).json({ error: "Password is incorrect" });
    }
  } else {
    res.status(500).json({ error: "Email is incorrect" });
  }


});


// uploadin the profile
app.post('/upload',  async (req, res) => {
  try {

    const { name, phoneno, bio, insta, linkedin, username, image } = req.body;
    console.log(req.body);

    //find and update the username asosiated with the profile with userprofile model and if not found create a new one

    const user = await profile.findOneAndUpdate({ username: username }, { username: name }, { new: true })

    // first find whether the user exists or not if not then create a new one
    const getprofile = await userprofile.findOne({ name: username })
    if (getprofile) {
      // if user exists then update the profile
      const updateprofile = await userprofile.findOneAndUpdate({ name: username }, { name, profile_pic: image, phoneno, bio, instagram: insta, linkedin }, { new: true })
      const updateprofileincomments = await blogschema.updateMany({ "comments.username": username }, { "comments.$.username": name }, { new: true })
      console.log("updated profile : ", updateprofile)
    }
    else {
      // if user does not exists then create a new profile
      const user_profile = new userprofile({ name, profile_pic: image, phoneno, bio, instagram: insta, linkedin })
      await user_profile.save()
    }

    const checkblogs = await blogschema.find({ author: username })
    //also update the blog author name and author image in the blog schema
    if (checkblogs) {
      const updateblog = await blogschema.updateMany({ author: username }, { author: name, author_img: image }, { new: true })
    }

    console.log("body = ", name, "no. ", phoneno, "bio ", bio, "insta ", insta, "linkedin ", linkedin, "\nusername = ", username)

    res.status(200).json(req.body);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// get profile data

app.get('/api/getprofile/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const cacheKey = `profile_${username}`;

    const cachedData = await client.get(cacheKey);
    if (cachedData) {
      console.log('Cache hit:', cacheKey);
      return res.status(200).json(JSON.parse(cachedData));
    }

    const data = await userprofile.findOne({ name: username });

    await client.setex(cacheKey, 1800, JSON.stringify(data));

    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/getprofile', verifyToken, async (req, res) => {
  try {
    const cacheKey = `profile_${req.user.username}`;

    const cachedData = await client.get(cacheKey);
    if (cachedData) {
      console.log('Cache hit:', cacheKey);
      return res.status(200).json(JSON.parse(cachedData));
    }

    const data = await userprofile.findOne({ name: req.user.username });

    await client.setex(cacheKey, 1800, JSON.stringify(data));

    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.get('/getprofilepic/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const cacheKey = `profile_pic:${username}`;

    // Check if the profile picture is cached in Redis
    const cachedImage = await client.get(cacheKey);
    if (cachedImage) {
      console.log('Cache hit:', cacheKey);
      return res.status(200).json(JSON.parse(cachedImage));
    }

    // If not in cache, fetch from database
    const data = await userprofile.findOne({ name: username });
    if (data && data.profile_pic.length > 0) {
      const image = data.profile_pic;
      
      // Cache the profile picture in Redis
      await client.setex(cacheKey, 1800, JSON.stringify(image)); // Cache for 30 minutes

      return res.status(200).json(image);
    } else {
      return res.status(404).json({ message: 'Profile picture not found' });
    }
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// create blog

app.post('/api/createblog',verifyToken,async(req,res)=>{
  if (content.length < 50 || title.length === 0 || tag.length === 0 || category.length === 0 || image.length === 0 || author.length === 0) {
    return res.status(400).json({ message: 'Please fill in all fields' });
  }
  const { author, author_img, image, title, content, tag, category } = req.body;   
  console.log("req.query : ",req.query);
  try{

    const authorid = await profile.findOne({ username: author })
    const auth_id = authorid._id;
    if(!author_img){
      const authorimage = await userprofile.findOne({ name: author });
      author_img = authorimage.profile_pic;
    }

    const data = new blogschema({
      author,
      author_img,
      author_id: auth_id,
      blog_image: image,
      title,
      body: content,
      tags: tag,
      category,
    });  

    const dataToSave = await data.save();
    // console.log("data to save : ",dataToSave);
    res.status(200).json(dataToSave);
  }
  catch(error){
    console.log(error);
  }
})

// get all blogs

app.get('/api/getblog', async (req, res) => {
  try {
    const cacheKey = req.originalUrl;

    const cachedData = await client.get(cacheKey);
    if (cachedData) {
      console.log('Cache hit:', cacheKey)
      return res.status(200).json(JSON.parse(cachedData));
    }

    const allblogs = await blogschema.find();

    await client.setex(cacheKey, 1800, JSON.stringify(allblogs));

    res.status(200).json(allblogs);
  } catch (error) {
    console.error('Error fetching blogs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// get blog by id

app.get('/api/getblog/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `blog:${id}`;

    const cachedBlog = await client.get(cacheKey);
    if (cachedBlog) {
      console.log('Cache hit:', cacheKey);
      return res.status(200).json(JSON.parse(cachedBlog));
    }

    const blog = await blogschema.findById(id);
    if (blog) {
      await client.setex(cacheKey, 1800, JSON.stringify(blog));

      return res.status(200).json(blog);
    } else {
      return res.status(404).json({ message: 'Blog not found' });
    }
  } catch (error) {
    console.error('Error fetching blog:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// get user blog

app.get('/api/userblog/:username',async(req,res)=>{
  try{

    const { username } = req.params;
    const cacheKey = `userblog:${username}`;
    const cachedBlog = await client.get(cacheKey);
    if (cachedBlog) {
      console.log('Cache hitx:', cacheKey);
      return res.status(200).json(JSON.parse(cachedBlog));
    }

    const blog = await blogschema.find({ author: username });
    await client.setex(cacheKey, 1800, JSON.stringify(blog));

    res.status(200).json(blog);
  }
  catch(error){
    console.log(error);
  }
})


// get saved blogs

app.get('/api/savedblog/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const cacheKey = `savedblog:${username}`;
    const cachedBlog = await client.get(cacheKey);
    if (cachedBlog) {
      console.log('Cache hit:', cacheKey);
      return res.status(200).json(JSON.parse(cachedBlog));
    }


    const userProfile = await userprofile.findOne({ name: username });
    
    if (!userProfile || !userProfile.saved_blogs || userProfile.saved_blogs.length === 0) {
      return res.status(200).json({ message: "No saved blogs" });
    }

    const blog = await blogschema.find({ _id: { $in: userProfile.saved_blogs } });

    if (blog.length === 0) {
      return res.status(200).json({ message: "No saved blogs" });
    }

    await client.setex(cacheKey, 1800, JSON.stringify(blog));

    res.status(200).json(blog);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});


// save blog

app.post('/api/saveblog', async (req, res) => {
  console.log("req.body : ", req.body);
  const { username, blog_id } = req.body;
  try {
    

      const updated = await userprofile.findOneAndUpdate(
          { name: username },
          { $addToSet: { saved_blogs: blog_id } },
          { new: true }
      );
      // console.log("updated : ", updated);
      res.status(200).send("Blog saved successfully");
  } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).send("Internal Server Error");
  }
});

// add comments to the blog

app.post('/api/postcomment', async (req, res) => {
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

    console.log("updated:", updated);
    return res.status(200).send("Comment posted successfully");
  } catch (error) {
    console.error('Error posting comment:', error);
    return res.status(500).send("Internal Server Error");
  }
});


// get comments of the blog
app.get('/api/getcomment/:id',async(req,res)=>{
  try{

    const { id } = req.params;

    const cacheKey = `comments:${id}`;
    const cachedComments = await client.get(cacheKey);
    if (cachedComments) {
      console.log('Cache hit:', cacheKey);
      return res.status(200).json(JSON.parse(cachedComments));
    }

    const blog = await blogschema.findById(id);
    await client.setex(cacheKey, 1800, JSON.stringify(blog.comments));
    res.status(200).json(blog.comments);
  }
  catch(error){
    console.log(error);
  }

})



// get blog by category
app.get('/api/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const cacheKey = `category:${category}`;

    const cachedBlogs = await client.get(cacheKey);
    if (cachedBlogs) {
      console.log('Cache hit:', cacheKey);
      return res.status(200).json(JSON.parse(cachedBlogs));
    }

    let blogs;
    if (category === "Health") {
      blogs = await blogschema.find({ category: { $in: ["Health", "Personal Development"] } });
    } else if (category === "Others") {
      blogs = await blogschema.find({ category: { $nin: ["Health", "Personal Development", "Technology", "Science", "Business", "Automobile"] } });
    } else {
      blogs = await blogschema.find({ category: category });
    }

    await client.setex(cacheKey, 1800, JSON.stringify(blogs)); // Cache for 30 minutes

    res.status(200).json(blogs);
  } catch (error) {
    console.error('Error fetching blogs by category:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// follow category
app.post('/api/followcategory', async (req, res) => {
  const { category, username } = req.body;
  try {
    const getuserinfo = await userprofile.findOne({ name: username });
    
    if (!getuserinfo || !getuserinfo.followed_topics) {
      res.status(404).send("User not found or followed_topics is null");
      console.log("User not found or followed_topics is null");
      return;
    }
    
    const { followed_topics } = getuserinfo;
    
    if (followed_topics.includes(category)) {
      res.status(200).send("Category already followed");
      console.log("Category already followed");
      return;
    }

    const isCategory = await Category.findOne({ name: category });
    
    if (!isCategory) {
      const newCategory = new Category({ name: category, followed_by: [username] });
      await newCategory.save();
      console.log("new category : ", newCategory);
    } else {
      const updated = await Category.findOneAndUpdate(
        { name: category },
        { $addToSet: { followed_by: username } },
        { new: true }
      );
      console.log("updated : ", updated);
    }

    const updated = await userprofile.findOneAndUpdate(
      { name: username },
      { $addToSet: { followed_topics: category } },
      { new: true }
    );
    res.status(200).send("Category followed successfully");
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).send("Internal Server Error");
  }
});

  // category followed by user

  app.get('/api/getcategoryinfo/:category', async (req, res) => {
    try {
      const { category } = req.params;
      const cacheKey = `categoryInfo:${category}`;
  
      const cachedCategory = await client.get(cacheKey);
      if (cachedCategory) {
        console.log('Cache hit:', cacheKey);
        return res.status(200).json(JSON.parse(cachedCategory));
      }
  
      const data = await Category.findOne({ name: category });
      if (!data) {
        return res.status(404).json({ message: 'Category not found' });
      }
  
      await client.setex(cacheKey, 1800, JSON.stringify(data)); // Cache for 30 minutes
  
      res.status(200).json(data);
    } catch (error) {
      console.error('Error fetching category info:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });


  // recently saved
  app.get('/api/recentlysaved/:username', async (req, res) => {
    const { username } = req.params;
    try {
      const cacheKey = `recentlySaved:${username}`;
  
      const cachedRecentlySaved = await client.get(cacheKey);
      if (cachedRecentlySaved) {
        const { recently_savedblog, blog_id, profile_pic } = JSON.parse(cachedRecentlySaved);
        console.log('Cache hit:', cacheKey);
        return res.status(200).json({ recently_savedblog, blog_id, profile_pic });
      }
  
      const userProfile = await userprofile.findOne({ name: username });
      if (!userProfile || !userProfile.saved_blogs || userProfile.saved_blogs.length === 0) {
        res.status(200).json({ message: "No saved blogs" });
        return;
      }
  
      const recently_savedblog = await blogschema.find({ _id: { $in: userProfile.saved_blogs } }).limit(2).sort({ $natural: +1 });
  
      await client.setex(cacheKey, 1800, JSON.stringify({ recently_savedblog, blog_id: userProfile.saved_blogs, profile_pic: userProfile.profile_pic }));
  
      res.status(200).json({ recently_savedblog, blog_id: userProfile.saved_blogs, profile_pic: userProfile.profile_pic });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });




app.get('/api/getIP',async(req,res)=>{
  const ip = req.socket.remoteAddress;
  res.status(200).json(ip);
})



app.get('/api/getuserlikeandcomment/:id/:username', async (req, res) => {
  const { id, username } = req.params;
  try {
    const cacheKey = `userLikeComment:${id}:${username}`;

    const cachedData = await client.get(cacheKey);
    if (cachedData) {
      const { likes, comments, isliked } = JSON.parse(cachedData);
      return res.status(200).json({ likes, comments, isliked });
    }

    const blog = await blogschema.findById(id);
    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    const { likes, comments } = blog;
    const isliked = likes.likedby.includes(username);

    await client.setex(cacheKey, 1800, JSON.stringify({ likes, comments, isliked }));

    res.status(200).json({ likes, comments, isliked });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


app.post('/api/likeblog',async(req,res)=>{
  const { blog_id, username } = req.body;
  try {
    const updated = await blogschema.findOneAndUpdate(
      { _id: blog_id },
      { $addToSet: { "likes.likedby": username } },
      { new: true }
    );
    // console.log("updated : ", updated);
    res.status(200).send("Blog liked successfully");
  }
  catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).send("Internal Server Error");
  }
})


app.post('/api/unlikeblog',async(req,res)=>{
  const { blog_id, username } = req.body;
  try {
    const updated = await blogschema.findOneAndUpdate(
      { _id: blog_id },
      { $pull: { "likes.likedby": username } },
      { new: true }
    );
    // console.log("updated : ", updated);
    res.status(200).send("Blog unliked successfully");
  }
  catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).send("Internal Server Error");
  }
})


// summarization of the blog

app.post('/api/summarize',async(req,res)=>{

  const request_body = req.body;
  const { body } = request_body;
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

  const result = await model.generateContent(prompt);
  const response = await result.response
  const text = response.text()
  res.status(200).json(text);
  // console.log(text);
})

app.post('/api/generateText',async(req,res)=>{
  const { prompt } = req.body;
  const result = await model.generateContent(prompt );
  const response = await result.response;
  const text = response.text();
  res.status(200).json(text);
})




app.get('/api/getlikesandsaved', async (req, res) => {
  const { blog_id, username } = req.query;
  let saved = false;
  let liked = false;

  try {
    const cacheKey = `likesSaved:${blog_id}:${username}`;

    const cachedData = await client.get(cacheKey);
    if (cachedData) {
      const { saved, liked } = JSON.parse(cachedData);
      console.log('Cache hit:', cacheKey);
      return res.status(200).json({ saved, liked });
    }

    const profile = await userprofile.findOne({ name: username });
    if (profile && profile.saved_blogs && profile.saved_blogs.includes(blog_id)) {
      saved = true;
    }

    const blog = await blogschema.findById(blog_id);
    if (blog && blog.likes && blog.likes.likedby && blog.likes.likedby.includes(username)) {
      liked = true;
    }

    await client.setex(cacheKey, 1800, JSON.stringify({ saved, liked }));

    res.status(200).json({ saved, liked });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



app.get('/api/popular', async (req, res) => {
  const mostliked = await blogschema.find().sort({ likes: -1 }).limit(3);
  const mostcommented = await blogschema.find().sort({ comments: -1 }).limit(3);
  const mostLikeAndComments = mostliked.filter(blog => {
    
    return mostcommented.some(commentedBlog => commentedBlog._id.equals(blog._id));
  });

  res.status(200).json(mostLikeAndComments);
});

app.get('/hellox' , (req,res) => {
  res.send('hello');
})



// get all the comments of blog of an author
app.get('/api/getallcomments/:author', async (req, res) => {
  try {
    const { author } = req.params;
    const cacheKey = `commentsxs:${author}`;

    const cachedComments = await client.get(cacheKey);
    if (cachedComments) {
      const parsedComments = JSON.parse(cachedComments);
      console.log('Cache hit:', cacheKey);
      return res.status(200).json(parsedComments);
    }

    const blogs = await blogschema.find({ author: author });

    let allComments = [];
    blogs.forEach(blog => {
      if (blog.comments && blog.comments.length > 0) {
        allComments = allComments.concat(blog.comments);
      }
    });

    const flattenedComments = allComments.flat();

    await client.setex(cacheKey, 1800, JSON.stringify(flattenedComments));

    res.status(200).json(flattenedComments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});



app.delete('/api/deleteblog/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const data = await blogschema.findByIdAndDelete(id);
    console.log("data",data)
    res.status(200).json(data);
  } catch (error) {
    console.error('Error deleting blog:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

//edit blog

app.post('/api/editblog', verifyToken, async (req, res) => {
  const { author, image, title, content, tag, category } = req.body; 
  const id = req.query.blog_id;  
  
  try {
    console.log("user",req.user.username)
    const authorProfile = await profile.findOne({ username: req.user.username });
    if (!authorProfile) {
      return res.status(404).json({ error: 'Author not found' });
    }
    const authorId = authorProfile._id;

    let authorImg = req.body.author_img; 
    if (!authorImg) {
      const userProfile = await userprofile.findOne({ name: author });
      authorImg = userProfile ? userProfile.profile_pic : null;
    }

    // Update the blog document
    const updatedBlog = await blogschema.findByIdAndUpdate(id, {
      author,
      author_img: authorImg,
      author_id: authorId,
      blog_image: image,
      title,
      body: content,
      tags: tag,
      category,
    }, { new: true });

    if (!updatedBlog) {
      return res.status(404).json({ error: 'Blog not found' });
    }
    // console.log("updated blog : ",updatedBlog);
    res.status(200).json(updatedBlog);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/api/updatePrivate/:id',async(req,res)=>{
  const { id } = req.params;
  const updated = await blogschema.findByIdAndUpdate(id,{ $set: { isPrivate: true } },{ new: true });
  console.log("updated : ",updated);
  res.status(200).json(updated);
}
)

app.get('/api/togglePrivate/:id',async(req,res)=>{
  console.log("toggle private");
  const { id } = req.params;
  const blog = await blogschema.findById(id);
  const { isPrivate } = blog;
  const updated = await blogschema.findByIdAndUpdate(id,{ $set: { isPrivate: !isPrivate } },{ new: true });
  console.log("updated : ",updated);
  const { isPrivate: updatedPrivate } = updated;
  console.log("\n\nupdated private : ",updatedPrivate);
  res.status(200).json(updatedPrivate);
}
)

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