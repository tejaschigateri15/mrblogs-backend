import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const generateRefreshToken=(user) => {
    return jwt.sign({ user }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
}

export default generateRefreshToken;

// generateAccessToken.js
// generateRefreshToken.js