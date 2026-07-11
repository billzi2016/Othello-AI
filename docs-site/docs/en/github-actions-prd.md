# GitHub Actions deployment PRD

## Purpose

This document defines the deployment requirements for the static game site and the MkDocs documentation site.

## Goals

The workflow should:

- Build the Rust/Wasm engine.
- Generate browser-loadable Wasm files.
- Build the MkDocs documentation site.
- Publish the game at the GitHub Pages root path.
- Publish documentation under `/docs/`.
- Keep one Pages deployment so workflows do not overwrite each other.

## Triggering

The workflow should run on pushes to `main` or `master`, and it should also support manual runs through `workflow_dispatch`.

## Build output

The Pages artifact should use this layout:

```text
_site/
  index.html
  coi-serviceworker.js
  assets/
  README.md
  README.zh.md
  docs/
    index.html
    ...
```

The root path opens the game. The `/docs/` path opens the MkDocs site.

## Expected result

After deployment, these URLs should work:

```text
https://billzi2016.github.io/Othello-AI/
https://billzi2016.github.io/Othello-AI/docs/
```

If the root URL opens documentation, the artifact layout is wrong. If `/docs/` is missing, the MkDocs build or copy step failed.
