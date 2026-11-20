import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeDatabase } from './server/db.ts';
import { apiRouter } from './server/routes.ts';
import { seedDemoDatabase } from './server/seed.ts';
import { setupWebSocketServer } from './server/ws.ts';

dotenv.config();

async function bootstrap() {
  initializeDatabase();
  seedDemoDatabase();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'ZAYQORA by VIRELEO', timestamp: new Date().toISOString() });
  });

  app.use('/api', apiRouter);

  const server = http.createServer(app);
  setupWebSocketServer(server);

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3008);
  server.listen(port, '127.0.0.1', () => {
    console.log(`ZAYQORA server running on http://127.0.0.1:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start ZAYQORA server:', err);
  process.exit(1);
});
