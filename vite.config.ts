import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createRequire } from 'module';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const { sendSmtpEmail } = require('./electron/smtpSender.cjs');

function smtpEmailMiddlewarePlugin() {
  return {
    name: 'smtp-email-middleware',
    configureServer(server: any) {
      server.middlewares.use('/api/send-email', (req: any, res: any, next: any) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk.toString('utf8');
        });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const result = await sendSmtpEmail(payload);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err?.message || 'Error procesando solicitud SMTP' }));
          }
        });
      });
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), smtpEmailMiddlewarePlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api/sri-persona': {
          target: 'https://srienlinea.sri.gob.ec',
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/api\/sri-persona/, '/sri-catastro-sujeto-servicio-internet/rest/Persona'),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        },
        '/api/sri-catastro': {
          target: 'https://srienlinea.sri.gob.ec',
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/api\/sri-catastro/, '/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente'),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        },
        '/api/sri-deudas': {
          target: 'https://srienlinea.sri.gob.ec',
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/api\/sri-deudas/, '/movil-servicios/api/v1.0/deudas'),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        },
      },
    },
  };
});
