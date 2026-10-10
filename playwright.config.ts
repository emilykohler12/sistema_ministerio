import { defineConfig, devices } from '@playwright/test'

// Pruebas en el navegador real contra el Supabase local (docs/decisiones/0020-agente-qa-y-e2e.md).
// Un solo worker: todas comparten la base local.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], headless: true } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
