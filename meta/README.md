# @fn-x/dsh-plugin-skin

Aggregate package for dsh UI skins.

**It registers nothing.** Installing this package installs every skin
listed in `dependencies` — nothing more. The skins register themselves
when dsh loads them.

This package is the monorepo's aggregate exit: the skins themselves live in
`packages/<name>/`.

Monorepo: https://github.com/F-990-6/dsh-plugin-skin

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

### 链接

| 资源 | 地址 |
|---|---|
| 框架 npm | `https://www.npmjs.com/package/dsh-ui-projects` |
| 皮肤聚合 npm | `https://www.npmjs.com/package/@fn-x/dsh-plugin-skin` |
| Liquid Glass npm | `https://www.npmjs.com/package/@fn-x/dsh-plugin-liquid-glass` |
| 框架源码 | `https://github.com/F-990-6/dsh-ui-projects` |
| 皮肤 monorepo | `https://github.com/F-990-6/dsh-plugin-skin` |

### 依赖如何解析

**How the dependency resolves.** A published skin is named in `dependencies`
with a caret range such as `^1.0.0`, and it is fetched from the npm registry.
At development time the framework package is reached through the
`.dev/dsh-ui-projects` junction, which is ignored by git and never published.
While a skin is being developed, this package can point at a local checkout
with a `link:` specifier instead of a version range.

## For maintainers

Add a new skin:

1. Publish it as `@fn-x/dsh-plugin-<name>`.
2. Add one line to `dependencies`:

       "@fn-x/dsh-plugin-<name>": "<version>"

That is the whole change — this package stays empty otherwise.

## Compatibility

    dsh    >= 0.1.5-rc.1
    Node   >= 20

The dsh requirement is the one this package declares as
`dsh.compatibility.dsh`; the Node requirement is the version the tooling is
developed and tested against.

## License

MIT. See `LICENSE` in this repository.
