# Quick start

Do not open `index.html` with `file://`. Browsers restrict Web Workers, ES modules, Wasm, and Service Workers in that mode, so the project includes `server.py` for local HTTP serving.

## Run locally

From the repository root:

```bash
python3 server.py
```

The server chooses a free port between `8100` and `8999`, then prints a URL such as:

```text
http://127.0.0.1:8342/
```

Open that URL. A working page shows the Othello board and the start menu. The page may reload once on the first visit because `coi-serviceworker.js` takes control of the page.

To confirm that you opened the right entry point, check the browser address bar. It should start with `http://127.0.0.1:`, not `file://`. A `file://` page can display HTML, but it does not provide the full browser site environment needed by Workers and Wasm.

## What to check first

After the page loads, do not start by judging AI strength. First confirm that the runtime chain works:

1. The board and the start button should appear in the center of the page.
2. Clicking start should open the mode menu.
3. In local two-player mode, clicking a legal square should place a disc and flip captured discs.
4. In human-vs-AI or AI-vs-AI mode, the first AI move initializes Workers and Wasm.
5. After an AI move, the side table should show depth, nodes, NPS, elapsed time, and score.

If the first three steps work but AI modes fail, the problem is usually not the board UI. Check Worker or Wasm loading first.

## Choose a mode

The game has three modes:

- Local two-player: two people take turns in the same browser.
- Human vs AI: the player faces the AI and can choose who moves first.
- AI vs AI: both sides are controlled by the AI, useful for watching search behavior.

Human-vs-AI and AI-vs-AI modes load `assets/wasm/othello_ai.js`. If the Wasm files are missing, the AI cannot return a move, and the browser console usually shows a module loading error.

## Expected result

A normal run has these signs:

- The board accepts legal moves.
- Legal AI moves are highlighted in yellow while the AI is thinking.
- The search statistics table gains one row after each AI move.
- Depth, node count, elapsed time, and NPS are present in the table.

If the page opens but the AI does not move, first confirm that you opened the HTTP URL. Then check that `assets/wasm/othello_ai.js` and `assets/wasm/othello_ai_bg.wasm` exist.

## Common failure signs

If the page is blank, open the browser console first. Common causes are wrong static file paths or scripts that failed to load. A normal page loads at least `assets/js/main.js`, `assets/js/ai-manager.js`, and the CSS files.

If local two-player mode works but the AI does not move, look for a 404 involving `othello_ai.js` or `.wasm`. `othello_ai.js` is the JavaScript binding file, and `.wasm` is the compiled Rust engine. Both are required.

If the AI moves but the telemetry table shows very low `nodes` or `depth` stays at 0, search did not expand normally. The usual causes are an empty legal-move list sent to Rust or a mismatch between the Worker board state and the page board state.

If the page reloads once after the first visit, no action is needed. That is the normal Service Worker registration path. Continue from the mode menu after the reload.
