import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 

  const testauthHead = req.headers['x-testaccesstoken'];
  // const test_token = authHead && authHead.split(' ')[1]; 

  console.log("fg ",testauthHead);
  // console.log(req.headers);

  if (testauthHead) {
    const test_token = testauthHead.split(' ')[1];
    jwt.verify(test_token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        console.log(err);
      }
      if (decoded && decoded.sessionId) {
        req.sessionId = decoded.sessionId;
        console.log("test access token decoded value:", decoded);
      }
    });
}
  
  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    console.log(decoded);
    req.user = decoded;
    next();
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: 'Invalid token.' });
  }
};

export default verifyToken;
