# dsh-plugin-skin · 已知问题

本文件记录 monorepo 结构性问题——不阻塞日常开发、但影响长期可维护性的项目。

## 1 · 皮肤包借框架包的 `derive-manifest.mjs`

**事实**：`packages/liquid-glass/package.json` 的 `scripts.manifest` 指向：

    node ../../.dev/dsh-ui-projects/scripts/derive-manifest.mjs --package . --check

`derive-manifest.mjs` **不在皮肤包里**——它属于框架包 `dsh-ui-projects`。开发时依赖仓库根 `.dev\dsh-ui-projects` junction 才能跑到。

**影响**：

- **发布 npm 后**——皮肤包的用户装完**跑不了** `npm run manifest`——**但这是预期的**：`files` 字段不含 `scripts/`——`derive-manifest.mjs` 也不在 tarball 里——**开发工具不发布**
- **开发时**——junction 断（框架包路径改名/删）——**五个入口全部崩**：`npm run manifest`、`build`、`verify`、`emitted-css`、`derive-boot-css`。它们的框架依赖都写成 `../../../.dev/dsh-ui-projects/…`（`package.json` 的 `manifest` 脚本、`scripts/build.mjs:30`、`scripts/verify.mjs:34`、`scripts/derive-boot-css.mjs:39`、`scripts/emitted-css.mjs:21`）。
  **本节此前写"但其他脚本（verify/build）正常——因为它们的 import 直接走 .mjs 里写的路径"是错的**：那几个 `.mjs` 里写的路径**正是** `.dev` 转发路径，junction 一断它们连模块都加载不了。**唯一不受影响的是 `scripts/check.mjs`**（它不 import 框架）。

**不阻塞 P2-4**——但记入——

**未来修法**（可选）：

a) 把 `derive-manifest.mjs` 复制一份到皮肤包的 `scripts/` 下（重复代码——易脱节）
b) 抽成共享 dev 依赖——`@fn-x/dsh-ui-projects-dev` 之类——发布到 npm——皮肤包 devDependencies 引用
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

## 3 · P2 首次 commit 含 16 个过程产物

**事实**：commit 6b4f9bf 里含 16 个过程产物：

- packages/liquid-glass/scripts/one-shot-fix-p2-3-legacy.mjs + .report.txt
- packages/liquid-glass/scripts/one-shot-fix-p2-4-files.mjs + .report.txt
- packages/liquid-glass/scripts/one-shot-fix-p2-4c.mjs + .report.txt
- packages/liquid-glass/scripts/one-shot-fix-p2-problem5.mjs + .report.txt
- packages/liquid-glass/scripts/one-shot-fix-p2-problem5-v2.mjs + .report.txt
- packages/liquid-glass/scripts/one-shot-fix-p2-skeleton.mjs + .report.txt
- packages/liquid-glass/scripts/one-shot-fix-p2-skeleton-v2.mjs + .report.txt
- packages/liquid-glass/scripts/one-shot-revert-imports.mjs + .report.txt

**性质**：一次性脚本（P2 期间临时使用，非运行时依赖；不被 scripts/exports 引用）。

**影响**：不阻塞发布；但仓库历史里混入过程产物。

**处置**：留到后续。不硬改 6b4f9bf（保留 P2 完成锚点）。后续清理 commit 删除 + 归档。

---

## 4 · 完整用户视角安装链（待验证）

**事实**：P2 期间只做了 tarball 结构验证（npm pack --dry-run + tar -tf），
未做空项目安装。

**关键更正**：不需要先发 npm——本地路径即可验证。

**验证命令**（待用户执行）：

    $test = "$env:TEMP\uip-user-test"
    Remove-Item $test -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force $test | Out-Null
    cd $test
    npm init -y
    npm install "E:\dsh-plugins\dsh-plugin-skin\packages\liquid-glass"
    npm install "E:\dsh-plugins\dsh-plugin-skin\meta"
    Get-ChildItem node_modules\@fn-x | Select-Object Name, LinkType, Target

**判读**：node_modules\@fn-x 下应同时出现
dsh-plugin-liquid-glass 与 dsh-plugin-skin。

