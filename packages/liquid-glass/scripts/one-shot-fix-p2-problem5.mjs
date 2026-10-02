#!/usr/bin/env node
/**
 * ONE-SHOT: PROBLEM 5, PLAN C2 (2026-10-02) — move the framework junction out of `packages/`, repoint the
 * five specifiers, and prove the new paths land on the same files before writing anything.
 *
 * THE POINT OF THE THREE VERIFICATIONS.
 *   V0 is arithmetic, not eyeballing: every rewritten specifier is resolved twice with `path.resolve` — once
 *      from the old text, once from the new — and the two results must be the SAME FILE. `path.resolve` is
 *      lexical and does NOT follow a junction, so the physical check uses `realpathSync` on the old side,
 *      which does; the two together are what "same directory" actually means here.
 *   V2 compiles the four rewritten `.mjs` files with `node --check`. Syntax only — it deliberately does not
 *      resolve imports, because that is V3's job and doing it early would fail on a junction that has not
 *      moved yet.
 *   V3 runs the real command after everything has landed: the manifest check through the NEW path. Its exit
 *      code is reported, never acted on — there is no automatic rollback anywhere in this script.
 *
 * WHAT IT TOUCHES: four `.mjs`, one `package.json`, `.gitignore`, `README.md`, and the junction itself.
 * It does not go near `meta/`, `packages/liquid-glass/lib/` or `packages/liquid-glass/src/`.
 *
 * DRY RUN BY DEFAULT. `--apply` performs the four filesystem operations and the five text edits, backing each
 * text file up to `.bak-c2` first.
 *
 * Usage:  node scripts/one-shot-fix-p2-problem5.mjs
 *         node scripts/one-shot-fix-p2-problem5.mjs --apply
 */
import { readFile, writeFile, rename, copyFile, unlink, mkdir, stat, lstat, realpath } from 'node:fs/promises'
import { existsSync, lstatSync, realpathSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, sep } from 'node:path'

const APPLY = process.argv.includes('--apply')
const scriptDir = dirname(fileURLToPath(import.meta.url))
const REPORT = join(scriptDir, 'one-shot-fix-p2-problem5.report.txt')

const SKIN = 'E:\\dsh-plugins\\dsh-plugin-skin'
const PKG = join(SKIN, 'packages', 'liquid-glass')
const JUNCTION_SRC = join(SKIN, 'packages', 'dsh-ui-projects')
const JUNCTION_DST = join(SKIN, '.dev', 'dsh-ui-projects')
const DEV_DIR = join(SKIN, '.dev')
const JUNCTION_TARGET = 'E:\\dsh\\plugins\\dsh-ui-projects'

const MJS_FILES = ['build.mjs', 'derive-boot-css.mjs', 'emitted-css.mjs', 'verify.mjs'].map((name) => join(PKG, 'scripts', name))
const MANIFEST = join(PKG, 'package.json')
const GITIGNORE = join(SKIN, '.gitignore')
const README = join(SKIN, 'README.md')

const OLD_PREFIX = "'../../dsh-ui-projects/"
const NEW_PREFIX = "'../../../.dev/dsh-ui-projects/"
const OLD_ROOT_IN_SPEC = '../../dsh-ui-projects'
const NEW_ROOT_IN_SPEC = '../../../.dev/dsh-ui-projects'
const MANIFEST_OLD = '../dsh-ui-projects/'
const MANIFEST_NEW = '../../.dev/dsh-ui-projects/'

const GITIGNORE_STALE = '/packages/dsh-ui-projects/'
const GITIGNORE_NEW = '/.dev/'

/** Verbatim from the brief; the user may still edit this afterwards. */
const README_SECTION = [
  '',
  '## Development-only dependencies',
  '',
  'The framework package `dsh-ui-projects` lives in its own repository. This monorepo does not contain it. For local',
  'development, a junction at `.dev/dsh-ui-projects` points at the framework checkout; the skin packages\' scripts',
  'import through it.',
  '',
  '`.dev/` is ignored by git and is never published.',
  '',
]

const FORBIDDEN_PREFIXES = [join(SKIN, 'meta') + sep, join(PKG, 'lib') + sep, join(PKG, 'src') + sep]

