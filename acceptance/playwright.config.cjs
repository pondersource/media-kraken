const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: '.', timeout: 120_000, workers: 1,
    use: { baseURL: process.env.ACCEPTANCE_URL || 'http://localhost:8080', trace: 'retain-on-failure' },
    webServer: [
        ...(!process.env.ACCEPTANCE_URL ? [{ command: 'node acceptance/serve.cjs', cwd: '..', url: 'http://localhost:8080' }] : []),
        { command: 'PATH="$NODE14_BIN:$PATH" npm run test:serve-pod -- -c acceptance/css.json -f acceptance/.pod', cwd: '..', url: 'http://localhost:4000' },
    ],
});
