# dsh-plugin-skin

Monorepo for the dsh UI skin packages.

dsh is a Web GUI application. A skin is its pluggable look: a package that
changes how the running interface is painted. This repository hosts the
official skin, `liquid-glass`, together with the meta package that installs it.

Skins are installed into a dsh profile and ship **off**: the look changes only
when somebody turns one on, and turning it off again restores the interface
exactly as it was.

## Layout

- `packages/<name>/` — one npm package per skin, published as
  `@fn-x/dsh-plugin-<name>`. `packages/liquid-glass/` is the one that
  exists today.
- `meta/` — the `@fn-x/dsh-plugin-skin` package: aggregates
  every skin in `dependencies` and registers none of them itself.

Both are npm workspaces of this repository, declared in the root
`package.json` as `packages/liquid-glass` and `meta`.

The framework package `dsh-ui-projects` is **not** part of this monorepo: it
lives in its own repository. At development time it is reached through the
`.dev/dsh-ui-projects` junction described further down.

## Install

Most users install the framework plus the meta package:

    dsh plugin add dsh-ui-projects @fn-x/dsh-plugin-skin

Users who want a single skin install it directly:

    dsh plugin add dsh-ui-projects @fn-x/dsh-plugin-liquid-glass

The framework comes first: the meta package carries no code, it only lists
skins as dependencies.

## Usage

**Restart `dsh web` after installing**, then open **Settings › UI**. The skin
appears there as a card with a switch beside its name.

Skins ship **off**. Clicking the switch turns the skin on; clicking it again
turns it off and restores the original interface. The choice is persisted with
the rest of the dsh settings, so a reload shows the same state.

## Adding a new skin

1. Create `packages/<name>/` following the shape of an existing skin
   (`package.json` + `src/` + `lib/client.js`, declares
   `requires: ['dsh-ui-projects']`).
2. Publish it as `@fn-x/dsh-plugin-<name>`.
3. Add it to `meta/package.json`'s `dependencies`.

## Compatibility

    dsh    >= 0.1.5-rc.1
    Node   >= 20

The dsh requirement is the one the packages here declare as
`dsh.compatibility.dsh`; the Node requirement is the version the tooling is
developed and tested against.

## Development

Install the workspaces from the repository root:

    npm install

Each skin package builds and verifies itself, from its own directory:

    npm run build      # src/ -> lib/
    npm test           # behavioural assertions against the built bundle
    npm run manifest   # regenerate src/client/manifest.generated.js (--check to verify)

Contributions are welcome. Each package's own README documents that package;
the conventions this repository follows are stated in the files beside it.

## History

- 2026-10-02: skeleton created (P2-1). First migration: `liquid-glass`
  moves from its original standalone location to
  `packages/liquid-glass/` (P2-2).

## Development-only dependencies

The framework package `dsh-ui-projects` lives in its own repository. This monorepo does not contain it. For local
development, a junction at `.dev/dsh-ui-projects` points at the framework checkout; the skin packages' scripts
import through it.

`.dev/` is ignored by git and is never published.

## License

MIT. See `LICENSE` in this repository.
