# Engineering algorithm

This page documents the algorithm as the project currently runs it. It maps directly to `rust-ai/src/lib.rs`, with `search_best_move()` as the entry point.

## Actual move flow

For each AI move, the browser does not send a search tree to Rust. It sends:

```text
cells           64 board cells, -1 black, 1 white, 0 empty
is_black_turn   whether black is the side to move
think_time_ms   4000 milliseconds by default
allowed_moves   root move shard assigned to the current Worker
```

Rust handles that input in this order:

1. `board_from_cells()` converts 64 cells into two `u64` bitboards.
2. `decode_allowed_moves()` decodes the Worker move shard and validates the moves again.
3. The outer loop starts iterative deepening at depth 1.
4. Each root candidate calls `apply_move()` to produce a child board.
5. `negamax()` recursively searches opponent replies.
6. Depth-0 midgame leaves are scored by `evaluate()`.
7. Positions with at most 14 empty squares use exact endgame search.
8. The return string is `row,col,score,depth,nodes,elapsed_ms,nps`.

The basic check is direct: returned `row,col` must be in `allowed_moves`, `depth` and `nodes` should be greater than 0, and `elapsed_ms` should usually be near 4 seconds without greatly exceeding it.

## Square weight table

`SQUARE_WEIGHTS` is an 8x8 table flattened by `row * 8 + col`. It is one evaluation input, not the final score. `positional_score()` multiplies it by 10.

```text
 120  -40   20    5    5   20  -40  120
 -40  -80   -5   -5   -5   -5  -80  -40
  20   -5   15    3    3   15   -5   20
   5   -5    3    3    3    3   -5    5
   5   -5    3    3    3    3   -5    5
  20   -5   15    3    3   15   -5   20
 -40  -80   -5   -5   -5   -5  -80  -40
 120  -40   20    5    5   20  -40  120
```

Read the table by square type:

- Corners are `120`. A taken corner cannot be flipped, so it has the highest base value.
- Diagonal squares beside empty corners are `-80`. These X squares often give the corner away.
- Edge-adjacent squares beside corners are `-40`. These C squares can also give access to a corner.
- Safer edge squares are `20`, and inner stable-looking squares are `15` or `3`.

If black takes the top-left corner `(0, 0)`, the positional term starts at `120`, then becomes `120 * 10 = 1200`. If black plays `(1, 1)`, the positional term is `-80 * 10 = -800`. That is why the AI does not blindly prefer moves that flip more discs next to an empty corner.

## Midgame evaluation formula

The current `evaluate()` formula is:

```text
positional + mobility + corners - frontier + material + parity - danger + stable
```

Actual weights:

```text
material   = AI disc-count difference * 12
positional = square table score * 10
mobility   = legal-move count difference * 90
corners    = corner ownership difference * 800
frontier   = frontier-disc difference * 18, subtracted from total
parity     = parity value * 55
danger     = empty-corner danger difference * 220, subtracted from total
stable     = stable-disc difference * 140
```

Every difference is from the root AI perspective. If the AI is black, black advantage is positive. If the AI is white, white advantage is positive.

Practical readings:

- Current disc count matters, but `material` only has weight `12`.
- Mobility matters more because it has weight `90`.
- One corner is worth `800`, plus the corner's square-table value.
- Frontier discs and empty-corner danger are penalties.
- Stable discs use weight `140`, so they matter more than raw disc count.

## Evaluation example

Assume a leaf position has these values from the AI perspective:

```text
disc-count difference +4
square-table net score +70
legal-move difference +3
corner difference +1
frontier-disc difference +5
parity 0
empty-corner danger difference +1
stable-disc difference +2
```

Apply the weights:

```text
material   = 4 * 12 = 48
positional = 70 * 10 = 700
mobility   = 3 * 90 = 270
corners    = 1 * 800 = 800
frontier   = 5 * 18 = 90, subtracted
parity     = 0 * 55 = 0
danger     = 1 * 220 = 220, subtracted
stable     = 2 * 140 = 280
```

Total:

```text
48 + 700 + 270 + 800 - 90 + 0 - 220 + 280 = 1788
```

This is not a win rate and not a final disc count. It is the leaf estimate used by NegaMax. NegaMax backs up many such leaf estimates to choose the root move.

## Move ordering formula

`move_order_score()` chooses which move to search first. It does not directly choose the final move. The ordering score is:

```text
TT bonus
+ killer bonus
+ history[mv]
+ corner bonus
+ SQUARE_WEIGHTS[mv] * 20
+ flips * 35
```

Concrete values:

```text
TT best move       200000
killer first        80000
killer second       40000
corner              10000
square weight       SQUARE_WEIGHTS[mv] * 20
flip count          flips * 35
```

This shows the engineering choice: search history and corners dominate immediate flip count. A move that flips 6 discs gets only `6 * 35 = 210` ordering points. A corner gets `10000`. That helps Alpha-Beta search important branches earlier.

## Exact endgame search

The endgame threshold is:

```text
EXACT_ENDGAME_EMPTY = 14
```

When at most 14 squares are empty, the engine tries to search to game over. It stops using the midgame evaluation for leaf decisions and uses the real final disc difference:

```text
diff.signum() * 10_000_000 + diff * 10_000
```

`diff` is the final disc difference for the AI. Winning by 1 disc becomes a score in the millions. Losing by 1 disc becomes a large negative score. That prevents the AI from sacrificing a real endgame win for a nicer-looking positional score.

## Time budget

The browser gives each move 4000 milliseconds by default. Rust keeps a small margin:

```text
budget = think_time_ms.saturating_sub(30).max(50)
```

So the default search budget is about 3970 milliseconds, with a minimum of 50 milliseconds. The margin leaves room for Worker messaging, page updates, and animation.

Iterative deepening saves the best move after each completed depth. If the next depth times out halfway through, the AI returns the last fully completed result.

## How to verify it in the side table

The side table shows whether these engineering choices are active:

- `Depth`: completed iterative-deepening depth. Endgames often reach deeper depth because fewer empty squares remain.
- `Nodes`: visited positions. Better ordering and pruning can reduce nodes at the same depth.
- `NPS`: nodes per second. Mostly reflects device speed, browser behavior, and Wasm execution.
- `Elapsed time`: usually close to 3970 to 4000 milliseconds. Very short time can mean the endgame was solved or there were few legal moves.
- `Score`: ordinary midgame scores are normal integers. Scores in the millions usually mean exact win or loss was reached.

If the AI has legal moves but the table does not get a new row, check JavaScript Worker or Wasm loading. If the table gets a row but `depth = 0`, check candidate move encoding or Rust entry validation.
