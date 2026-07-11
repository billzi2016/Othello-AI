# Maintenance

Documentation is maintained in two groups.

The first group stays near the code it explains:

- `rust-ai/README.zh.md` and `rust-ai/README.md` explain the Rust/Wasm engine.
- `assets/js/README.zh.md` and `assets/js/README.md` explain the JavaScript runtime layer.
- `assets/wasm/README.zh.md` and `assets/wasm/README.md` explain the generated Wasm artifacts.

The second group lives in `docs-site/docs/zh/` and `docs-site/docs/en/`. These pages explain how to run, deploy, and maintain the project.

## Adding pages

Every explanatory page should have both Chinese and English versions. Chinese files use `.zh.md`; English files do not add a language suffix. Example:

```text
docs-site/docs/zh/example.zh.md
docs-site/docs/en/example.md
```

Every new page must be added to `docs-site/mkdocs.yml` under `nav`. The MkDocs navigation is the site table of contents. A page outside the nav is hard for readers to find.

## Use symlinks

If a document already exists elsewhere in the repository, do not copy it into `docs-site/docs/`. Prefer a symlink so there is only one source.

The normal check is simple: after editing the source document, the corresponding docs site page should show the same content. If both places need separate edits, DRY has been broken.
