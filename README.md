# Othello AI

Rust/Wasm Othello AI running entirely in the browser with bitboards, alpha-beta search, and worker-based parallelism.
The engine includes exact endgame search and stability-aware evaluation for stronger late-game decisions.

[中文说明](README.zh.md)

## Live Demo

```text
https://billzi2016.github.io/Othello-AI/
```

## Features

- Browser-only Othello game deployable to GitHub Pages.
- Local two-player mode, human-vs-AI mode, and AI-vs-AI mode.
- Rust/Wasm search engine using two `u64` bitboards.
- Alpha-Beta / NegaMax search with iterative deepening.
- Exact endgame search when the remaining empty squares are low.
- Stability-aware evaluation to distinguish temporary material from safe discs.
- Up to 4 seconds of thinking time per move.
- Web Worker pool using about 90% of local CPU threads by default.
- `coi-serviceworker.js` support for `crossOriginIsolated` on static hosting.

## Project Layout

```text
index.html                  # Page entry and menus
coi-serviceworker.js        # Adds COOP/COEP headers through a Service Worker
assets/js/main.js           # UI, rules, animation, and game flow
assets/js/ai-manager.js     # Worker pool using about 90% CPU threads
assets/js/ai-worker.js      # Loads Rust/Wasm and runs search jobs
assets/wasm/                # Generated browser Wasm bindings
rust-ai/                    # Rust/Wasm AI engine
server.py                   # Threaded local static server with random free port selection
.github/workflows/pages.yml # GitHub Actions build and Pages deployment
```

## Local Development

Do not open `index.html` through `file://`. Web Workers, Wasm, and Service Workers need an HTTP environment.

Use the included server:

```bash
python3 server.py
```

You can also choose a port manually:

```bash
python3 server.py --port 9000
```

The server prints the actual URL, for example:

```text
http://127.0.0.1:8342/
```

On the first visit, `coi-serviceworker.js` may reload the page once so the page is controlled by the Service Worker.

## Build Rust/Wasm

Install Rust and `wasm-bindgen-cli`, then build the engine:

```bash
cd rust-ai
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli
cargo build --target wasm32-unknown-unknown --release
mkdir -p ../assets/wasm
wasm-bindgen --target web --out-dir ../assets/wasm --out-name othello_ai target/wasm32-unknown-unknown/release/othello_ai.wasm
```

Generated files:

```text
assets/wasm/othello_ai.js
assets/wasm/othello_ai_bg.wasm
```

`ai-worker.js` loads `assets/wasm/othello_ai.js` and calls the exported Rust function `search_best_move()`.

## AI Design

The engine stores the board as two `u64` bitboards:

- `black`: occupied squares for black discs.
- `white`: occupied squares for white discs.

Bit index mapping:

```text
index = row * 8 + col
```

Search strategy:

- JavaScript splits root legal moves across multiple Workers.
- Each Worker searches its own root-move shard in Rust/Wasm.
- Rust uses NegaMax-style Alpha-Beta search.
- Iterative deepening keeps a usable best move available within the 4-second budget.
- The endgame phase searches directly to game over instead of relying on heuristic evaluation.
- Evaluation combines square weights, corners, mobility, frontier discs, parity, stability, and terminal disc count.

## Engine Techniques

- **Rust/Wasm**: the search core is written in Rust and compiled to WebAssembly, giving the browser a fast local engine without any backend server.
- **Bitboards**: the board is represented by two `u64` values, so move generation and board updates stay compact and cache-friendly.
- **NegaMax Minimax**: the engine assumes both sides choose their best moves and uses a symmetric NegaMax form to simplify recursive search.
- **Alpha-Beta pruning**: branches that cannot affect the final decision are cut early, allowing deeper search within the same time budget.
- **Iterative deepening**: the engine searches depth 1, then depth 2, and so on, so it always has a valid best move when the 4-second limit expires.
- **Transposition table**: previously searched positions are cached during a move search, reducing repeated work when the same position is reached through different move orders.
- **Move ordering, killer moves, and history heuristic**: likely strong moves are searched first, which improves Alpha-Beta pruning efficiency.
- **Exact endgame search**: when few empty squares remain, the engine searches directly to the end of the game instead of relying on heuristics.
- **Stability-aware evaluation**: stable discs, corners, mobility, frontier discs, parity, and terminal disc count are evaluated to improve late-game decisions.
- **Web Worker parallelism**: root moves are split across Workers using about 90% of available CPU threads, keeping the UI responsive while the AI searches.

## Why coi-serviceworker.js Is Needed

SharedArrayBuffer and Wasm threading require the page to be `crossOriginIsolated`. A normal server can set:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

GitHub Pages cannot configure custom response headers directly, so this project uses `coi-serviceworker.js` to add the required headers from the client side through a Service Worker.

## GitHub Pages Deployment

This repository includes a GitHub Actions workflow:

```text
.github/workflows/pages.yml
```

On push to `main` or `master`, the workflow:

1. Installs Rust.
2. Installs `wasm-bindgen-cli`.
3. Builds `rust-ai` for `wasm32`.
4. Generates browser-loadable files in `assets/wasm/`.
5. Uploads the static site artifact.
6. Deploys to GitHub Pages.

The workflow can also be triggered manually from the GitHub Actions page.

GitHub Pages only serves static files. All AI computation runs locally in the visitor's browser and CPU.
