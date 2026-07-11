# Othello AI docs

This docs site explains how the browser Othello AI works. The game site stays at the GitHub Pages root path, and these docs are published under `/docs/`.

The project has three runtime layers:

- Page layer: `index.html`, CSS, and `assets/js/main.js` handle the board, menus, animation, and game flow.
- Scheduling layer: `assets/js/ai-manager.js` and `assets/js/ai-worker.js` run AI work inside Web Workers so the UI thread stays responsive.
- Engine layer: `rust-ai/src/lib.rs` implements search in Rust and compiles it to the browser Wasm files in `assets/wasm/`.

Suggested reading order:

1. Start with the quick start page and verify that the local HTTP server opens the game.
2. Read the JavaScript runtime page to see how the browser sends the board to Workers.
3. Read the Rust AI engine page to understand the search function input, output, and expected result.
4. Read the deployment page to see how the game and docs are published together on GitHub Pages.

When the project is working, the page shows an 8x8 board. In human-vs-AI or AI-vs-AI mode, each AI move gets up to 4 seconds. The side panel records the move, search depth, nodes, NPS, elapsed time, and score. If that table stays empty, Worker or Wasm loading is the first place to check.
