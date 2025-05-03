import winston from 'winston';
import path from 'path';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create the logger
const logger = winston.createLogger({
  format: logFormat,
  transports: [
    // Write all logs with level 'error' and below to 'error.log'
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs with level 'info' and below to 'combined.log'
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      level: 'debug', // Ensure all logs are written to the file
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Log to the console for all levels
logger.add(new winston.transports.Console({
  level: 'debug', // Log everything to the console
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  ),
}));

export default logger;