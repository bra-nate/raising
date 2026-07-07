import { createApp } from './app';
import { config } from './config';

const app = createApp();

app.listen(config.port, () => {
  console.log(`raising API listening on http://localhost:${config.port} (${config.nodeEnv})`);
});

export default app;
