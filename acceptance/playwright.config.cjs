const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: '.', timeout: 120_000, workers: 1,
    use: { launchOptions: {executablePath: process.env.CHROMIUM_PATH}, baseURL: process.env.ACCEPTANCE_URL || 'http://localhost:8080', trace: 'retain-on-failure' },
    webServer: [
        ...(!process.env.ACCEPTANCE_URL ? [{ command: 'node acceptance/serve.cjs', cwd: '..', url: 'http://localhost:8080' }] : []),
        { command: 'node pod-server.cjs', url: 'http://localhost:4000' },
    ],
});
