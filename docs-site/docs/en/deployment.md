# GitHub Pages deployment

The project already has a game site, so the docs site must not take over the GitHub Pages root path. The deployment strategy is to publish the game at the root path and the MkDocs site under `/docs/`.

Published URLs:

```text
https://billzi2016.github.io/Othello-AI/
https://billzi2016.github.io/Othello-AI/docs/
```

## What the workflow does

`.github/workflows/pages.yml` builds the game and docs in one deployment:

1. Installs the Rust toolchain.
2. Installs `wasm-bindgen-cli`.
3. Builds `rust-ai` for `wasm32-unknown-unknown`.
4. Generates `assets/wasm/othello_ai.js` and `assets/wasm/othello_ai_bg.wasm`.
5. Installs the MkDocs dependencies from `docs-site/requirements.txt`.
6. Builds `docs-site/mkdocs.yml`.
7. Copies the game files into the `_site/` root.
8. Copies `docs-site/site/` into `_site/docs/`.
9. Uploads `_site/` and deploys it to GitHub Pages.

## Expected deployment result

After deployment, the root path should open the game, and `/docs/` should open the MkDocs site. Both paths come from the same Pages deployment, so separate workflows do not overwrite each other.

If the root path shows the docs site, the artifact layout is wrong. If `/docs/` returns 404, check that the MkDocs build step ran and that `_site/docs/index.html` exists.
