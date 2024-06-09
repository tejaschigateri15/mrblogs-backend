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
// import cloudinary from "./config/cloudinary.js";
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



dotenv.config();

const app = express();

const port = process.env.PORT || 3000; // Use uppercase 'PORT' for consistency

const dburi = process.env.mongoURI;

app.use(cors());
app.use(express.json());

app.use(cookieParser());
app.use(bodyParser.json({limit: '35mb'}));

app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: '35mb',
    parameterLimit: 50000,
  }),
);


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

const client = redis.createClient();

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
  res.send('hello world');
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
  // const profile_data = await userprofile.findOne({ name: data.username })
  // if (profile_data){
  //   const { profile_pic } = profile_data;
  // }
  
  // console.log("profile data : ",profile_data);
  // let token;

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

  // console.log(req.body,token);

});



app.post('/profile', async (req, res) => {
  res.cookie("id", "1234", { maxAge: 3600000 * 24, httpOnly: true });
  console.log(req.cookies);
  res.status(200).json({ message: "success" });
})

const authenticateToken = async (req, res, next) => {
  const token = req.headers.Authorization;
  const authtoken = token && token.split(' ')[1];
  console.log(req.headers.authorization, authtoken);

  if (!token) return res.sendStatus(401);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    console.log(req.user);
    next();
  } catch (error) {
    res.status(400).send("Invalid token.");
  }
}

app.get('/authen', authenticateToken, async function (req, res) {
  const user = req.user;
  res.status(200).json(`Hello ${user.email}`);
  console.log(user);
});

app.post('/nn', async (req, res) => {
  const user = {
    id: 1,
    username: 'brad'
  }
  res.json(user)
})

app.get('/user', async (req, res) => {
  try {
    const name = req.query.user_name;
    console.log("name", name);
    const data = await profile.findOne({ username: name });
    console.log("data132 : ", data);
    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
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

app.get('/api/getprofile/:username',async (req, res) => {
  try {
    // console.log("fdfd",req.user.username)
    const { username } = req.params;
    const data = await userprofile.findOne({ name: username});
    // console.log("data : ",data);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/getprofile', verifyToken,async (req, res) => {
  try {
    console.log("fdfd",req.params)
    const data = await userprofile.findOne({ name: req.user.username});
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.get('/getprofilepic/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const data = await userprofile.findOne({ name: username });
    if(data){
        if(data.profile_pic.length > 0){
          const image = data.profile_pic;
          res.status(200).json(image);
        }
    }
    // res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});




// create blog


app.post('/api/createblog',verifyToken,async(req,res)=>{
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

app.get('/api/getblog',async(req,res)=>{
  const allblogs = await blogschema.find();
  // client.setex(req.originalUrl, 3600, JSON.stringify(allblogs));
  res.status(200).json(allblogs);
})


// get blog by id

app.get('/api/getblog/:id',async(req,res)=>{
  const { id } = req.params;
  const blog = await blogschema.findById(id);
  res.status(200).json(blog);
  // console.log("blog : ",blog);
})


// get user blog

app.get('/api/userblog/:username',async(req,res)=>{
  const { username } = req.params;
  // console.log("username : ",username);
  const blog = await blogschema.find({ author: username });
  res.status(200).json(blog);
  // console.log("blog : ",blog);
})


// get saved blogs

app.get('/api/savedblog/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const userProfile = await userprofile.findOne({ name: username });
    
    if (!userProfile || !userProfile.saved_blogs || userProfile.saved_blogs.length === 0) {
      return res.status(200).json({ message: "No saved blogs" });
    }

    const blog = await blogschema.find({ _id: { $in: userProfile.saved_blogs } });

    if (blog.length === 0) {
      return res.status(200).json({ message: "No saved blogs" });
    }

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

  // Check if required fields are present
  if (!blog_id || !username || !comment) {
    return res.status(400).send("Missing required fields");
  }

  try {
    // Fetch user profile pic
    const user = await userprofile.findOne({ name: username });

    if (!user) {
      return res.status(404).send("User not found");
    }

    const user_img = user.profile_pic;

    // new comment
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
  const { id } = req.params;
  const blog = await blogschema.findById(id);
  res.status(200).json(blog.comments);

})



// get blog by category
app.get('/api/category/:category',async(req,res)=>{

  const { category } = req.params;
  if(category === "Health"){
    const blog = await blogschema.find({ category:{$in: ["Health","Personal Development"]} });
    res.status(200).json(blog);
  
  }
  else if(category === "Others"){
    const blog = await blogschema.find({ category:{$nin: ["Health","Personal Development","Technology","Science","Business","Automobile"]} });
    res.status(200).json(blog);
  }
  else{
    const blog = await blogschema.find({ category: category });
    res.status(200).json(blog);
  }
  
  // console.log("blog : ",blog);
})

// get user profile details
app.post('/api/userdetails',async(req,res)=>{
  // const { username } = req.body;
  // const data = await userprofile.findOne({ name: username });
  // res.status(200).json(data);
  console.log(req.body);
  res.status(200).json(req.body);
})


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

  app.get('/api/getcategoryinfo/:category',async(req,res)=>{
    const { category } = req.params;
    const data = await Category.findOne({ name: category });
    res.status(200).json(data);
  })


  // recently saved
  app.get('/api/recentlysaved/:username', async (req, res) => {
    const { username } = req.params;
    // console.log("username : ", username);
    try {
        const userProfile = await userprofile.findOne({ name: username });
        // console.log("user profile : ", userProfile);
        if (!userProfile || !userProfile.saved_blogs || userProfile.saved_blogs.length === 0) {
            res.status(200).json({ message: "No saved blogs" });
            return;
        }

        // console.log("saved blogs : ", userProfile.saved_blogs);
        const recently_savedblog = await blogschema.find({ _id: { $in: userProfile.saved_blogs } }).limit(2).sort({ $natural: +1 });
        // console.log("recently saved : ", recently_savedblog);
        res.status(200).json({recently_savedblog,blog_id: userProfile.saved_blogs,profile_pic: userProfile.profile_pic});
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
})




app.get('/api/getIP',async(req,res)=>{
  const ip = req.socket.remoteAddress;
  res.status(200).json(ip);
})



app.get('/api/getuserlikeandcomment/:id/:username',async(req,res)=>{
  const { id, username } = req.params;
  const blog = await blogschema.findById(id);
  const { likes, comments } = blog;
  const isliked = likes.likedby.includes(username);
  res.status(200).json({ likes, comments, isliked });
})


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
    const profile = await userprofile.findOne({ name: username });
    
    if (profile && profile.saved_blogs) {
      if (profile.saved_blogs.includes(blog_id)) {
        saved = true;
      }
    }
    
    console.log(req.query);
    
    const blog = await blogschema.findById(blog_id);
    const { likes } = blog;
    
    if (likes && likes.likedby && likes.likedby.includes(username)) {
      liked = true;
    }

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

app.get('/hello' , (req,res) => {
  res.send('hello');
})



// get all the comments of blog of an author
app.get('/api/getallcomments/:author', async (req, res) => {
  try {
    const { author } = req.params;
    const blog = await blogschema.find({ author: author });
    const comments = blog.map(blog => blog.comments);
    const filteredComments = comments.filter(commentArray => commentArray.length > 0);
    const flattenedArray = filteredComments.flatMap(innerArray => innerArray);
    res.status(200).json(flattenedArray);
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