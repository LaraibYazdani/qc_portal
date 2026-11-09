import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { authRoutes } from './routes/auth';
import { jobRoutes } from './routes/jobs';
import { userRoutes } from './routes/users';
import { companyRoutes } from './routes/companies';
import { iasRoutes } from './routes/ias';
import { testConnection } from './config/database';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Behind IIS / another reverse proxy, set TRUST_PROXY=1 so the audit log and
// rate limiter see the real client IP instead of the proxy's.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  strictTransportSecurity: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting. Factory terminals and phones often share one public IP, so the
// default is higher than phase 1's 100; tune with RATE_LIMIT_MAX.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 1000
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded design files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API routes
app.use('/api/auth/ias', iasRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Upload problems (wrong file type, too large, too many files) are the user's to fix
  if (err?.name === 'MulterError' || /Invalid file type/.test(err?.message ?? '')) {
    res.status(400).json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 20 MB' : err.message });
    return;
  }
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// In production serve the React build; in dev the 404 handler catches unknown routes
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/build')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build/index.html'));
  });
} else {
  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
}

app.listen(PORT, async () => {
  console.log(`QC Portal Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('WARNING: Database connection failed. Some features may not work.');
  }
});
