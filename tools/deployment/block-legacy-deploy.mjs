console.error('[deploy] BLOCKED: legacy npm run deploy is disabled to protect the production gh-pages branch.');
console.error('[deploy] Use the existing staging deployment workflow for gh-pages-3.');
console.error('[deploy] Production publishing requires: npm run deploy:production');
process.exit(1);
