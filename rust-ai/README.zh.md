# Rust/Wasm AI 引擎

`rust-ai/` 是黑白棋 AI 的搜索核心。它不处理 DOM、动画或菜单，只接收棋盘状态，计算一个候选落子，再把搜索统计返回给 JavaScript。

文档站对应页面：

```text
https://billzi2016.github.io/Othello-AI/docs/rust-ai/
```

## 为什么用 Rust 和 Wasm

黑白棋搜索会反复生成合法步、落子、翻子和评估局面。Rust 适合写这种高频计算代码，编译成 Wasm 后可以在浏览器本地运行，不需要后端服务。

在本项目里，Rust 输出两个浏览器文件：

```text
assets/wasm/othello_ai.js
assets/wasm/othello_ai_bg.wasm
```

`assets/js/ai-worker.js` 加载 JS 绑定文件，再调用导出的 `search_best_move()`。

## 输入

`search_best_move()` 的签名在 `src/lib.rs` 中：

```rust
pub fn search_best_move(
    cells: &[i8],
    is_black_turn: bool,
    think_time_ms: u32,
    allowed_moves: &[u8],
) -> String
```

参数含义：

- `cells`：长度为 64 的棋盘数组。`-1` 表示黑棋，`1` 表示白棋，`0` 表示空格。
- `is_black_turn`：当前是否黑棋行动。
- `think_time_ms`：本次搜索的时间预算，浏览器默认传入 4000 毫秒。
- `allowed_moves`：当前 Worker 分到的根节点候选步，按 `[row, col, row, col]` 编码。

Rust 会把 `cells` 转成两个 `u64` Bitboard。bit 下标使用 `row * 8 + col`，这样 UI、JavaScript 和 Rust 使用同一套坐标。

## 输出

函数返回 CSV 字符串：

```text
row,col,score,depth,nodes,elapsed_ms,nps
```

字段含义：

- `row` 和 `col`：AI 选择的落子位置。
- `score`：从根节点 AI 视角看的分数，越大越好。
- `depth`：本次完成的最大搜索深度。
- `nodes`：搜索访问的节点数。
- `elapsed_ms`：实际耗时。
- `nps`：每秒搜索节点数。

如果没有合法步，函数返回：

```text
-1,-1,0,0,0,0,0
```

## 搜索怎样工作

引擎使用 NegaMax 形式的 Alpha-Beta 搜索。NegaMax 把黑白双方的最大化和最小化写成同一套递归逻辑，换边时取负分。Alpha-Beta 会提前剪掉不会改变最终选择的分支，让同样时间内搜索更深。

迭代加深从浅层开始，一层一层增加深度。这样即使 4 秒时间到，函数也能返回已经完成的最佳结果。

当空格数不超过 `EXACT_ENDGAME_EMPTY` 时，引擎会进入终局完全搜索，直接搜索到双方都无棋可走。这个阶段不再依赖评估函数猜结果。

## 怎样判断结果正常

正常搜索结果应该满足：

- `row` 和 `col` 是当前合法步之一。
- `depth` 大于 0。
- `nodes` 大于 0。
- `elapsed_ms` 通常小于或接近传入的时间预算。
- 局面接近终局时，搜索深度可能快速增加，因为剩余空格变少。

如果 `depth` 一直是 0，先检查 `allowed_moves` 是否为空。如果 Worker 报 Wasm 初始化失败，检查 `assets/wasm/` 中的生成文件是否存在。
