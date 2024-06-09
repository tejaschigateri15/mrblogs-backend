import mongoose from "mongoose";

const schema = new mongoose.Schema({
    author: {
        type: String  //username 
    },
    author_img: {
        type: String
    },
    author_id: {
        type: String // user id of the user who created the blog
    },
    blog_image: {
        type: String
    },
    title: {
        type: String
    },
    body: {
        type: String
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
        type: [String]
    },
    category: {
        type: String
    },
    views: {
        type: Number
    },
    date: {
        type: Date,
        default: Date.now
    },
    likes :{
        likedby : [String],
    },
    isPrivate:{
        type: Boolean,
        default: false
    }

}, { timestamps: true });

const blogschema = mongoose.model("blog-schema", schema);

export default blogschema;
