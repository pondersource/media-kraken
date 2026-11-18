const { test, expect } = require('@playwright/test');
const { Parser } = require('n3');
const fs = require('node:fs');
const path = require('node:path');
const pod = 'http://localhost:4000/alice/';
const schema = 'https://schema.org/';
const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

async function connect(page) {
    if (process.env.ACCEPTANCE_URL) {
        // Allow this public test origin to reach the disposable localhost Pod.
        await page.context().grantPermissions(['local-network-access'], { origin: process.env.ACCEPTANCE_URL });
    }
    await page.goto('/');
    await page.getByRole('button', { name: 'Use Solid', exact: true }).click();
    await page.getByPlaceholder('Solid POD url').fill(pod);
    await page.getByRole('button', { name: 'Log in with Solid', exact: true }).click();
    await page.locator('#email').fill('alice@example.com');
    await page.locator('#password').fill('media-kraken-ci-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByRole('button', { name: /consent|authorize/i }).click();
    await expect(page).toHaveURL(url => url.origin === new URL(process.env.ACCEPTANCE_URL || 'http://localhost:8080').origin);
}

test('production app imports private movies and reads watched state from a fresh browser', async ({ page, browser, request, baseURL }) => {
    const signup = await request.post('http://localhost:4000/idp/register/', {
        headers: { Accept: 'application/json' },
        data: {
            email: 'alice@example.com', password: 'media-kraken-ci-password',
            confirmPassword: 'media-kraken-ci-password', createWebId: true,
            register: true, createPod: true, rootPod: false, podName: 'alice',
        },
    });
    expect(signup.ok()).toBeTruthy();
    await connect(page);
    await expect(page.getByText('Welcome to Media Kraken!')).toBeVisible();
    const writes = new Set();
    page.on('response', response => {
        if (response.ok() && response.url().startsWith(pod + 'movies/') &&
            ['PUT', 'PATCH', 'POST'].includes(response.request().method()) &&
            (response.request().postData() || '').includes(schema + 'Movie')) {
            writes.add(new URL(response.headers().location || response.url(), response.url()).href);
        }
    });
    await page.getByText("Yes, I have some movies I'd like to import", { exact: true }).click();
    await page.getByRole('button', { name: 'Import from JSON-LD', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles({
        name: 'collection.json', mimeType: 'application/ld+json',
        buffer: fs.readFileSync(path.join(__dirname, '../cypress/fixtures/collection.json')),
    });
    await expect(page.getByText('1 movies have been added to your collection to watch later', { exact: false })).toBeVisible();
    await expect(page.getByText('1 watched movies have been added to your collection', { exact: false })).toBeVisible();
    await page.getByText('OK', { exact: true }).click();
    await page.getByText('My Collection', { exact: true }).click();
    await expect(page.getByRole('link', { name: 'Symbol (Watched)', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Jaws (Watch later)', exact: true })).toBeVisible();
    expect(writes.size).toBeGreaterThanOrEqual(2);
    for (const url of writes) {
        expect(url).not.toBe(pod + 'movies/');
        expect([401, 403, 404]).toContain((await request.get(url)).status());
    }

    const fresh = await browser.newContext({ baseURL });
    try {
        const freshPage = await fresh.newPage();
        const remoteReads = [];
        freshPage.on('response', response => {
            if (response.ok() && response.request().method() === 'GET' && response.url().startsWith(pod + 'movies/')) {
                remoteReads.push(response.url());
            }
        });
        await connect(freshPage);
        await freshPage.getByText('My Collection', { exact: true }).click();
        await expect(freshPage.getByRole('link', { name: 'Symbol (Watched)', exact: true })).toBeVisible();
        await expect(freshPage.getByRole('link', { name: 'Jaws (Watch later)', exact: true })).toBeVisible();
        expect(remoteReads).toEqual(expect.arrayContaining([...writes]));
        // Inspect the disposable server's persisted resources independently of app caches.
        // Chromium's captured cross-origin response bodies can be empty for these requests.
        const storageRoot = path.resolve(__dirname, '.pod');
        const documents = [...writes].map(url => {
            const resource = new URL(url).pathname.replace(/^\//, '');
            // CSS's ExtensionBasedMapper adds $.ttl for extensionless Turtle resources.
            const direct = path.join(storageRoot, resource);
            const filename = fs.existsSync(direct) ? direct : direct + '$.ttl';
            expect(fs.existsSync(filename), 'persisted resource ' + resource).toBeTruthy();
            return { url, body: fs.readFileSync(filename, 'utf8') };
        });
        const quads = documents.flatMap(({ body, url }) => new Parser({ baseIRI: url }).parse(body));
        const symbol = quads.find(q => q.predicate.value === schema + 'name' && q.object.value === 'Symbol').subject;
        const action = quads.find(q => q.predicate.value === rdfType && q.object.value === schema + 'WatchAction').subject;
        expect(quads.some(q => q.subject.equals(action) && q.predicate.value === schema + 'object' && q.object.equals(symbol))).toBeTruthy();

        const expanded = new Map();
        for (const quad of quads) {
            const id = quad.subject.value;
            const node = expanded.get(id) || { '@id': id };
            expanded.set(id, node);
            if (quad.predicate.value === rdfType && quad.object.termType === 'NamedNode') {
                (node['@type'] ||= []).push(quad.object.value);
                continue;
            }
            const value = quad.object.termType === 'NamedNode'
                ? { '@id': quad.object.value }
                : { '@value': quad.object.value, ...(quad.object.datatype ? { '@type': quad.object.datatype.value } : {}) };
            (node[quad.predicate.value] ||= []).push(value);
        }
        const { parseMovies } = await import('../shared-data-modules/movies/vanilla/build/src/main.js');
        const interpreted = parseMovies([...expanded.values()]);
        expect(interpreted.listings.map(listing => listing.movie.name).sort()).toEqual(['Jaws', 'Symbol']);
        expect(interpreted.watchActions.some(viewing => viewing.listingId === symbol.value)).toBeTruthy();
    } finally {
        await fresh.close();
    }
});
