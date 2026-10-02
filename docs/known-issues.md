# dsh-plugin-skin · 已知问题

本文件记录 monorepo 结构性问题——不阻塞日常开发、但影响长期可维护性的项目。

## 1 · 皮肤包借框架包的 `derive-manifest.mjs`

**事实**：`packages/liquid-glass/package.json` 的 `scripts.manifest` 指向：

    node ../../.dev/dsh-ui-projects/scripts/derive-manifest.mjs --package . --check

`derive-manifest.mjs` **不在皮肤包里**——它属于框架包 `dsh-ui-projects`。开发时依赖仓库根 `.dev\dsh-ui-projects` junction 才能跑到。

**影响**：

- **发布 npm 后**——皮肤包的用户装完**跑不了** `npm run manifest`——**但这是预期的**：`files` 字段不含 `scripts/`——`derive-manifest.mjs` 也不在 tarball 里——**开发工具不发布**
- **开发时**——junction 断（框架包路径改名/删）——`npm run manifest` 崩——**但其他脚本（verify/build）正常**——因为它们的 import 直接走 .mjs 里写的路径

**不阻塞 P2-4**——但记入——

**未来修法**（可选）：

a) 把 `derive-manifest.mjs` 复制一份到皮肤包的 `scripts/` 下（重复代码——易脱节）
b) 抽成共享 dev 依赖——`@xjl-resources/dsh-ui-projects-dev` 之类——发布到 npm——皮肤包 devDependencies 引用
c) 保持现状——**monorepo 内部开发工具**——**不发布**

当前选 c。

## 2 · browser-verify 未定位的 flaky

**事实**：browser-verify 当前有 8 红挂起：

- 4 例包（环境相关）
- 1 例 first-frame（跨仓库）
- 3 例 suite 自身 flaky

**已修**：commit `c711690` 修复 `modes` flaky（已连续 5 次稳定）。

**未定位**：剩余 8 红的具体根因尚未定位，归为“未定位的 flaky”。

**影响**：不阻塞 P2，但 **开源前必修**。

**处置**：待独立任务定位并修复。
