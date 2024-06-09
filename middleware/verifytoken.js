import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();


const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'] || req.query.accessToken || req.cookies.accessToken;
  
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    //   req.message = 'Access denied. No token provided.';
    }
  
    try {
      
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET );
      console.log(decoded);
      req.user = decoded;
      next();
    } catch (error) {
      console.log(error);
      return res.status(400).json({ message: 'Invalid token.' });
    }
  };

export default verifyToken;