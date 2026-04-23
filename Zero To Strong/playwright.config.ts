import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
    headless: false, // watch it run
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro
  },
});
