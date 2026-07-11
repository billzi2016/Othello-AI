# MkDocs bilingual docs site PRD

## Purpose

This document defines the requirements for a reusable MkDocs documentation site. The site should be understandable without extra verbal context and should support Chinese and English from the start.

## Goals

The docs site should:

- Use MkDocs as the static documentation framework.
- Enable an i18n plugin for Chinese and English.
- Keep docs site files inside `docs-site/`.
- Keep Chinese and English source files in separate folders.
- Include every document in the MkDocs navigation.
- Publish under `/docs/` so it does not replace the existing game site.
- Prefer symlinks when documentation already exists elsewhere in the repository.

## Structure

Chinese files live in `docs-site/docs/zh/` and use `.zh.md` file names. English files live in `docs-site/docs/en/` and do not add an `en` suffix.

Examples:

```text
docs-site/docs/zh/quick-start.zh.md
docs-site/docs/en/quick-start.md
```

## Navigation

The navigation should show the project overview, quick start, runtime structure, Rust engine, JavaScript runtime, Wasm artifacts, browser environment, deployment, maintenance, and PRD documents. The top navigation must include a GitHub link.

## Expected result

A successful implementation produces a MkDocs site that can be built from `docs-site/mkdocs.yml`. The site explains what the project does, how data moves through the browser and Wasm layers, how to run it locally, and how to publish it without replacing the existing game page.
