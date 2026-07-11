# 黑白棋 AI

这是一个可部署到 GitHub Pages 的浏览器端黑白棋项目。页面保留本机双人、人机对战和机机对战三种模式；人机和机机模式使用 Rust/Wasm AI，在 Web Worker 池中并行搜索。

Rust/Wasm Othello AI running entirely in the browser with bitboards, alpha-beta search, and worker-based parallelism.
The engine includes exact endgame search and stability-aware evaluation for stronger late-game decisions.

在线体验：

```text
https://billzi2016.github.io/Othello-AI/
```

## 当前目标

- 使用 Rust 实现黑白棋 AI 底层搜索。
- 使用两个 `u64` bitboard 表示黑白棋局面。
- 使用 Alpha-Beta / NegaMax 剪枝和迭代加深。
- 后期空格较少时启用终局完全搜索。
- 使用稳定子评估区分临时子数和长期安全棋子。
- 每步最多思考 5 秒。
- 浏览器端使用约一半 CPU Worker。
- 使用 `coi-serviceworker.js` 在 GitHub Pages 上启用 `crossOriginIsolated`。
- 页面文案统一为简体中文。

## 项目结构

```text
index.html                  # 页面入口和菜单
coi-serviceworker.js        # 为静态托管补 COOP/COEP 响应头
assets/js/main.js           # UI、规则、动画、游戏流程
assets/js/ai-manager.js     # Web Worker 池，固定约一半 CPU
assets/js/ai-worker.js      # 单个 Worker，加载 Rust/Wasm 并执行搜索
assets/wasm/                # wasm-pack 构建输出目录
rust-ai/                    # Rust/Wasm AI 子工程
server.py                   # 本地线程版静态服务器，自动找空闲端口
.github/workflows/pages.yml # GitHub Actions 构建 Wasm 并部署 Pages
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
- 使用迭代加深保证 5 秒预算内随时有可返回结果。
- 终局阶段直接搜索到游戏结束，避免靠评估函数猜最终胜负。
- 评估函数综合位置权重、角、机动性、前沿子、奇偶性、稳定子和终局子数。

## 为什么需要 coi-serviceworker.js

浏览器中使用 SharedArrayBuffer / Wasm 多线程能力需要页面处于 `crossOriginIsolated` 状态。正常服务器可以通过响应头配置：

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
5. 上传静态站点。
6. 部署到 GitHub Pages。

也可以在 GitHub Actions 页面手动触发 `Build and Deploy Pages`。

把构建后的静态文件提交到 GitHub Pages 发布分支即可。需要确保以下文件存在：

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
