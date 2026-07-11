# Browser runtime

AI search runs locally in the browser. There is no backend API. That makes the project suitable for GitHub Pages, but the browser environment has to meet a few conditions.

## HTTP serving

Web Workers, ES modules, Wasm, and Service Workers need a stable origin. `file://` is not a normal site origin, so local development should use the HTTP URL printed by `server.py`.

The input is the browser's static file requests. The output is the page, scripts, styles, and Wasm module. A normal result has no module loading errors in the browser console, and AI modes can start Workers.

An origin is the browser's identity for a site. `http://127.0.0.1:8342/` is a clear origin, and the HTML, JavaScript, CSS, and Wasm files all come from the same place. `file://` is only a local file path, and browsers apply stricter limits to it.

The project does not call a backend API. Its inputs are static file requests. The browser first loads `index.html`, then scripts, styles, and Wasm. If one path is wrong, the later steps fail.

## Web Workers

The main thread owns the UI. If it searched for 4 seconds directly, board animation and clicks would freeze. The project sends search work to multiple Workers, and each Worker handles only its assigned root moves.

A normal result is that the page still updates while the AI is thinking, and the side panel shows the current AI search state.

The main thread is the thread that keeps the page responsive. Button clicks, disc animation, and table updates happen there. A Worker is a browser background thread. It cannot edit the DOM directly, but it can run expensive computation.

This project sends each Worker the board array, side to move, that Worker's legal-move shard, and the time budget. The Worker returns a move, score, depth, node count, elapsed time, and NPS. The main thread merges the Worker results instead of searching by itself.

## Cross-origin isolation

`coi-serviceworker.js` adds COOP and COEP headers for same-origin resources. The current parallel model does not require Wasm pthreads, but cross-origin isolation makes static hosting closer to a production browser setup and leaves room for future `SharedArrayBuffer` use.

If the page reloads after the Service Worker is first registered, that is expected. After the reload, the page is controlled by the Service Worker, and same-origin resources include the isolation headers.

A Service Worker is a site-local proxy inside the browser. When the page requests same-origin resources, the Service Worker can intercept the request and add response headers. GitHub Pages does not let this project configure custom headers directly, so this file provides the missing layer for static hosting.

You do not need to memorize every header to check it. The practical signs are: the first visit may reload once, AI modes can start afterward, and the console has no cross-origin isolation, Worker module loading, or Wasm initialization errors.
