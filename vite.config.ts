import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as fs from 'node:fs';
import * as path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'save-3d-portraits',
      configureServer(server) {
        server.middlewares.use('/__save_3d_portraits', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end();
            return;
          }
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body) as Record<string, string>;
              const outDir = path.resolve(process.cwd(), 'public/assets');
              fs.mkdirSync(outDir, { recursive: true });
              for (const [role, dataUrl] of Object.entries(data)) {
                if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,')) {
                  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
                  fs.writeFileSync(path.join(outDir, `avatar_${role}.png`), Buffer.from(base64, 'base64'));
                }
              }
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.statusCode = 500;
              res.end(String(err));
            }
          });
        });
      },
    },
  ],
  server: {
    host: true, // Listen on all network addresses (allows local network access for WebXR testing)
    port: 5173,
  },
});
