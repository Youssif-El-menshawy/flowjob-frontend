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
    proxy: { '/api/v1': { target: process.env.FLOWJOB_API ?? 'http://localhost:8000', changeOrigin: true } },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
