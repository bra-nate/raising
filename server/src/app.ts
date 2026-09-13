import express from 'express';
import cors from 'cors';
import { config } from './config';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import memberRoutes from './routes/members';
import memberReportRoutes from './routes/member-reports';
import settingsRoutes from './routes/settings';
import activityLogRoutes from './routes/activity-log';
import dashboardRoutes from './routes/dashboard';
import firstTimerRoutes from './routes/first-timers';
import firstTimerReportRoutes from './routes/first-timer-reports';
import notificationRoutes from './routes/notifications';
import caseRoutes from './routes/cases';
import groupRoutes from './routes/groups';
import metricsRoutes from './routes/metrics';
import privacyRoutes from './routes/privacy';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.clientUrl }));
  app.use(express.json());

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', service: 'raising' });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/members', memberRoutes);
  app.use('/api/v1/member-reports', memberReportRoutes);
  app.use('/api/v1/settings', settingsRoutes);
  app.use('/api/v1/activity-log', activityLogRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/first-timers', firstTimerRoutes);
  app.use('/api/v1/first-timer-reports', firstTimerReportRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/cases', caseRoutes);
  app.use('/api/v1/groups', groupRoutes);
  app.use('/api/v1/metrics', metricsRoutes);
  app.use('/api/v1/privacy', privacyRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}
