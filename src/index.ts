import express, { Application, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import usersRouter from './routes/users.route';
import eventRouter from './routes/event.routes';
import telegramRoutes from './routes/telegram.routes';
import adminAuthRoutes from './routes/admin/auth.routes';
import dashboardRoutes from './routes/admin/dashboard.routes';
import { errorHandler, handleProcessErrors } from  '../src/middleware/error.middleware';
import bodyParser from 'body-parser';
import paymentRoutes from './routes/payment.routes';
import ticketRoutes from './routes/ticket.routes';
import memoryRoutes from './routes/memory.routes';
dotenv.config();
import path from 'path';
// Initialize express app
const app: Application = express();
const server = http.createServer(app);

// Configure view engine
app.set('view engine', 'ejs');
// Update the views directory path
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*', // Fallback to * for dev if not set
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'X-Requested-With', 'Pragma']
}));
app.use(express.json());
app.use(bodyParser.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));
// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI is not defined in environment variables');
  process.exit(1);
}
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((error: Error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });

// Routes
app.use('/api/users', usersRouter);
app.use('/api/events', eventRouter);
app.use('/api/telegram', telegramRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin/memories', memoryRoutes);
app.use('/api/memories', memoryRoutes);
app.use('/ticket', ticketRoutes);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date(),
    database: dbStatus,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware (should be after all other middleware and routes)
app.use(errorHandler);

// Handle unhandled routes
app.all('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND'
  });
});

// Handle process errors
handleProcessErrors(server);

// Start the server
const PORT = process.env.PORT || 3000;
const httpServer = server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// export default httpServer;

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

export default app;
