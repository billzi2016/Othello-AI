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
