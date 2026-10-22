import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

if (required('JWT_SECRET').length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long');
}

const nodeEnv = process.env.NODE_ENV || 'development';
const resendApiKey = process.env.RESEND_API_KEY || '';
const emailFrom = process.env.EMAIL_FROM || '';
const sessionMaxAgeMs = Number(process.env.SESSION_MAX_AGE_MS || 604_800_000);
const clientUrl = new URL(process.env.CLIENT_URL || 'http://localhost:5173').origin;
if (!Number.isSafeInteger(sessionMaxAgeMs) || sessionMaxAgeMs <= 0) {
  throw new Error('SESSION_MAX_AGE_MS must be a positive integer');
}
if (nodeEnv === 'production' && resendApiKey && !emailFrom) {
  throw new Error('EMAIL_FROM is required in production when RESEND_API_KEY is configured');
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  sessionMaxAgeMs,
  resendApiKey,
  emailFrom,
  clientUrl,
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv,
} as const;
