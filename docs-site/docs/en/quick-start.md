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
