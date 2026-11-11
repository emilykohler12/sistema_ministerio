import { defineConfig, devices } from '@playwright/test'

// Pruebas en el navegador real contra el Supabase local (docs/decisiones/0020-agente-qa-y-e2e.md).
// Un solo worker: todas comparten la base local.
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  // Varios flujos (login, alta de taller, descargas anónimas) tardan 20-30 s sin carga: el valor por defecto de 30 s no deja margen.
  // Los expect siguen en 5 s, así que un asserto que no se cumple falla igual de rápido.
  timeout: 60_000,
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
