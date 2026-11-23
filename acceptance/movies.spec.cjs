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
    await page.locator('.rs-choose-solid').click();
    await page.locator('[name=rs-provider-address]').fill('http://localhost:4000');
    await page.locator('.rs-solid-connect').click();
    await page.locator('#email').fill('alice@example.com');
    await page.locator('#password').fill('storage-test-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByRole('button', { name: /consent|authorize/i }).click();
    await expect(page).toHaveURL(url => url.origin === new URL(process.env.ACCEPTANCE_URL || 'http://localhost:8080').origin);
}

test('production app imports private movies and reads watched state from a fresh browser', async ({ page, browser, request, baseURL }) => {
    await connect(page);
    await expect(page.getByText('Welcome to Media Kraken!')).toBeVisible({ timeout: 20_000 });
    const writes = new Set();
    page.on('response', response => {
        if (response.ok() && response.url().startsWith(pod + 'movies/_rs/resources/') &&
            ['PUT', 'PATCH', 'POST'].includes(response.request().method()) &&
            (response.request().postData() || '').includes(schema + 'Movie')) {
            writes.add(new URL(response.headers().location || response.url(), response.url()).href);
        }
    });
    await page.getByText("Yes, I have some movies I'd like to import", { exact: true }).click();
    await page.getByRole('button', { name: 'Import from JSON-LD', exact: true }).click();
    await page.locator('#file-picker').setInputFiles({
        name: 'collection.json', mimeType: 'application/ld+json',
        buffer: fs.readFileSync(path.join(__dirname, '../cypress/fixtures/collection.json')),
    });
    await expect(page.getByText('1 movies have been added to your collection to watch later', { exact: false })).toBeVisible();
    await expect(page.getByText('1 watched movies have been added to your collection', { exact: false })).toBeVisible();
    await page.getByText('OK', { exact: true }).click();
    await page.getByText('My Collection', { exact: true }).click();
    await expect(page.getByRole('link', { name: 'Symbol (Watched)', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Jaws (Watch later)', exact: true })).toBeVisible();
    await expect.poll(() => writes.size).toBeGreaterThanOrEqual(2);
    for (const url of writes) {
        expect(url).not.toBe(pod + 'movies/_rs/resources/');
        expect([401, 403, 404]).toContain((await request.get(url)).status());
    }

    const fresh = await browser.newContext({ baseURL });
    try {
        const freshPage = await fresh.newPage();
        const remoteReads = [];
        freshPage.on('response', response => {
            if (response.ok() && response.request().method() === 'GET' && response.url().startsWith(pod + 'movies/_rs/resources/')) {
                remoteReads.push(response.url());
            }
        });
        await connect(freshPage);
        await freshPage.getByText('My Collection', { exact: true }).click();
        await expect(freshPage.getByRole('link', { name: 'Symbol (Watched)', exact: true })).toBeVisible();
        await expect(freshPage.getByRole('link', { name: 'Jaws (Watch later)', exact: true })).toBeVisible();
        expect(remoteReads).toEqual(expect.arrayContaining([...writes]));
        // The new browser has no cached app data; the module read above came from the pod.
        const documents = await freshPage.evaluate(async () => {
            const module = window.ponderStorage.api;
            const documents = [];
            for (const url of await module.resources.urls()) {
                const resource = await module.resources.get(url);
                if (resource.kind === 'rdf') documents.push({ url, body: resource.triples.join('\n') });
            }
            return documents;
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
        const collectionRoute=freshPage.url();
        await freshPage.reload();
        await expect(freshPage).toHaveURL(collectionRoute);
        await expect(freshPage.getByRole('link', {name: 'Symbol (Watched)', exact:true})).toBeVisible();
        if (!await freshPage.locator('.rs-box-connected .rs-disconnect').isVisible()) await freshPage.locator('.rs-widget-icon').click();
        await freshPage.locator('.rs-box-connected .rs-disconnect').click();
        await expect(freshPage.getByText('Symbol', {exact:true})).toHaveCount(0);
    } finally {
        await fresh.close();
    }
});
