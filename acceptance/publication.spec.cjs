const { test, expect } = require('@playwright/test');

test('published origin serves assets and direct login route with a root service worker', async ({ page, request, baseURL }) => {
    test.skip(!process.env.ACCEPTANCE_URL, 'Requires the published Pages origin');
    const origin = new URL(baseURL).origin;
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Connect storage', exact: true })).toBeVisible();
    await expect(page).toHaveURL(origin + '/login');
    const assets = await page.locator('script[src], link[rel=stylesheet]').evaluateAll(nodes => nodes.map(n => n.src || n.href));
    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets) {
        expect(new URL(asset).origin).toBe(origin);
        expect((await request.get(asset)).ok()).toBeTruthy();
    }
    const worker = await page.evaluate(() => navigator.serviceWorker.ready.then(r => ({ scope: r.scope, script: r.active.scriptURL })));
    expect(worker.scope).toBe(origin + '/');
    expect(worker.script).toBe(origin + '/service-worker.js');
    const manifest = await request.get('/manifest.json');
    expect(manifest.ok()).toBeTruthy();
    expect(new URL((await manifest.json()).start_url, baseURL).origin).toBe(origin);
});
