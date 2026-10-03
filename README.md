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

## 安装

### 你需要什么

- dsh ≥ 0.1.5-rc.1
- Node.js ≥ 20

### 三个包

- `dsh-ui-projects` —— 框架，必装。注册表、设置页、首帧注入。
- `@fn-x/dsh-plugin-skin` —— 聚合包。装它 = 装全部皮肤。
- `@fn-x/dsh-plugin-liquid-glass` —— 单个皮肤。想挑皮肤的用户只装这个。

### 一般用户

1. `dsh plugin --profile web add dsh-ui-projects`
2. `dsh plugin --profile web add @fn-x/dsh-plugin-skin`
3. 重启 dsh web

重启后：设置 → 界面 → 打开 Liquid Glass 开关。

### 想挑皮肤的用户

只装要的皮肤包，不装聚合包：`dsh plugin --profile web add @fn-x/dsh-plugin-liquid-glass`

### 本地开发

从 GitHub 克隆两个仓库，用 `dsh plugin --profile web add <本地路径>` 装进 profile。改了源码后跑 `node scripts/build.mjs` 重 build，重启 dsh web。

### 卸载

- 只卸皮肤：`dsh plugin --profile web remove @fn-x/dsh-plugin-skin`
- 全卸：再 remove 框架包

### 故障排查

| 现象 | 原因 |
|---|---|
| 设置里没有「界面」栏目 | 框架没装上 |
| 有「界面」但没卡片 | 皮肤没装上 |
| 装上了但页面无卡 | 上游加载问题（已知） |
| 开关打开没变化 | 本地安装未 build |
| 重开有闪烁 | dsh 版本低于 0.1.5-rc.1 |

### 链接

- npm：`dsh-ui-projects`、`@fn-x/dsh-plugin-skin`、`@fn-x/dsh-plugin-liquid-glass`
- 源码：`github.com/F-990-6/dsh-ui-projects`、`github.com/F-990-6/dsh-plugin-skin`
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
