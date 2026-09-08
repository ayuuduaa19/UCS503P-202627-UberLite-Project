import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
  jwtSecret: process.env.JWT_SECRET || 'uberlite-default-jwt-secret-key-development',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};
