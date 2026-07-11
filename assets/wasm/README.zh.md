# Wasm 产物

`assets/wasm/` 存放浏览器实际加载的 Rust/Wasm 构建产物。这里的文件不是手写业务逻辑，而是由 `rust-ai/` 编译生成。

文档站对应页面：

```text
https://billzi2016.github.io/Othello-AI/docs/wasm/
```

## 文件含义

```text
othello_ai.js             wasm-bindgen 生成的 ES module 绑定
othello_ai_bg.wasm        Rust 编译后的 Wasm 二进制
othello_ai.d.ts           TypeScript 声明文件
othello_ai_bg.wasm.d.ts   Wasm 模块声明文件
```

`ai-worker.js` 加载 `othello_ai.js`。这个绑定文件负责初始化 `othello_ai_bg.wasm`，并暴露 Rust 导出的 `search_best_move()`。

## 怎样生成

在项目根目录按下面步骤构建：

```bash
cd rust-ai
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli
cargo build --target wasm32-unknown-unknown --release
mkdir -p ../assets/wasm
wasm-bindgen --target web --out-dir ../assets/wasm --out-name othello_ai target/wasm32-unknown-unknown/release/othello_ai.wasm
```

输入是 `rust-ai/src/lib.rs` 和 Cargo 依赖。输出是 `assets/wasm/` 中的浏览器可加载文件。

## 判断结果正常

正常结果至少包含：

```text
assets/wasm/othello_ai.js
assets/wasm/othello_ai_bg.wasm
```

如果 `othello_ai.js` 缺失，Worker 无法导入模块。如果 `othello_ai_bg.wasm` 缺失，绑定文件会加载失败。浏览器控制台通常会显示 404 或 Wasm 初始化错误。

这些文件和 Rust 源码必须匹配。修改 `rust-ai/src/lib.rs` 后，需要重新构建，否则浏览器仍然运行旧的 Wasm。
