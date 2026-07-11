# 项目结构

项目根目录是一个静态浏览器游戏。Rust 子工程只负责生成 Wasm，最终发布物仍然是 HTML、CSS、JavaScript 和 Wasm 文件。

```text
index.html                  页面入口和菜单
coi-serviceworker.js        为静态托管补充跨源隔离响应头
assets/css/                 棋盘、棋子和页面样式
assets/js/main.js           UI、规则、动画和对局流程
assets/js/ai-manager.js     Worker 池和根节点分片
assets/js/ai-worker.js      单个 Worker 的 Wasm 调用入口
assets/wasm/                wasm-bindgen 生成的浏览器文件
rust-ai/                    Rust/Wasm AI 引擎源码
server.py                   本地 HTTP 静态服务器
docs-site/                  MkDocs 文档站源码
.github/workflows/pages.yml GitHub Pages 构建和部署流程
```

## 输入和输出流向

玩家或 AI 落子后，`main.js` 更新棋盘数组。轮到 AI 时，`ai-manager.js` 把 8x8 棋盘压成长度为 64 的 `Int8Array`，再把根节点合法步拆给多个 Worker。

每个 Worker 调用 Rust 导出的 `search_best_move()`。Rust 返回一段 CSV 字符串，Worker 解析成对象后交回主线程。主线程从所有 Worker 的结果里选择分数最高的落子，并把统计信息写入右侧表格。

更细地看，一次 AI 落子会经过这些文件：

1. `main.js` 保存当前 8x8 棋盘，并算出当前颜色的合法步。
2. `ai-manager.js` 把棋盘压成 64 格数组，把合法步分片。
3. `ai-worker.js` 在后台线程中接收分片，确保 Wasm 已初始化。
4. `assets/wasm/othello_ai.js` 加载 `.wasm`，暴露 Rust 函数。
5. `rust-ai/src/lib.rs` 搜索分片里的最佳走法。
6. `ai-worker.js` 把 CSV 结果转成 JS 对象。
7. `ai-manager.js` 合并所有 Worker 结果，选择最高分。
8. `main.js` 落子、翻子、更新搜索评分表。

这条链路里，每一层的输入输出都比较小。页面层传棋盘和合法步，Worker 层传分片，Rust 层返回分数和统计数据。这样出错时可以按层排查，而不是把所有问题都归到“AI 不动”。

## 哪些文件可以手改

`assets/js/main.js`、`assets/js/ai-manager.js`、`assets/js/ai-worker.js` 和 `rust-ai/src/lib.rs` 是源码，可以按需求修改。

`assets/wasm/othello_ai.js` 和 `assets/wasm/othello_ai_bg.wasm` 是构建产物。修改 Rust 后不要直接手改这两个文件，应重新运行 Wasm 构建命令生成它们。

`docs-site/site/` 是 MkDocs 本地构建产物，已经被 `.gitignore` 忽略。文档源码在 `docs-site/docs/`，站点配置在 `docs-site/mkdocs.yml`。

## 判断结构是否完整

一次完整构建后，至少应存在这些文件：

```text
index.html
coi-serviceworker.js
assets/js/main.js
assets/js/ai-manager.js
assets/js/ai-worker.js
assets/wasm/othello_ai.js
assets/wasm/othello_ai_bg.wasm
```

缺少 JS 文件时，页面交互会失败。缺少 Wasm 文件时，普通棋盘可能还能显示，但 AI 模式不能正常搜索。
