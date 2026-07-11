# Othello AI algorithm deep dive

This page explains how the project turns a browser board into an AI move. It starts with board representation and goes through search, pruning, evaluation, exact endgame search, and telemetry. After reading it, you should be able to connect the numbers in the search panel to the code path in `rust-ai/src/lib.rs`.

## Start with one complete input and output

The browser calls the Rust entry point `search_best_move()`. The function does not read the HTML board directly. It receives four values:

```rust
pub fn search_best_move(
    cells: &[i8],
    is_black_turn: bool,
    think_time_ms: u32,
    allowed_moves: &[u8],
) -> String
```

`cells` is a 64-item array. Black is `-1`, white is `1`, and empty is `0`. The array index is the board square:

```text
index = row * 8 + col
```

The top-left corner is `0`, the top-right corner is `7`, the bottom-left corner is `56`, and the bottom-right corner is `63`. For example, `row = 2, col = 3` maps to index `19`.

`allowed_moves` is the root move shard assigned to the current Worker. It is encoded as `[row, col, row, col]`. If a Worker owns `(2, 3)` and `(4, 5)`, it receives:

```text
[2, 3, 4, 5]
```

Rust returns a CSV string:

```text
row,col,score,depth,nodes,elapsed_ms,nps
```

Example:

```text
2,3,18,8,125000,3970,31486
```

That means the AI chose `(2, 3)`, scored it as `18`, completed depth 8, visited 125000 nodes, spent 3970 milliseconds, and searched about 31486 nodes per second. In a normal result, `row,col` must be a legal move, and `depth` plus `nodes` should be greater than 0.

## Walk through the starting position

The standard Othello start has only four center squares occupied. In this project's coordinates, a common starting board is:

```text
row 3, col 3: white
row 3, col 4: black
row 4, col 3: black
row 4, col 4: white
```

As one-dimensional indices:

```text
3 * 8 + 3 = 27  white
3 * 8 + 4 = 28  black
4 * 8 + 3 = 35  black
4 * 8 + 4 = 36  white
```

If black moves first, the usual legal moves are:

```text
(2, 3), (3, 2), (4, 5), (5, 4)
```

Take `(2, 3)`. Its index is `19`. Scanning downward from `19` sees white at `27`, then black at `35`, so `27` flips to black. The flip mask contains `1 << 27`.

After the move:

```text
19 changes from empty to black
27 changes from white to black
28 and 35 stay black
36 stays white
```

The search does not immediately decide that this move is best. It passes the new position to the next layer and lets white choose a reply. Each white reply creates another position. Deeper search is what lets the AI see cases where a move flips many discs now but gives away a corner later.

This example checks that three functions connect correctly:

- `flips_for_move()` for `(2, 3)` should return a mask containing `27`.
- `apply_move()` should make both `19` and `27` black.
- `negamax()` should continue with white to move, not let black move twice.

## Why the board becomes bitboards

The page and JavaScript use arrays because arrays are easy to inspect. The search engine needs to copy positions, find legal moves, apply moves, and flip discs many times. Doing that with an 8x8 array works, but every node carries more scanning and copying.

The engine converts the board into two `u64` values:

```rust
struct Board {
    black: u64,
    white: u64,
}
```

A `u64` has 64 bits, exactly one bit per board square. If a bit is 1, that color occupies the square. One `u64` for black and one for white represent the full board.

If black owns the top-left corner `(0, 0)`, index `0` is set:

```text
black |= 1 << 0
```

If white owns `(3, 4)`, index `28` is set:

```text
white |= 1 << 28
```

To check whether a square is occupied:

```text
occupied = black | white
occupied & (1 << idx) != 0
```

The input is the `cells` array. The output is `Board { black, white }`. A normal board has every occupied square in exactly one color bitboard, never both.

## How legal moves are generated

An Othello move is legal only if it brackets at least one opponent disc in one of eight directions:

```text
up-left, up, up-right, right, down-right, down, down-left, left
```

The code scans all 64 squares. Occupied squares are skipped. For each empty square, `flips_for_move()` checks which discs would flip.

For black to move, one direction is checked like this:

1. Step one square away from the candidate move.
2. If the first seen discs are white, collect them in a temporary mask.
3. Continue until the scan reaches a black disc, an empty square, or the board edge.
4. If the scan reaches a black disc and saw at least one white disc first, that line flips.
5. If the scan reaches an empty square or the edge first, that direction contributes nothing.

`flips_for_move()` returns a bit mask. Bits set to 1 are the discs that would flip. If the mask is 0, the move is not legal.

Small example:

```text
line segment: black white white empty
indices:      10    11    12    13
```

If black plays at `13`, scanning left sees white at `12`, white at `11`, and black at `10`. The move flips `11` and `12`, so the output mask contains `1 << 11` and `1 << 12`.

## How a move updates the board

After the flip mask is known, `apply_move()` creates the next board. For a black move:

```text
new_black = old_black | flips | move_bit
new_white = old_white & !flips
```

