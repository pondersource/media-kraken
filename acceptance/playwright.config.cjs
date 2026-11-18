const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: '.', timeout: 120_000, workers: 1,
    use: { baseURL: 'http://localhost:8080', trace: 'retain-on-failure' },
    webServer: [
        { command: 'node acceptance/serve.cjs', cwd: '..', url: 'http://localhost:8080' },
        { command: 'PATH="$NODE14_BIN:$PATH" npm run test:serve-pod', cwd: '..', url: 'http://localhost:4000' },
    ],
});
