# Ponder Source distribution

The target hostname is https://media-kraken.pondersource.com. Pages must use Actions and DNS must point to the Ponder Source Pages service. The app must not be listed as live before that deployment is verified.

CI keeps the existing Cypress Solid suite and adds a Playwright test against the production bundle. It registers a disposable CSS account, logs in through the UI, imports the existing JSON-LD movie fixture, checks private resource writes and anonymous denial, and logs in from a clean browser context to recover watched and watch-later state.

The disposable CSS server uses file storage. The test independently parses its stored movie resources and checks Movie/WatchAction relationships through the shared movies module at a pinned revision. This complements successful remote GETs and fresh-browser UI checks; it does not rely on capturing response bodies, which were empty in Chromium's network observations for these cross-origin reads.

Runtime still uses Soukai Solid. The shared module remains a reader and does not cover writes, type-index discovery or migration. The rs.js Solid backend cannot by itself replace native RDF serialization. These integrations remain unfinished until they can preserve the existing model.