const stripBom = (text) => text.replace(/^\uFEFF/, '')
const countOf = (text, needle) => text.split(needle).length - 1
const samePath = (a, b) => a.toLowerCase() === b.toLowerCase()
const exists = async (path) => existsSync(path)
const hexHead = (buffer, count = 3) => [...buffer.subarray(0, Math.min(count, buffer.length))].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')

async function readText(path) {
  const raw = await readFile(path)
  return { raw, decoded: raw.toString('utf8'), text: stripBom(raw.toString('utf8')) }
}

async function main() {
  const out = []
  const push = (line = '') => { out.push(line); console.log(line) }
  const rule = (title) => { push('='.repeat(100)); push(title); push('='.repeat(100)) }
  const blockers = []
  const warns = []

  push('# one-shot: problem 5, plan C2 (junction → .dev/, five specifiers repointed)')
  push(`# mode:   ${APPLY ? 'APPLY' : 'dry-run'}`)
  push(`# report: ${REPORT}`)
  push(`# skin:   ${SKIN}`)
  push(`# target: ${JUNCTION_TARGET}`)
  push()

  /* ── guard: none of the targets may sit in the forbidden trees ───────────────────────────────── */
  const allTargets = [...MJS_FILES, MANIFEST, GITIGNORE, README]
  const trespass = allTargets.filter((path) => FORBIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix)))
  if (trespass.length > 0) {
    for (const path of trespass) blockers.push(`目标落在禁止目录内：${path}`)
  }
  push(`目标文件 ${allTargets.length} 个；落在 meta/ · lib/ · src/ 内的：${trespass.length} 个`)
  push()

  /* ── C-1..C-4: read, locate, and resolve both spellings ──────────────────────────────────────── */
  const codeEdits = []
  rule('=== V0 · 路径级数机械验证 ===')
  for (const file of MJS_FILES) {
    const label = `C-${MJS_FILES.indexOf(file) + 1} ${file.slice(SKIN.length + 1)}`
    if (!(await exists(file))) {
      push(`${label}：【文件不存在】`)
      blockers.push(`${label} 文件不存在`)
      continue
    }
    const read = await readText(file)
    const lines = read.text.split('\n')
    const hits = lines.map((line, index) => (line.includes(OLD_PREFIX) ? index : -1)).filter((index) => index !== -1)
    push(`${label}`)
    push(`  命中 ${JSON.stringify(OLD_PREFIX)}：${hits.length} 处（预期 1）`)
    if (hits.length !== 1) {
      blockers.push(`${label} 命中 ${hits.length} 处（预期 1）`)
      for (const index of hits) push(`    行 ${index + 1}：${lines[index]}`)
      continue
    }
    const index = hits[0]
    const line = lines[index]
    const at = line.indexOf(OLD_PREFIX)
    const quote = line.indexOf("'", at + 1)
    if (quote === -1) {
      blockers.push(`${label} 的 specifier 没有闭合引号`)
      continue
    }
    const oldSpec = line.slice(at + 1, quote)
    const newSpec = NEW_PREFIX.slice(1) + oldSpec.slice(OLD_ROOT_IN_SPEC.length)
    const dir = dirname(file)
    const oldAbs = resolve(dir, oldSpec)
    const newAbs = resolve(dir, newSpec)
    push(`  旧 import：${JSON.stringify(oldSpec)}`)
    push(`    path.resolve ⇒ ${oldAbs}`)
    push(`  新 import：${JSON.stringify(newSpec)}`)
    push(`    path.resolve ⇒ ${newAbs}`)

    /* Arithmetic: the tails after the framework root must be identical, and the new path must sit under .dev. */
    const oldTail = oldSpec.slice(OLD_ROOT_IN_SPEC.length)
    const newTail = newSpec.slice(NEW_ROOT_IN_SPEC.length)
    const tailOk = oldTail === newTail
    const underDev = newAbs.startsWith(join(SKIN, '.dev', 'dsh-ui-projects') + sep)
    push(`  断言 · 尾段相同（${JSON.stringify(oldTail)} = ${JSON.stringify(newTail)}）⇒ ${tailOk ? 'OK' : 'FAIL'}`)
    push(`  断言 · 新路径位于 .dev\\dsh-ui-projects 之下 ⇒ ${underDev ? 'OK' : 'FAIL'}`)
    if (!tailOk) blockers.push(`${label} 尾段不一致`)
    if (!underDev) blockers.push(`${label} 新路径不在 .dev\\dsh-ui-projects 之下`)

    /* Physical: realpath follows the junction, path.resolve does not — both are needed to mean "same file". */
    let physical = '跳过（旧路径当前不存在）'
    if (existsSync(oldAbs)) {
      try {
        const real = realpathSync(oldAbs)
        const targetReal = existsSync(JUNCTION_TARGET) ? realpathSync(JUNCTION_TARGET) : JUNCTION_TARGET
        const ok = real.toLowerCase().startsWith(targetReal.toLowerCase() + sep) || samePath(real, targetReal)
        physical = `${real} ⇒ ${ok ? 'OK（落在 ${JUNCTION_TARGET} 之下）' : `FAIL（不在 ${JUNCTION_TARGET} 之下）`}`
        if (!ok) blockers.push(`${label} 的旧路径未解析到 ${JUNCTION_TARGET}`)
      } catch (error) {
        physical = `FAIL（realpathSync 失败：${error.message}）`
        blockers.push(`${label} realpathSync 失败`)
      }
    } else {
      blockers.push(`${label} 的旧路径当前解析不到（junction 可能已断）`)
    }
    push(`  物理解析（realpathSync，会跟随 junction）⇒ ${physical}`)
    push(`  说明：path.resolve 是纯字符串运算、不跟随 junction；因此"同一物理目录"由上面的 realpathSync 判定。`)
    push()
    codeEdits.push({ id: label, kind: 'mjs', path: file, decoded: read.decoded, text: read.text, index, before: line, after: line.slice(0, at) + NEW_PREFIX.slice(1) + oldSpec.slice(OLD_ROOT_IN_SPEC.length) + line.slice(quote) })
  }

  /* ── C-5: the manifest script string ─────────────────────────────────────────────────────────── */
  {
    const label = 'C-5 packages/liquid-glass/package.json'
    push(label)
    if (!(await exists(MANIFEST))) {
      push('  【文件不存在】')
      blockers.push(`${label} 文件不存在`)
    } else {
      const read = await readText(MANIFEST)
      const lines = read.text.split('\n')
      const hits = lines.map((line, index) => (/^\s*"manifest":/.test(line) ? index : -1)).filter((index) => index !== -1)
      push(`  含 "manifest": 的行：${hits.length} 处（预期 1）`)
      if (hits.length !== 1) {
        blockers.push(`${label} 的 "manifest" 行命中 ${hits.length} 处（预期 1）`)
      } else {
        const index = hits[0]
        const line = lines[index]
        const at = line.indexOf(MANIFEST_OLD)
        push(`    path 的 dirname ⇒ ${PKG}`)
        if (at === -1) {
          push(`  【该行不含 ${MANIFEST_OLD}】⇒ 拒绝 apply`)
          blockers.push(`${label} 的 manifest 行不含旧路径`)
        } else {
          const after = line.slice(0, at) + MANIFEST_NEW + line.slice(at + MANIFEST_OLD.length)
          const oldAbs = resolve(PKG, MANIFEST_OLD + 'scripts/derive-manifest.mjs')
          const newAbs = resolve(PKG, MANIFEST_NEW + 'scripts/derive-manifest.mjs')
          push(`  旧：${line}`)
          push(`  新：${after}`)
          push(`    path.resolve（旧）⇒ ${oldAbs}`)
          push(`    path.resolve（新）⇒ ${newAbs}`)
          const underDev = newAbs.startsWith(join(SKIN, '.dev', 'dsh-ui-projects') + sep)
          push(`  断言 · 新路径位于 .dev\\dsh-ui-projects 之下 ⇒ ${underDev ? 'OK' : 'FAIL'}`)
          push(`  断言 · 层级 = 2（${JSON.stringify(MANIFEST_NEW)}，不是 3 级）⇒ ${countOf(MANIFEST_NEW, '../') === 2 ? 'OK' : 'FAIL'}`)
          if (!underDev) blockers.push(`${label} 新路径不在 .dev 之下`)
          if (countOf(MANIFEST_NEW, '../') !== 2) blockers.push(`${label} 的替换不是 2 级`)
          /* The JSON must still parse, and the value must have changed exactly as intended. */
          const nextLines = [...lines]
          nextLines[index] = after
          let jsonOk = true
          let reason = ''
          try { JSON.parse(nextLines.join('\n')) } catch (error) { jsonOk = false; reason = error.message }
          push(`  断言 · 改后 JSON 合法 ⇒ ${jsonOk ? 'OK' : `FAIL（${reason}）`}`)
          if (!jsonOk) blockers.push(`${label} 改后 JSON 不合法`)
          codeEdits.push({ id: label, kind: 'json', path: MANIFEST, decoded: read.decoded, text: read.text, index, before: line, after })
        }
      }
    }
    push()
  }

  /* ── V1 · before/after lines ─────────────────────────────────────────────────────────────────── */
  rule('=== V1 · 改动前后整行 ===')
  for (const edit of codeEdits) {
    push(`${edit.id}:行 ${edit.index + 1}`)
    push(`  改前：${edit.before}`)
    push(`  改后：${edit.after}`)
  }
  push()

  /* ── V2 · node --check on the rewritten .mjs sources ─────────────────────────────────────────── */
  rule('=== V2 · node --check 4 个 .mjs（改动后）===')
  push(`（临时文件写在 ${join(PKG, 'scripts')}\\.tmpcheck-<name>.mjs；检查后立即删除。node --check 只验语法、不解析 import。）`)
  for (const edit of codeEdits.filter((item) => item.kind === 'mjs')) {
    const nextLines = [...edit.text.split('\n')]
    nextLines[edit.index] = edit.after
    const tmp = join(dirname(edit.path), `.tmpcheck-${edit.path.split(sep).pop()}`)
    await writeFile(tmp, nextLines.join('\n'), 'utf8')
    const check = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const ok = check.status === 0
    push(`${edit.path.slice(SKIN.length + 1)} ⇒ ${ok ? 'PASS' : 'FAIL'}`)
    if (!ok) {
      for (const line of `${check.stderr ?? ''}`.split('\n').slice(0, 6)) if (line.trim() !== '') push(`    ${line}`)
      blockers.push(`V2 ${edit.id} 语法检查失败`)
    }
    await unlink(tmp).catch(() => {})
  }
  push()

  /* ── FS pre-checks ───────────────────────────────────────────────────────────────────────────── */
  rule('=== FS 操作前置检查 ===')
  push(`FS-1 目标目录：${DEV_DIR}`)
  push(`  ${existsSync(DEV_DIR) ? '已存在（将复用）' : '不存在（apply 时 mkdir -p）'}`)
  push()
  push(`FS-2 源 ${JUNCTION_SRC}：`)
  const srcExists = existsSync(JUNCTION_SRC)
  push(`  存在 ⇒ ${srcExists ? 'YES' : 'NO'}`)
  let srcIsLink = false
  let srcReal = '(未解析)'
  if (srcExists) {
    srcIsLink = lstatSync(JUNCTION_SRC).isSymbolicLink()
    push(`  是 junction/symlink（lstat.isSymbolicLink）⇒ ${srcIsLink ? 'YES' : 'NO'}`)
    if (srcIsLink) {
      try {
        srcReal = realpathSync(JUNCTION_SRC)
        push(`  解析目标 ⇒ ${srcReal}`)
        push(`  与预期目标一致 ⇒ ${samePath(srcReal, JUNCTION_TARGET) ? 'YES' : `NO（预期 ${JUNCTION_TARGET}）`}`)
        if (!samePath(srcReal, JUNCTION_TARGET)) blockers.push('FS-2 源的解析目标不是预期框架路径')
      } catch (error) {
        push(`  解析失败 ⇒ ${error.message}`)
        blockers.push('FS-2 源的 realpathSync 失败')
      }
    }
    if (!srcIsLink) blockers.push('FS-2 源不是 junction（lstat 报不是符号链接）')
  } else {
    blockers.push('FS-2 源不存在')
    push('  （源不存在 ⇒ 可能已经移动过，或路径不对）')
  }
  push()
  push(`FS-2 目标 ${JUNCTION_DST}：`)
  const dstExists = existsSync(JUNCTION_DST)
  push(`  ${dstExists ? '【已存在】⇒ 拒绝 apply（不覆盖）' : '不存在 ⇒ OK'}`)
  if (dstExists) blockers.push('FS-2 目标已存在')
  push()

  /* ── FS-3 / FS-4 preview ─────────────────────────────────────────────────────────────────────── */
  rule('=== FS-3 / FS-4 预览 ===')
  const gitignoreRead = (await exists(GITIGNORE)) ? await readText(GITIGNORE) : null
  if (gitignoreRead === null) {
    push(`FS-3 ${GITIGNORE}：【不存在】`)
    blockers.push('.gitignore 不存在')
  } else {
    const lines = gitignoreRead.text.split('\n')
    const stale = lines.map((line, index) => (line.trim() === GITIGNORE_STALE ? index : -1)).filter((index) => index !== -1)
    const hasNew = lines.some((line) => line.trim() === GITIGNORE_NEW)
    const eol = gitignoreRead.decoded.includes('\r\n') ? '\r\n' : '\n'
    push(`FS-3 ${GITIGNORE}`)
    push(`  将删除的旧行 ${JSON.stringify(GITIGNORE_STALE)}：${stale.length} 处${stale.length === 0 ? '（本来就没有）' : ''}`)
    push(`  是否已含 ${JSON.stringify(GITIGNORE_NEW)}：${hasNew ? 'YES（不重复添加）' : 'NO（将追加）'}`)
    push(`  检测到的行尾：${eol === '\r\n' ? 'CRLF' : 'LF'} ⇒ 追加行将使用同一种`)
    const nextLines = lines.filter((_, index) => !stale.includes(index))
    if (!hasNew) {
      if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() === '') nextLines[nextLines.length - 1] = GITIGNORE_NEW
      else nextLines.push(GITIGNORE_NEW)
    }
    push(`  改后行数：${lines.length} ⇒ ${nextLines.length}`)
    const before = gitignoreRead.text
    const after = nextLines.join('\n')
    if (before !== after) {
      codeEdits.push({ id: 'FS-3 .gitignore', kind: 'text', path: GITIGNORE, decoded: gitignoreRead.decoded, text: gitignoreRead.text, index: 0, before: `（${stale.length} 行删除${hasNew ? '' : ' + 1 行追加'}）`, after: `（见上）`, nextText: after })
    } else {
      push('  无需改动')
    }
    /* Remember the EOL choice for the apply step. */
    codeEdits[codeEdits.length - 1] && (codeEdits[codeEdits.length - 1].eol = eol)
  }
  push()
  const readmeRead = (await exists(README)) ? await readText(README) : null
  if (readmeRead === null) {
    push(`FS-4 ${README}：【不存在】`)
    blockers.push('README.md 不存在')
  } else {
    const hasSection = readmeRead.text.includes('## Development-only dependencies')
    push(`FS-4 ${README}`)
    push(`  是否已含 "## Development-only dependencies"：${hasSection ? 'YES（将跳过，避免重复）' : 'NO（将追加 ${README_SECTION.length} 行）'}`)
    if (!hasSection) {
      const before = readmeRead.text
      const after = `${before.replace(/\n*$/, '\n')}${README_SECTION.join('\n')}`
      push('  将追加的原文：')
      for (const line of README_SECTION) push(`    ${line}`)
      codeEdits.push({ id: 'FS-4 README.md', kind: 'text', path: README, decoded: readmeRead.decoded, text: readmeRead.text, index: 0, before: '（文末）', after: `（追加 ${README_SECTION.length} 行）`, nextText: after })
    }
  }
  push()

  /* ── summary ─────────────────────────────────────────────────────────────────────────────────── */
  const editable = codeEdits.filter((edit) => edit.nextText !== undefined || edit.kind === 'mjs' || edit.kind === 'json')
  const canApply = blockers.length === 0
  rule('=== 汇总 ===')
  push(`计划：4 个 FS 操作 + ${codeEdits.filter((edit) => edit.kind === 'mjs' || edit.kind === 'json').length} 处代码改动 + ${codeEdits.filter((edit) => edit.kind === 'text').length} 处文本改动`)
  for (const edit of codeEdits) push(`  · [${edit.kind}] ${edit.id} ⇒ ${edit.path}`)
  for (const warn of warns) push(`  警告：${warn}`)
  for (const blocker of blockers) push(`  阻碍：${blocker}`)
  push(`apply 可行性：${canApply ? 'YES' : 'NO'}`)
  push('--apply 顺序：FS-1 ⇒ FS-2 ⇒ C-1..C-5 ⇒ FS-3 ⇒ FS-4 ⇒ V3；任何一步失败即停，已落盘的保留，不自动回滚。')
  push()

  const header = ['# one-shot-fix-p2-problem5 report', `# mode: ${APPLY ? 'APPLY' : 'dry-run'}`, '']
  await writeFile(REPORT, `${header.join('\n')}${out.join('\n')}\n`, 'utf8')

  if (!APPLY) {
    push(`报告已写入 ${REPORT}（UTF-8）`)
    push('DRY RUN：未修改任何文件、未移动 junction。加 --apply 才落盘。')
    return
  }
  if (!canApply) {
    console.error(`\nREFUSED：${blockers.join('；')}。未修改任何文件。`)
    process.exitCode = 1
    return
  }

  /* ── apply ───────────────────────────────────────────────────────────────────────────────────── */
  const backups = []
  const writeAtomic = async (path, nextText) => {
    const tmp = `${path}.tmp`
    const bak = `${path}.bak-c2`
    await writeFile(tmp, nextText, 'utf8')
    await copyFile(path, bak)
    await rename(tmp, path)
    backups.push(bak)
  }
  const fail = async (step, error) => {
    console.error(`FAIL ${step}：${error.message}`)
    console.error('已停止；已落盘的改动保留，未落盘的不动；本脚本不自动回滚。')
    push(`FAIL ${step}：${error.message}`)
    push('已停止；已落盘的改动保留；不自动回滚。')
    await writeFile(REPORT, `${header.join('\n')}${out.join('\n')}\n`, 'utf8')
    process.exitCode = 1
  }

  rule('=== 落盘 ===')
  try {
    await mkdir(DEV_DIR, { recursive: true })
    push(`FS-1 OK  ${DEV_DIR}`)
  } catch (error) { await fail('FS-1 mkdir', error); return }

  try {
    await rename(JUNCTION_SRC, JUNCTION_DST)
    push(`FS-2 OK  junction 移动：${JUNCTION_SRC} ⇒ ${JUNCTION_DST}`)
    const real = await realpath(JUNCTION_DST).catch(() => '(realpath 失败)')
    push(`        新位置解析目标 ⇒ ${real}`)
  } catch (error) { await fail('FS-2 rename（关键前置）', error); return }

  for (const edit of codeEdits.filter((item) => item.kind === 'mjs' || item.kind === 'json')) {
    const nextText = edit.kind === 'json'
      ? [...edit.text.split('\n')].map((line, index) => (index === edit.index ? edit.after : line)).join('\n')
      : [...edit.text.split('\n')].map((line, index) => (index === edit.index ? edit.after : line)).join('\n')
    try {
      await writeAtomic(edit.path, nextText)
      push(`${edit.id} OK  ${edit.path}（备份 ${edit.path}.bak-c2）`)
    } catch (error) { await fail(edit.id, error); return }
  }

  for (const edit of codeEdits.filter((item) => item.kind === 'text')) {
    try {
      await writeAtomic(edit.path, edit.nextText)
      push(`${edit.id} OK  ${edit.path}（备份 ${edit.path}.bak-c2）`)
    } catch (error) { await fail(edit.id, error); return }
  }

  /* ── V3 · the real command, through the new path ─────────────────────────────────────────────── */
  rule('=== V3 · apply 后真实解析验证 ===')
  const command = ['../../.dev/dsh-ui-projects/scripts/derive-manifest.mjs', '--package', '.', '--check']
  push(`cwd: ${PKG}`)
  push(`node ${command.join(' ')}`)
  const v3 = spawnSync(process.execPath, command, { cwd: PKG, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  push(`退出码：${v3.status}`)
  push('stdout（前 20 行）：')
  for (const line of `${v3.stdout ?? ''}`.split('\n').slice(0, 20)) if (line.trim() !== '') push(`    ${line}`)
  push('stderr（前 20 行）：')
  for (const line of `${v3.stderr ?? ''}`.split('\n').slice(0, 20)) if (line.trim() !== '') push(`    ${line}`)
  push(v3.status === 0 ? 'V3 PASS' : 'V3 FAIL —— 报告如上，不自动回滚（是否恢复由你决定）')
  push()
  push('备份清单（本轮不删除）：')
  for (const bak of backups) push(`  · ${bak}`)

  await writeFile(REPORT, `${header.join('\n')}${out.join('\n')}\n`, 'utf8')
  push(`报告已写入 ${REPORT}（UTF-8）`)
  if (v3.status !== 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(`\nABORTED：${error.message}`)
  process.exitCode = 1
})