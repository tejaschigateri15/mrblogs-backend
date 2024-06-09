import mongoose from "mongoose";

const profile = mongoose.Schema({
    name : {
        type:String,
    },
    profile_pic : {
        type:String,
    },
    phoneno : {
        type:String,
    },
    bio : {
        type:String,
    },
    instagram: {
        type:String,
    },
    linkedin : {
        type:String,
    },
    saved_blogs :{
        type:[String]
    },
    followed_topics : {
        type:[String]
    },
   
})

const userprofile = mongoose.model("userprofile",profile)
export default userprofile