# GitHub Education Phase 1 - Deployment Guard

- Production domain: `notebook.recruit.kro.kr`
- Legacy `npm run deploy` is blocked.
- Explicit production command: `npm run deploy:production`.
- Production command requires `CONFIRM_PRODUCTION_DEPLOY=notebook.recruit.kro.kr` and validates `dist/CNAME` before publishing to `gh-pages`.
- Staging source remains `gh-pages-3`; production is not modified by this package itself.
