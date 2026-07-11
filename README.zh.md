# 黑白棋 AI

这是一个可部署到 GitHub Pages 的浏览器端黑白棋项目。页面保留本机双人、人机对战和机机对战三种模式；人机和机机模式使用 Rust/Wasm AI，在 Web Worker 池中并行搜索。

Rust/Wasm Othello AI running entirely in the browser with Bitboards, alpha-beta search, and worker-based parallelism.
The engine includes exact endgame search and stability-aware evaluation for stronger late-game decisions.

在线体验：

```text
https://billzi2016.github.io/Othello-AI/
```

文档站：

```text
https://billzi2016.github.io/Othello-AI/docs/
```

算法深入说明：

```text
https://billzi2016.github.io/Othello-AI/docs/algorithm-deep-dive.zh/
```

## 当前目标

- 使用 Rust 实现黑白棋 AI 底层搜索。
- 使用两个 `u64` Bitboard 表示黑白棋局面。
- 使用 Alpha-Beta / NegaMax 剪枝和迭代加深。
- 后期空格较少时启用终局完全搜索。
- 使用稳定子评估区分临时子数和长期安全棋子。
- 每步最多思考 4 秒。
- 浏览器端默认使用约 90% CPU Worker。
- 使用 `coi-serviceworker.js` 在 GitHub Pages 上启用 `crossOriginIsolated`。
- 页面文案统一为简体中文。
- 右侧搜索评分表展示每步 AI 的深度、分数、节点数、NPS 和耗时。
- AI 思考时用黄色标注当前可下位置。

## 项目结构

```text
index.html                  # 页面入口和菜单
coi-serviceworker.js        # 为静态托管补 COOP/COEP 响应头
assets/js/main.js           # UI、规则、动画、游戏流程
assets/js/ai-manager.js     # Web Worker 池，固定约 90% CPU
assets/js/ai-worker.js      # 单个 Worker，加载 Rust/Wasm 并执行搜索
assets/wasm/                # wasm-pack 构建输出目录
rust-ai/                    # Rust/Wasm AI 子工程
server.py                   # 本地线程版静态服务器，自动找空闲端口
.github/workflows/pages.yml # GitHub Actions 构建 Wasm 并部署 Pages
docs-site/                  # MkDocs 文档站源码，发布到 /docs/
```

## 本地运行

不要直接用 `file://` 打开 `index.html`。Worker、Wasm 和 Service Worker 都需要 HTTP 环境。

推荐使用项目自带的本地服务器。它会自动从 `8100-8999` 随机寻找空闲端口，避免 8080 已被占用。

```bash
python3 server.py
```

也可以手动指定端口：

```bash
python3 server.py --port 9000
```

启动后终端会打印实际访问地址，例如：

```text
http://127.0.0.1:8342/
```

首次访问时，`coi-serviceworker.js` 注册后可能自动刷新一次页面，这是为了让页面进入 Service Worker 控制范围。

## 构建 Rust/Wasm

需要安装 Rust 和 `wasm-bindgen-cli`。

```bash
cd rust-ai
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli
cargo build --target wasm32-unknown-unknown --release
mkdir -p ../assets/wasm
wasm-bindgen --target web --out-dir ../assets/wasm --out-name othello_ai target/wasm32-unknown-unknown/release/othello_ai.wasm
```

构建成功后会生成：

```text
assets/wasm/othello_ai.js
assets/wasm/othello_ai_bg.wasm
```

`ai-worker.js` 会加载 `assets/wasm/othello_ai.js`，再调用 Rust 导出的 `search_best_move()`。

## AI 设计

AI 使用两个 `u64` 位棋盘保存局面：

- `black`：黑棋占位。
- `white`：白棋占位。

每个 bit 对应一个棋盘格，位置为：

```text
index = row * 8 + col
```

搜索策略：

- 根节点由 JS 拆分给多个 Worker。
- 每个 Worker 在自己的候选步中执行 Rust/Wasm 搜索。
- Rust 内部使用 NegaMax 写法的 Alpha-Beta。
- 使用迭代加深保证 4 秒预算内随时有可返回结果。
- 终局阶段直接搜索到游戏结束，避免靠评估函数猜最终胜负。
- 评估函数综合位置权重、角、机动性、前沿子、奇偶性、稳定子和终局子数。

## 引擎技术说明

- **Rust/Wasm**：搜索核心使用 Rust 编写并编译为 WebAssembly，在浏览器本地高速运行，不需要后端服务器。
- **Bitboard 位棋盘**：用两个 `u64` 表示黑白棋盘，占用小，落子、翻子和局面复制都更轻量。
- **NegaMax Minimax**：假设双方都会选择最优走法，并用对称的 NegaMax 写法简化递归搜索。
- **Alpha-Beta 剪枝**：提前剪掉不会影响最终决策的分支，让同样时间内可以搜索更深。
- **迭代加深**：先搜浅层，再逐步加深；4 秒时间到时，始终能返回当前已经找到的最优落子。
- **置换表**：缓存单步搜索中已经算过的局面，避免不同走法顺序到达同一局面时重复计算。
- **走法排序、Killer Move、History Heuristic**：优先搜索更可能强的落子，提高 Alpha-Beta 剪枝效率。
- **终局完全搜索**：后期空格较少时直接搜索到游戏结束，避免只靠评估函数猜最终胜负。
- **稳定子评估**：综合角、稳定子、机动性、前沿子、奇偶性和终局子数，提升中后盘判断质量。
- **Web Worker 并行**：把根节点候选步拆给多个 Worker，默认使用约 90% CPU 线程，同时保持页面响应。
- **搜索统计面板**：每步 AI 都会展示搜索深度、Minimax 分数、遍历节点数、每秒节点数和耗时。

## 为什么保留 coi-serviceworker.js

当前 AI 并行方式是“多个 Web Worker 分片搜索 + 每个 Worker 独立加载 Wasm”，不依赖 Wasm pthread 或 SharedArrayBuffer。`coi-serviceworker.js` 主要用于让 GitHub Pages 这类静态托管环境具备跨源隔离响应头，方便以后接入需要 `crossOriginIsolated` 的能力。正常服务器可以通过响应头配置：

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

GitHub Pages 不能自定义这些响应头，所以本项目使用 `coi-serviceworker.js` 在客户端通过 Service Worker 为同源资源补充响应头。

## GitHub Pages 部署

项目已提供 GitHub Actions 工作流：

```text
.github/workflows/pages.yml
```

push 到 `main` 或 `master` 后，Actions 会自动：

1. 安装 Rust。
2. 安装 `wasm-bindgen-cli`。
3. 编译 `rust-ai` 到 wasm32。
4. 生成浏览器可加载的 `assets/wasm/` 文件。
5. 构建 MkDocs 文档站。
6. 将文档站输出复制到 `_site/docs/`。
7. 上传静态站点。
8. 部署到 GitHub Pages。

也可以在 GitHub Actions 页面手动触发 `Build and Deploy Pages`。

### 本地构建后手动部署

如果不使用 GitHub Actions，也可以先在本地按“构建 Rust/Wasm”步骤生成最新 `assets/wasm/` 文件，再把静态文件发布到 GitHub Pages 分支或 Pages 配置指向的目录。需要确保以下文件存在：

```text
index.html
coi-serviceworker.js
assets/js/main.js
assets/js/ai-manager.js
assets/js/ai-worker.js
assets/wasm/othello_ai.js
assets/wasm/othello_ai_bg.wasm
```

GitHub Pages 只负责分发静态文件；AI 计算发生在访问者自己的浏览器和本机 CPU 上。
