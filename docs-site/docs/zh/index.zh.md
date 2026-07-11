# 黑白棋 AI 文档

这个文档站说明项目怎样在浏览器里运行黑白棋 AI。主网站仍然部署在 GitHub Pages 根路径，文档站部署在 `/docs/` 子路径。

项目由三层组成：

- 页面层：`index.html`、CSS 和 `assets/js/main.js` 负责棋盘、菜单、动画和规则流程。
- 调度层：`assets/js/ai-manager.js` 和 `assets/js/ai-worker.js` 把 AI 搜索放进 Web Worker，避免主线程卡住。
- 引擎层：`rust-ai/src/lib.rs` 用 Rust 实现搜索，再编译成 `assets/wasm/` 中的浏览器 Wasm 文件。

读者可以按这个顺序阅读：

1. 先看快速开始，确认本地 HTTP 服务能打开页面。
2. 再看 JavaScript 运行层，理解浏览器怎样把棋盘传给 Worker。
3. 然后看 Rust AI 引擎，理解搜索函数的输入、输出和正常结果。
4. 最后看部署说明，确认游戏网站和文档站怎样一起发布到 GitHub Pages。

正常运行时，页面会显示 8x8 棋盘。进入人机或机机模式后，AI 每步最多思考 4 秒，右侧表格会记录落子、搜索深度、节点数、NPS、耗时和分数。如果表格持续为空，通常说明 Worker 或 Wasm 没有加载成功。
