# Rust/Wasm AI engine

`rust-ai/` is the Othello AI search core. It does not handle DOM, animation, or menus. It receives a board state, computes one candidate move, and returns search telemetry to JavaScript.

Documentation page:

```text
https://billzi2016.github.io/Othello-AI/docs/en/rust-ai/
```

## Why Rust and Wasm

Othello search repeatedly generates legal moves, applies moves, flips discs, and evaluates positions. Rust is a good fit for this high-frequency computation, and Wasm lets the browser run it locally without a backend service.

In this project, Rust produces two browser files:

```text
assets/wasm/othello_ai.js
assets/wasm/othello_ai_bg.wasm
```

`assets/js/ai-worker.js` loads the JS binding file and calls the exported `search_best_move()`.

## Input

`search_best_move()` is defined in `src/lib.rs`:

```rust
pub fn search_best_move(
    cells: &[i8],
    is_black_turn: bool,
    think_time_ms: u32,
    allowed_moves: &[u8],
) -> String
```

Parameters:

- `cells`: a 64-item board array. `-1` is black, `1` is white, and `0` is empty.
- `is_black_turn`: whether black is the side to move.
- `think_time_ms`: the search budget for this call. The browser passes 4000 milliseconds by default.
- `allowed_moves`: the root moves assigned to the current Worker, encoded as `[row, col, row, col]`.

Rust converts `cells` into two `u64` bitboards. The bit index is `row * 8 + col`, so UI, JavaScript, and Rust use the same coordinate system.

## Output

The function returns a CSV string:

```text
row,col,score,depth,nodes,elapsed_ms,nps
```

Fields:

- `row` and `col`: the move selected by the AI.
- `score`: score from the root AI perspective. Larger is better.
- `depth`: maximum completed search depth.
- `nodes`: number of visited search nodes.
- `elapsed_ms`: actual elapsed time.
- `nps`: nodes searched per second.

If there is no legal move, the function returns:

```text
-1,-1,0,0,0,0,0
```

## How search works

The engine uses NegaMax-style Alpha-Beta search. NegaMax writes both sides with one recursive scoring rule, negating the score when the side changes. Alpha-Beta stops searching branches that cannot change the final choice, which allows deeper search in the same time budget.

Iterative deepening starts shallow and increases depth one level at a time. If the 4-second budget expires, the function can still return the best result from a completed depth.

When the number of empty squares is at or below `EXACT_ENDGAME_EMPTY`, the engine switches to exact endgame search and searches until both sides have no legal moves. At that point it does not rely on the evaluation function to guess the result.

## Expected result

A normal search result should have:

- `row` and `col` matching one of the legal root moves.
- `depth` greater than 0.
- `nodes` greater than 0.
- `elapsed_ms` below or close to the given time budget.
- Higher depth near the endgame because fewer empty squares remain.

If `depth` stays at 0, check whether `allowed_moves` is empty. If a Worker reports Wasm initialization failure, check that the generated files exist in `assets/wasm/`.
