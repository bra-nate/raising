import { createApp } from './app';

// Vercel imports the Express app; it must not start an in-process scheduler.
export default createApp();
