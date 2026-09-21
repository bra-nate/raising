import app from './index';
import { config } from './config';
import { startScheduler } from './jobs/scheduler';

app.listen(config.port, () => {
  console.log(`raising API listening on http://localhost:${config.port} (${config.nodeEnv})`);
  startScheduler();
});
