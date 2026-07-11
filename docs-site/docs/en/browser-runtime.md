# Browser runtime

AI search runs locally in the browser. There is no backend API. That makes the project suitable for GitHub Pages, but the browser environment has to meet a few conditions.

## HTTP serving

Web Workers, ES modules, Wasm, and Service Workers need a stable origin. `file://` is not a normal site origin, so local development should use the HTTP URL printed by `server.py`.

The input is the browser's static file requests. The output is the page, scripts, styles, and Wasm module. A normal result has no module loading errors in the browser console, and AI modes can start Workers.

## Web Workers

The main thread owns the UI. If it searched for 4 seconds directly, board animation and clicks would freeze. The project sends search work to multiple Workers, and each Worker handles only its assigned root moves.

A normal result is that the page still updates while the AI is thinking, and the side panel shows the current AI search state.

## Cross-origin isolation

`coi-serviceworker.js` adds COOP and COEP headers for same-origin resources. The current parallel model does not require Wasm pthreads, but cross-origin isolation makes static hosting closer to a production browser setup and leaves room for future `SharedArrayBuffer` use.

If the page reloads after the Service Worker is first registered, that is expected. After the reload, the page is controlled by the Service Worker, and same-origin resources include the isolation headers.
