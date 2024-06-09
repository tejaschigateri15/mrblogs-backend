import userprofile from "./user_profile.js";
import mongoose from "mongoose";

const signup = mongoose.Schema({
    username:{
        type:String
    },
    email:{
        type:String
    },
    password:{
        type:String
    },
    // bio:{
    //     type:String
    // },
    // profile_pic:{
    //     type:String
    // }

})


signup.pre('save', async function (next) {
    try{
        // Create a new userprofile with default values
        const userProfile = new userprofile({
            name: this.username, 
            profile_pic:"https://static.vecteezy.com/system/resources/previews/009/734/564/original/default-avatar-profile-icon-of-social-media-user-vector.jpg",
            phoneno:"",
            bio:"",
            instagram:"",
            linkedin:"",
            saved_blogs:[],
            followed_topics:[]
            
        });
        const saved = await userProfile.save();
        // console.log("saved : ",saved);
        next();

    }
    catch(err){
        next(err)
    }

})


const profile = mongoose.model("profile",signup)

export default profile