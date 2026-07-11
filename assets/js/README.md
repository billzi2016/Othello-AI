# JavaScript runtime

`assets/js/` owns the browser game flow and AI scheduling. The actual AI search runs in Rust/Wasm. JavaScript prepares the board state as search input and applies the returned move back to the page.

Documentation page:

```text
https://billzi2016.github.io/Othello-AI/docs/en/javascript/
```

## File roles

```text
main.js           UI, rules, animation, mode switching, and telemetry panel
ai-manager.js     Worker pool, root move sharding, and result merging
ai-worker.js      Single Worker entry that loads Wasm and calls search_best_move()
jquery-3.6.0.min.js
jquery.flip.min.js
```

`main.js` is the page flow. It tracks the board, the side to move, legal moves, and game end state.

`ai-manager.js` does not search directly. It creates about 90% of the local CPU count as Workers, distributes legal root moves in round-robin order, and waits for all Workers to return.

`ai-worker.js` does not touch the DOM. It loads `assets/wasm/othello_ai.js` and calls the Rust export when it receives a search request.

## Input

The AI entry point is `OthelloAIManager.findBestMove()`. The input object contains:

```js
{
  board,
  isBlackTurn,
  legalMoves
}
```

- `board`: an 8x8 array. `-1` is black, `1` is white, and `0` is empty.
- `isBlackTurn`: whether black is the side to move.
- `legalMoves`: all legal moves, shaped as `[[row, col], ...]`.

The manager flattens `board` into a 64-item `Int8Array` and encodes `legalMoves` as a transferable `Uint8Array` for Workers.

## Output

`findBestMove()` returns a Promise. A successful result looks like:

```js
{
  r: 2,
  c: 3,
  score: 18,
  depth: 8,
  nodes: 125000,
  timeMs: 3970,
  nps: 31486,
  workerCount: 6
}
```

`r` and `c` are the selected move. `score` is the Rust score from the AI perspective. `nodes`, `timeMs`, and `nps` feed the search statistics table.

If there is no legal move, the function returns `null`.

## Expected result

During AI thinking, the page should not freeze. After Workers return, `main.js` places the disc, flips captured discs, and adds one row to the telemetry table.

If the Promise rejects, Worker or Wasm execution failed. Common causes are opening the page through `file://`, missing Wasm files, browser module loading restrictions, or a `search_best_move()` return string that does not match the expected format.
