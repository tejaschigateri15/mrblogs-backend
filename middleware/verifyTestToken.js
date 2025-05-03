import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import logger from '../utils/logger.js';

dotenv.config();

const verifyTestToken = (req, res, next) => {
  try {
    const authHeader = req.headers["x-testaccesstoken"];

    if (!authHeader) {
      logger.warn('Token verification failed - No token provided:', {
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const [bearer, token] = authHeader.split(' ');

    if (bearer !== 'Bearer' || !token) {
      logger.warn('Token verification failed - Invalid token format:', {
        ip: req.ip,
        path: req.path,
        bearer,
        hasToken: !!token
      });
      return res.status(401).json({ message: 'Access denied. Invalid token format.' });
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        logger.error('Token verification failed:', {
          error: err.message,
          name: err.name,
          ip: req.ip,
          path: req.path
        });
        return res.status(403).json({ message: 'Invalid token.' });
      }

      if (decoded && decoded.sessionId) {
        logger.info('Token verified successfully:', {
          sessionId: decoded.sessionId,
          ip: req.ip,
          path: req.path
        });
        req.sessionId = decoded.sessionId;
        next();
      } else {
        logger.warn('Token verification failed - Invalid payload:', {
          ip: req.ip,
          path: req.path,
          decoded: decoded || 'null'
        });
        return res.status(403).json({ message: 'Invalid token payload.' });
      }
    });
  } catch (err) {
    logger.error('Unexpected error in token verification:', {
      error: err.message,
      stack: err.stack,
      ip: req.ip,
      path: req.path
    });
    return res.status(400).json({ message: 'Invalid token.' });
  }
};

export default verifyTestToken;