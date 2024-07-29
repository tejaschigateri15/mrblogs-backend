import mongoose from "mongoose";

const schema = new mongoose.Schema({
    author: {
        type: String,  //username 
        required: [true, 'Author is required']
    },
    author_img: {
        type: String
    },
    author_id: {
        type: String, // user id of the user who created the blog
        required: [true, 'Author ID is required']
    },
    blog_image: {
        type: String,
        required: [true, 'Blog image is required']
    },
    title: {
        type: String,
        required: [true, 'Title is required']
    },
    body: {
        type: String,
        required: [true, 'Content is required'],
        minlength: [50, 'Content must be at least 50 characters']
    },
    comments: [
        {
            username: String,
            user_img: String,
            comment: String,
            date: {
                type: Date,
                default: Date.now
            }
        },
    ],
    tags: {
        type: [String],
        required: [true, 'Tags are required']
    },
    category: {
        type: String,
        required: [true, 'Category is required']
    },
    views: {
        type: Number,
        default: 0
    },
    date: {
        type: Date,
        default: Date.now
    },
    likes: {
        likedby: [String],
        default: []
    },
    isPrivate: {
        type: Boolean,
        default: false
    },
    views: {
        count: { type: Number, default: 0 },
        uniqueVisitors: [{ type: String }],
        lastViewedAt: { type: Date, default: null }
  }

}, { timestamps: true });

const blogschema = mongoose.model("blog-schema", schema);

export default blogschema;