**注意**：必须先装 liquid-glass，再装 meta；否则 meta 的
dependencies（@fn-x/dsh-plugin-liquid-glass@^1.0.0）会去 registry 找 → 404。

**处置**：本轮由用户执行；结果回填本节。

---

## 5 · 切 dsh 运行时配置到新包（待办）

**事实**：当前 dsh 运行时仍依赖旧位置 E:\dsh\plugins\dsh-plugin-liquid-glass。

**前置**：旧位置保留不删（运行依赖）；新包发布到 npm 后可切。

**修法**：发布后切 dsh 配置指向新包 @fn-x/dsh-plugin-liquid-glass。

**处置**：待 npm 发布后处理。

---

## 6 · 本文件的手工维护状态（生成脚本已滞后）

**事实**：本文件的原始生成脚本（P2-4 期的 KNOWN_ISSUES_TEXT 内嵌文本）
已滞后于本文件现状——其内嵌的 :9 路径与 :11 junction 位置为旧形态。

**影响**：重跑该脚本会把本文件已修正的内容覆盖回旧形态。

**处置**：本文件现改为手工维护。若需重跑生成脚本，必须先同步其内嵌文本。

## 7 · example 包装不进 dsh（A 阶段止损）

**现象**：`@fn-x/dsh-plugin-example*` 无法通过手改 profile 的 cordis.patch.yml 加载。dsh web 重启后（进程 StartTime 晚于 patch 编辑时间，已排除"未重启"），页面 `[data-example-dialog]` 仍 = 0，`window.__dshUiProjectRows` 无 example。

**已试**：14 步诊断——读两条包内 patch、改 profile 层 patch、重启 dsh web、对照 liquid-glass 包 patch（已成功加载的样本）。

**未试**：官方安装流程 `dsh plugin --profile web add <path>`。

**判定**：手改 profile patch 不是 dsh 的插件加载路径。这是 dsh 框架层的加载机制问题，不属于本插件（两个 example 包本体已构建 `lib/client.js` + `lib/index.js`，均在，LastWriteTime 2026-09-28）。

**影响**：browser-verify 的 4 个例包 test 红（环境相关）。不阻塞产品发布。

**处置**：
1. 未来若要装 example 包，先试官方 `dsh plugin --profile web add <path>`。
2. 若官方命令也失败，则记入 dsh 上游 issue。
3. A 阶段暂止损，不再深挖手改 patch 路径。

## 8 · 跨文件做文本替换：PowerShell 5.1 会把无 BOM 的 UTF-8 静默写坏

**事实**（2026-10-06，内置化过程中实测）：用 PowerShell 5.1 做"读—替换—写回"时

    $t = Get-Content -LiteralPath $f -Raw
    $t = $t.Replace('old', 'new')
    [System.IO.File]::WriteAllText($f, $t)

会**静默损坏文件**：`Get-Content -Raw` 对**没有 BOM 的 UTF-8 文件按 ANSI（本机码页 936）解码**，于是每个 `—`（em dash）和 `─`（box drawing）都变成乱码，再按 UTF-8 写回就永久留在文件里。**其中 4 处还丢了一个字节**（乱码里出现的 `?`），所以"反向解码"修不回来——**只能从原件重新生成**。

**后果**：那次事故损坏了 3 个文件（`skin.js` 14 处乱码、`overlay.js` 92 处、`boot.css` 4 处），而且**已经提交进历史**，最后由内置化的等价性检查抓出来。三个文件后来从干净的 git 版本重新生成，乱码数均为 0。

**规则**：

- 跨编码文件做替换，**用 Node**（`readFileSync(…, 'utf8')` + `writeFileSync(…, 'utf8')`）——本次修复就是这么做的；
- 或 PowerShell 7 的 `Set-Content -Encoding utf8NoBOM`；
- **不要**用 PS 5.1 的 `WriteAllText`，也不要用 `>` / `|` / `Out-File` 把**文件内容**搬进源码文件（`Out-File` 还会加 BOM）；
- 判据：改完后数**乱码字符数**（`\uFFFD` 加 CJK 兼容区命中）应为 0。本次三个文件修完均为 0。
