import express from 'express';
import cors from 'cors';
import { config } from './config';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import memberRoutes from './routes/members';
import memberReportRoutes from './routes/member-reports';
import settingsRoutes from './routes/settings';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors({ origin: config.clientUrl }));
app.use(express.json());

// Health check
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', service: 'raising' });
});

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/members', memberRoutes);
app.use('/api/v1/member-reports', memberReportRoutes);
app.use('/api/v1/settings', settingsRoutes);

// 404 for unmatched routes
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler (must be last)
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`raising API listening on http://localhost:${config.port} (${config.nodeEnv})`);
});

export default app;
