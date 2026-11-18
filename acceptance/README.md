# Solid acceptance

The movie scenario uses real Solid login, private Pod writes, independent RDF and shared-reader checks, and recovery in a clean browser context. It imports the existing upstream collection fixture into a disposable file-backed Community Solid Server.

Set `ACCEPTANCE_URL=https://media-kraken.pondersource.com` to exercise the deployed application instead of starting the local distribution server. The live publication scenario checks the direct login route, root assets, manifest and service-worker scope. Both scenarios run after deployment.

Use Node 14.15 for the legacy application and CSS dependencies, and Node 22 for Playwright and the movies reader. Set `NODE14_BIN` to the Node 14 bin directory when running `npm --prefix acceptance test`; see the workflow for the pinned reader checkout and compilation. Start with an empty `acceptance/.pod` directory. No personal Pod or account is used.
