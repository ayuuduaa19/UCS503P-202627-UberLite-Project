import express, { Request, Response } from 'express';
import cors from 'cors';
import { config } from './config';
import authRouter from './routes/auth.routes';
import locationRouter from './routes/location.routes';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';

const app = express();

// CORS configuration
const allowedOrigins = config.corsOrigin.split(',').map((origin) => origin.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy does not allow access from origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// JSON & URL-encoded parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root info endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'UberLite Backend running',
  });
});

// Dedicated health-check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
  });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/location', locationRouter);

// Centralized 404 handler for undefined routes
app.use(notFoundHandler);

// Centralized error handling middleware
app.use(errorHandler);

// Start server
app.listen(config.port, () => {
  console.log(`UberLite backend server running on http://localhost:${config.port} [${config.nodeEnv}]`);
});

export default app;
