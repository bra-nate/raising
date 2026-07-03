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

export const config = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  resendApiKey: process.env.RESEND_API_KEY || '',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
} as const;
