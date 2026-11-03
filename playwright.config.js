import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',
  workers:1,
  retries:0,
  timeout:20000,
  expect:{timeout:8000},
  use:{browserName:'chromium',baseURL:'http://127.0.0.1:3170',trace:'retain-on-failure'},
  reporter:'list',
  webServer:{command:'node e2e/fixture-server.js',url:'http://127.0.0.1:3170/health',reuseExistingServer:!process.env.CI,timeout:15000},
});
