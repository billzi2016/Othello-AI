# JavaScript 运行层

`assets/js/` 负责浏览器里的游戏流程和 AI 调度。真正的 AI 搜索在 Rust/Wasm 中执行，JavaScript 负责把棋盘状态整理成搜索输入，并把搜索结果应用回页面。

文档站对应页面：

```text
https://billzi2016.github.io/Othello-AI/docs/javascript/
```

## 文件职责

```text
main.js           UI、规则、动画、模式切换和统计面板
ai-manager.js     Worker 池，根节点合法步分片，结果合并
ai-worker.js      单个 Worker，加载 Wasm 并调用 search_best_move()
jquery-3.6.0.min.js
jquery.flip.min.js
```

`main.js` 是页面主流程。它知道当前棋盘、当前轮到谁、哪些位置能落子，以及游戏是否结束。

`ai-manager.js` 不直接算棋。它创建约 90% CPU 数量的 Worker，把合法根节点按轮转方式分片，再等待所有 Worker 返回。

`ai-worker.js` 不接触 DOM。它加载 `assets/wasm/othello_ai.js`，收到搜索请求后调用 Rust 导出的函数。

## 输入

AI 搜索入口是 `OthelloAIManager.findBestMove()`。输入对象包含：

```js
{
  board,
  isBlackTurn,
  legalMoves
}
```

- `board`：8x8 二维数组。`-1` 是黑棋，`1` 是白棋，`0` 是空格。
- `isBlackTurn`：当前是否黑棋行动。
- `legalMoves`：当前所有合法步，形如 `[[row, col], ...]`。

管理器会把 `board` 压成长度 64 的 `Int8Array`，再把 `legalMoves` 编码成 Worker 可传递的 `Uint8Array`。

## 输出

`findBestMove()` 返回一个 Promise。成功时结果类似：

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

`r` 和 `c` 是落子位置。`score` 是 Rust 从 AI 视角计算的分数。`nodes`、`timeMs` 和 `nps` 用于右侧搜索评分表。

没有合法步时，返回 `null`。

## 怎样判断结果正常

正常情况下，AI 思考期间页面不会卡死。Worker 返回后，`main.js` 会落子、翻子，并在统计表增加一行。

如果 Promise reject，说明 Worker 或 Wasm 出错。常见原因是通过 `file://` 打开页面、Wasm 文件缺失、浏览器阻止模块加载，或 `search_best_move()` 返回格式不符合预期。
