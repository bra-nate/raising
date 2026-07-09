import { createApp } from './app';
import { config } from './config';
import { startScheduler } from './jobs/scheduler';

const app = createApp();

app.listen(config.port, () => {
  console.log(`raising API listening on http://localhost:${config.port} (${config.nodeEnv})`);
  startScheduler();
});

export default app;
