/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app under https://simgenlogic.github.io/Life365/,
// so all built asset paths must be relative to that base.
export default defineConfig({
  base: '/Life365/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
