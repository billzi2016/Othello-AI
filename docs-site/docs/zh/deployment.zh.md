# GitHub Pages 部署

项目已有游戏网站，所以文档站不能单独接管 GitHub Pages 根路径。当前部署策略是把游戏发布到根路径，把 MkDocs 文档站发布到 `/docs/` 子路径。

发布后的地址：

```text
https://billzi2016.github.io/Othello-AI/
https://billzi2016.github.io/Othello-AI/docs/
```

## 工作流做什么

`.github/workflows/pages.yml` 负责一次性构建游戏和文档：

1. 安装 Rust 工具链。
2. 安装 `wasm-bindgen-cli`。
3. 编译 `rust-ai` 到 `wasm32-unknown-unknown`。
4. 生成 `assets/wasm/othello_ai.js` 和 `assets/wasm/othello_ai_bg.wasm`。
5. 安装 `docs-site/requirements.txt` 中的 MkDocs 依赖。
6. 构建 `docs-site/mkdocs.yml`。
7. 把游戏文件放进 `_site/` 根目录。
8. 把 `docs-site/site/` 放进 `_site/docs/`。
9. 上传 `_site/` 并部署到 GitHub Pages。

## 判断部署是否正常

部署成功后，根路径应该打开游戏页面，`/docs/` 应该打开 MkDocs 文档站。两个地址共用同一次 Pages 部署，避免两个 workflow 互相覆盖。

如果根路径变成文档站，说明发布产物目录放错了。如果 `/docs/` 404，先检查 MkDocs 构建步骤是否执行，再检查 `_site/docs/index.html` 是否存在。
