/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    allowedHosts: ['.devtunnels.ms'],
    // Optional: set FLOWJOB_API to point the dev proxy at a backend on another port. Defaults to localhost:8000.
    proxy: {
      '/api/v1': {
        target: process.env.FLOWJOB_API ?? 'http://localhost:8000',
        changeOrigin: true,
        // When the backend is not running, answer 502 Bad Gateway like a production reverse proxy, so the app shows
        // "Can't reach the FlowJob server" (Vite's default is an empty 500, which looks like a backend bug).
        configure(proxy) {
          proxy.on('error', (_error, _request, response) => {
            if ('writeHead' in response && !response.headersSent && !response.writableEnded) {
              response.writeHead(502, { 'Content-Type': 'text/plain' }).end('FlowJob backend is unreachable');
            }
          });
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
