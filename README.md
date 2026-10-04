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

可以直接在 dsh 插件中添加、安装 `dsh-ui-projects` 和 `@fn-x/dsh-plugin-skin`。

### 你需要什么

| 项 | 要求 |
|---|---|
| dsh | ≥ 0.1.5-rc.1 |
| Node.js | ≥ 20（各包 `engines.node` 声明） |

### 三个包

| 包 | 是什么 | 需要装吗 |
|---|---|---|
| `dsh-ui-projects` | 框架——注册表、设置页、首帧注入 | **必装** |
| `@fn-x/dsh-plugin-skin` | 聚合包——装它 = 装全部皮肤 | 一般用户装 |
| `@fn-x/dsh-plugin-liquid-glass` | 单个皮肤——Liquid Glass | 想挑皮肤的用户装 |

### 一般用户

1. 装框架：

```powershell
dsh plugin --profile web add dsh-ui-projects
```

2. 装聚合包（自动带上全部皮肤）：

```powershell
dsh plugin --profile web add @fn-x/dsh-plugin-skin
```

3. **重启 dsh web**

重启后：设置 → **界面** → 看到 Liquid Glass 卡片 → 打开开关。

### 想挑皮肤的用户

只装 `dsh-ui-projects` 与 `@fn-x/dsh-plugin-liquid-glass`，不装聚合包：

```powershell
dsh plugin --profile web add dsh-ui-projects
dsh plugin --profile web add @fn-x/dsh-plugin-liquid-glass
```

### 本地开发

从 GitHub 克隆两个仓库，用本地路径装进 profile：

```powershell
git clone https://github.com/F-990-6/dsh-ui-projects.git
git clone https://github.com/F-990-6/dsh-plugin-skin.git

dsh plugin --profile web add E:\path\to\dsh-ui-projects
dsh plugin --profile web add E:\path\to\dsh-plugin-skin\packages\liquid-glass
```

改了源码后重 build，再重启 dsh web：

```powershell
cd E:\path\to\dsh-plugin-skin\packages\liquid-glass
node scripts/build.mjs
```

### 验证安装

| 检查 | 期望 |
|---|---|
| 设置 → 界面 | 有 Liquid Glass 卡片（预览图、开关、类型标签） |
| 打开开关 | 页面变毛玻璃（模糊、圆角、半透明） |
| 重开 dsh | 第一帧就是皮肤，无闪烁 |

### 卸载

只卸皮肤：

```powershell
dsh plugin --profile web remove @fn-x/dsh-plugin-skin
```

全卸（框架与皮肤）：

```powershell
dsh plugin --profile web remove dsh-ui-projects
dsh plugin --profile web remove @fn-x/dsh-plugin-skin
```

### 故障排查

| 现象 | 原因 |
|---|---|
| 设置里没有「界面」栏目 | 框架没装上 |
| 有「界面」但没卡片 | 皮肤没装上 |
| 装上了、`installed.json` 也列了，但页面无卡 | 上游加载机制问题（已知，`known-issues §7`） |
| 开关打开没变化 | 本地安装未 build——跑 `node scripts/build.mjs` |
| 重开有闪烁 | dsh 版本 < 0.1.5-rc.1 |

### 常见问题

**会覆盖其他插件吗？** 不会，框架和皮肤都是独立插件。

**装多个皮肤会冲突吗？** 不会，皮肤互斥——同时只有一个生效，切换时旧的自动清理。

**关闭皮肤会丢设置吗？** 不会，开关状态存在 dsh 设置里。

### 链接

| 资源 | 地址 |
|---|---|
| 框架 npm | `https://www.npmjs.com/package/dsh-ui-projects` |
| 皮肤聚合 npm | `https://www.npmjs.com/package/@fn-x/dsh-plugin-skin` |
| Liquid Glass npm | `https://www.npmjs.com/package/@fn-x/dsh-plugin-liquid-glass` |
| 框架源码 | `https://github.com/F-990-6/dsh-ui-projects` |
| 皮肤 monorepo | `https://github.com/F-990-6/dsh-plugin-skin` |

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
