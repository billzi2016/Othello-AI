# 维护说明

文档分两类维护。

第一类是贴近代码的说明，放在代码所在目录：

- `rust-ai/README.zh.md` 和 `rust-ai/README.md` 说明 Rust/Wasm 引擎。
- `assets/js/README.zh.md` 和 `assets/js/README.md` 说明 JavaScript 运行层。
- `assets/wasm/README.zh.md` 和 `assets/wasm/README.md` 说明生成的 Wasm 产物。

第二类是站点级说明，放在 `docs-site/docs/zh/` 和 `docs-site/docs/en/`。这些页面解释如何运行、部署和维护项目。

## 新增页面规则

新增解释性页面时，要同时添加中文和英文版本。中文文件名使用 `.zh.md`，英文文件名不加语言后缀。例如：

```text
docs-site/docs/zh/example.zh.md
docs-site/docs/en/example.md
```

新增页面后必须写入 `docs-site/mkdocs.yml` 的 `nav`。MkDocs 导航就是站点目录，不在导航里的页面会让读者难以发现。

## 使用 symlink

如果文档已经存在于项目其他目录，不要复制一份到 `docs-site/docs/`。优先使用 symlink 引入，避免同一内容出现多个版本。

判断是否正常的方式很简单：修改原文档后，文档站中对应页面也应该显示同一份内容。如果两边需要分别修改，说明 DRY 被破坏了。
