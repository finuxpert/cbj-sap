import { defineConfig } from '@playwright/test'

const baseURL = process.env.SPHERE_VISUAL_BASE_URL || 'https://sphere.astraotoparts.co.id/dev/#/tool/logs'

export default defineConfig({
  testDir: './tests/visual',
  outputDir: 'test-results/visual',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'Asia/Jakarta',
    reducedMotion: 'reduce',
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-1920',
      use: { viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'laptop-1366',
      use: { viewport: { width: 1366, height: 768 } },
    },
  ],
})