The move square and flipped discs become black, and the flipped discs are removed from white. White moves use the same idea with the colors reversed.

The input is the old `Board`, the move index, and the side to move. The output is a new `Board`. A normal update has these properties:

- The move square changes from empty to the current color.
- Every bit in `flips` changes color.
- Other discs stay unchanged.
- Black and white bitboards do not overlap.

## What the search tree is

The AI does not only count how many discs the next move flips. It assumes both sides will keep choosing strong moves, then estimates the long-term result of each candidate move.

If black has 4 legal moves, the first search layer has 4 branches. After black chooses one, white moves. White may have several replies, so each black branch expands into white branches. Repeating that process creates a tree.

Search depth `1` means the AI only looks at its current move. Depth `2` means AI move plus opponent reply. Depth `8` means 8 plies, where a ply is one side's move.

The input is the current position and side to move. The output is not the whole tree. It is a score for a root candidate move. The `nodes` number in the side panel is how many tree nodes the search actually visited.

## Why NegaMax simplifies Minimax

Traditional Minimax usually has two code paths: maximize on the AI turn and minimize on the opponent turn. NegaMax uses a simple fact: a good score for the opponent is a bad score for me.

The recursive rule becomes:

```text
score for current side = - best score the opponent can get after this move
```

This line is the core:

```rust
let score = -negamax(next, next_depth, -beta, -alpha, !black_turn, ply + 1, ctx);
```

The next layer changes the side to move and swaps the alpha-beta window with negated signs. When it returns, the caller negates the result back into the current side's view.

Why does the code track both `root_black` and `black_turn`? `root_black` says whether the AI that started this search is black. It stays fixed. `black_turn` says whose turn the current recursive layer represents. It changes every ply.

A normal terminal score follows the root AI. If the root AI wins, `terminal_score()` should be strongly positive. If it loses, it should be strongly negative. NegaMax keeps that direction consistent by negating when the side changes.

## What Alpha-Beta pruning cuts

Alpha-Beta pruning does not change the Minimax answer. It skips branches that can no longer affect the final choice.

Think of `alpha` as the best lower bound the current side can already guarantee. Think of `beta` as the upper bound the opponent will allow. When the search reaches:

```text
alpha >= beta
```

the remaining sibling branches cannot change the decision, so the search can stop there.

Simplified example:

```text
Black has moves A and B.
After searching A, black knows it can get at least 20.
Now search B. White has replies B1, B2, B3.
After B1, white can hold black to 5.
```

Black already has 20 from A, so it will not choose B if white can make B worth only 5. B2 and B3 do not need to be searched. Skipping them does not change the root move.

Pruning depends heavily on move order. If strong moves are searched first, alpha and beta tighten earlier, and later branches are easier to cut.

## How move ordering helps pruning

`order_moves()` changes search order only. It does not directly change the final evaluation. The project assigns each candidate an ordering score:

```text
TT best move + killer move + history score + corner bonus + square weight + flip count
```

Each signal has a specific job:

- TT best move: a transposition table entry already found a likely best move for this position.
- Killer move: a move caused pruning at the same depth before and may work again in a similar branch.
- History score: a move that often causes pruning gets a long-running ordering boost.
- Corner bonus: corners are usually permanent and are searched early.
- Square weight: static board weights provide a basic direction in shallow searches.
- Flip count: used only as an ordering hint, not as the final measure of move quality.

When ordering works well, the same depth should require fewer nodes, or the same time budget should reach a higher depth.

## What the transposition table caches

The same position can be reached through different move orders. The transposition table keys a search state by:

```text
black bitboard + white bitboard + side to move
```

The value stores:

```text
depth, score, flag, best_move
```

`depth` says how deep the cached search went. `score` is the result. `best_move` helps future ordering. `flag` has three cases:

- `TT_EXACT`: the score is exact for this search window.
- `TT_LOWER`: the true score is at least this value.
- `TT_UPPER`: the true score is at most this value.

Why bounds? Alpha-Beta sometimes cuts off before every sibling is searched. That partial result still helps because it can tighten alpha or beta in a later visit.

The input is a board plus side to move. The output may be an immediate score, or only a `best_move` used for ordering. A healthy transposition table reduces repeated work when move orders converge to the same board.

## What the evaluation function measures

Midgame positions usually cannot be searched to the end within 4 seconds, so depth-0 leaves need an estimate. `evaluate()` combines these terms:

```text
positional
+ mobility
+ corners
- frontier
+ material
+ parity
- danger
+ stable
```

Each term has a concrete meaning.

`positional` comes from a 64-square weight table. Corners are strongly positive. X and C squares near empty corners are often negative. This keeps shallow search from caring only about immediate flips.

`mobility` compares legal move counts. More legal moves means more choices and more ways to force the opponent into bad moves.

`corners` gives extra weight to occupied corners. A corner cannot be flipped, so it is more reliable than an ordinary edge disc.

`frontier` counts discs touching empty squares. Frontier discs are easier for the opponent to attack, so having many of them is usually risky.

