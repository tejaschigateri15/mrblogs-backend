import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const generateAccessToken = (user)=>{
    return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '7d' }); 
}

const generateAccessTokenWithId = (userId)=>{
    console.log(userId)
    return jwt.sign(userId, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '7d' }); 
}

export { generateAccessToken, generateAccessTokenWithId };
