# dsh-plugin-skin

Monorepo for the dsh UI skin packages.

## Layout

- `packages/<name>/` — one npm package per skin, published as
  `@xjl-resources/dsh-plugin-<name>`.
- `meta/` — the `@xjl-resources/dsh-plugin-skin` package: aggregates
  every skin in `dependencies` and registers none of them itself.

## Install

Most users install the framework plus the meta package:

    dsh plugin add dsh-ui-projects @xjl-resources/dsh-plugin-skin

Users who want a single skin install it directly:

    dsh plugin add dsh-ui-projects @xjl-resources/dsh-plugin-liquid-glass

## Adding a new skin

1. Create `packages/<name>/` following the shape of an existing skin
   (`package.json` + `src/index.js` + `lib/client.js`, declares
   `requires: [''dsh-ui-projects'']`).
2. Publish it as `@xjl-resources/dsh-plugin-<name>`.
3. Add it to `meta/package.json`''s `dependencies`.

## History

- 2026-10-02: skeleton created (P2-1). First migration: `liquid-glass`
  moves from `E:\dsh\plugins\dsh-plugin-liquid-glass\` to
  `packages/liquid-glass/` (P2-2).

## Development-only dependencies

The framework package `dsh-ui-projects` lives in its own repository. This monorepo does not contain it. For local
development, a junction at `.dev/dsh-ui-projects` points at the framework checkout; the skin packages' scripts
import through it.

`.dev/` is ignored by git and is never published.