`material` is the current disc count difference. It matters, but it cannot dominate the midgame because Othello often rewards being temporarily behind in disc count.

`parity` activates when few empty squares remain. Endgames often depend on who gets the last move in a region.

`danger` penalizes X and C squares beside an empty corner. Playing next to an empty corner can give that corner away.

`stable` estimates discs that are unlikely to be flipped. This is closer to lasting advantage than raw disc count.

Evaluation should not be judged from one term alone. A move that flips many discs but gives away a corner should usually receive a worse combined score.

## How stable discs are estimated

Full stable-disc proof is complex. This project uses a conservative approximation. It prefers undercounting stable discs over calling unstable center discs stable.

The first layer is stable edges. Starting from an occupied corner, any continuous same-color edge discs are stable. If the chain breaks, later edge discs are not counted.

The second layer expands from corner regions. For each occupied corner, a same-color disc can join the stable set if it is supported from the corner direction. The code requires support from row, column, and diagonal directions through existing stable discs or board edges.

The input is the current `Board`. The output is a stable-disc bit mask. The score is the stable black count minus stable white count, or the reverse if the root AI is white.

Expected behavior: after a side takes a corner, continuous edge discs from that corner increase stable score. Temporary center discs should not increase it easily.

## Why exact endgame search is different

When empty squares are at or below `EXACT_ENDGAME_EMPTY`, currently 14, the engine switches to endgame mode. It tries to search until neither side has a legal move instead of using the midgame evaluation.

The reason is direct: with few empty squares, the tree is small enough to compute the real outcome. A heuristic can say a position looks good while the final disc count loses by one.

The terminal score uses a large win-loss term:

```text
diff.signum() * 10_000_000 + diff * 10_000
```

`diff` is the final disc difference for the root AI. Winning by 1 disc is more important than any midgame positional score. After the win-loss result is protected, the disc margin still matters.

## How the time budget is controlled

The browser passes 4000 milliseconds per move by default. Rust subtracts a small margin:

```text
budget = think_time_ms - 30ms
```

That leaves room for message passing and UI updates instead of stopping exactly on the visible limit.

Iterative deepening searches depth 1, then 2, then 3, and so on. After each completed depth, the best result is saved. If the search times out inside the next depth, the function returns the last completed result.

In a normal run, `elapsed_ms` is near but not far above 4000. Early positions have many branches and may complete lower depth. Endgames have fewer empty squares and may complete much deeper search.

## How Worker parallelism changes search

JavaScript splits legal root moves across Workers. Each Worker searches only its assigned move set. After all Workers return, `ai-manager.js` chooses the result with the highest `score`.

This is root-move sharding. It is not a shared-memory parallel search over one tree. The advantage is simpler browser behavior: each Worker loads Wasm independently and does not need `SharedArrayBuffer`.

The input to each Worker is the full board and that Worker's `allowed_moves`. The output is the best move inside that shard. The main thread merges shard results.

Expected behavior: `workerCount` should not exceed the legal move count. Node counts from Workers are summed into the final telemetry. More CPU cores help most when there are enough root moves to distribute.

## How to read the search panel

The side panel is useful for checking whether the algorithm is working.

`Depth` is the maximum completed search depth. Higher depth means the AI looked farther ahead, but depth across positions is not directly comparable. A position with fewer legal moves is easier to search deeply.

`Nodes` is the number of visited positions. More nodes is not automatically better. Better ordering and pruning can reach the same depth with fewer nodes.

`NPS` is nodes per second. It depends on hardware, browser, Wasm performance, and position shape. It is most useful when comparing versions on the same machine.

`Elapsed time` should be close to the time budget. If it is very short, the position may have few legal moves, the endgame may have been fully solved, or a Worker may have failed early.

`Score` is from the current AI perspective. Positive means the search likes the move for the AI. Negative means it dislikes it. Near the endgame, a score in the millions usually means the search reached a real win or loss.

## Trace one search in code

Read one AI search in this order:

1. `search_best_move()` receives JavaScript input.
2. `board_from_cells()` converts the 64-cell array into two bitboards.
3. `decode_allowed_moves()` decodes and validates the Worker move shard.
4. The outer `for depth in 1..=MAX_DEPTH` loop performs iterative deepening.
5. The root loop calls `apply_move()` for each candidate move.
6. `negamax()` recursively searches opponent replies.
7. `legal_moves()` and `flips_for_move()` generate legal continuations.
8. `order_moves()` sorts by cache data, killer moves, history, corners, and square weights.
9. `evaluate()` scores midgame leaf nodes.
10. `terminal_score()` scores real endgame results.
11. The function formats `row,col,score,depth,nodes,elapsed_ms,nps`.

To debug an odd move, record the input board, side to move, and legal moves. First check that the returned `row,col` is in the legal set. Then check `depth`, `nodes`, and `elapsed_ms`. Those three numbers usually separate "search did not start", "search ran but stayed shallow", "search finished quickly", and "search used the expected time budget".
