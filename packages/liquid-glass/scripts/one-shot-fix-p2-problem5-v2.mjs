#!/usr/bin/env node
/**
 * ONE-SHOT v2: PROBLEM 5, PLAN C2 (2026-10-02) — the same five edits, done by WHOLE-LINE REPLACEMENT.
 *
 * WHY v2. The first attempt rewrote a token inside each line, and the token's boundaries did not match the
 * spec's: the search string carried a leading quote and a trailing slash, the replacement string was silent
 * about both, so the two composed into `//` and the opening quote was lost. The fix is not a better token —
 * it is not editing a token at all. Each of the five lines is now compared as a WHOLE (trimmed) and replaced
 * as a WHOLE, with the file's own indentation put back in front. Nothing is spliced, so no boundary can be
 * mismatched.
 *
 * TWO SMALL DEVIATIONS FROM THE BRIEF, BOTH VISIBLE IN THE REPORT:
 *   · C-1..C-4 — the old line is matched by `line.trim() === oldLine.trim()`, so a file whose spacing differs
 *     from the spec matches ZERO times and refuses, rather than matching the wrong line. On a zero the script
 *     prints every line in that file that mentions `dsh-ui-projects`, so the real spelling is visible.
 *   · C-5 — the trailing comma is taken from the line that is actually in the file, not from the template. If
 *     `"manifest"` is the last property, a comma added by hand would make the JSON invalid; the JSON check
 *     below would catch it, but not adding one is better than catching it.
 *
 * FS-3 also changed with this round's brief: the stale `/packages/dsh-ui-projects/` line is LEFT ALONE, and
 * only `/.dev/` is appended. Its presence is reported as information, not edited away.
 *
 * V0 is arithmetic; `path.resolve` is lexical and does NOT follow a junction, so "same physical directory" is
 * established with `realpathSync` on the side that exists. V2 compiles the rewritten files; it does not
 * resolve imports. V3 runs the real manifest command after everything has landed, and reports the exit code
 * without rolling anything back.
 *
 * DRY RUN BY DEFAULT. Usage:  node scripts/one-shot-fix-p2-problem5-v2.mjs [--apply]
 */
import { readFile, writeFile, rename, copyFile, unlink, mkdir, realpath } from 'node:fs/promises'
import { existsSync, lstatSync, realpathSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, sep } from 'node:path'

const APPLY = process.argv.includes('--apply')
const scriptDir = dirname(fileURLToPath(import.meta.url))
const REPORT = join(scriptDir, 'one-shot-fix-p2-problem5-v2.report.txt')

const SKIN = 'E:\\dsh-plugins\\dsh-plugin-skin'
const PKG = join(SKIN, 'packages', 'liquid-glass')
const SCRIPTS = join(PKG, 'scripts')
const DEV_DIR = join(SKIN, '.dev')
const JUNCTION_SRC = join(SKIN, 'packages', 'dsh-ui-projects')
const JUNCTION_DST = join(SKIN, '.dev', 'dsh-ui-projects')
const JUNCTION_TARGET = 'E:\\dsh\\plugins\\dsh-ui-projects'
const DEV_PREFIX = join(SKIN, '.dev', 'dsh-ui-projects') + sep

/** Whole lines, verbatim from the brief. Matched trimmed; written with the file's own indentation. */
const LINE_EDITS = [
  {
    id: 'C-1',
    file: join(SCRIPTS, 'build.mjs'),
    oldLine: "import { renderBundle } from '../../dsh-ui-projects/scripts/bundle-client.mjs'",
    newLine: "import { renderBundle } from '../../../.dev/dsh-ui-projects/scripts/bundle-client.mjs'",
  },
  {
    id: 'C-2',
    file: join(SCRIPTS, 'derive-boot-css.mjs'),
    oldLine: "import { scopeCss } from '../../dsh-ui-projects/src/client/scope-css.js'",
    newLine: "import { scopeCss } from '../../../.dev/dsh-ui-projects/src/client/scope-css.js'",
  },
  {
    id: 'C-3',
    file: join(SCRIPTS, 'emitted-css.mjs'),
    oldLine: "import { scopeCss } from '../../dsh-ui-projects/src/client/scope-css.js'",
    newLine: "import { scopeCss } from '../../../.dev/dsh-ui-projects/src/client/scope-css.js'",
  },
  {
    id: 'C-4',
    file: join(SCRIPTS, 'verify.mjs'),
    oldLine: "import { scopeCss } from '../../dsh-ui-projects/src/client/scope-css.js'",
    newLine: "import { scopeCss } from '../../../.dev/dsh-ui-projects/src/client/scope-css.js'",
  },
]

const MANIFEST = join(PKG, 'package.json')
const MANIFEST_LINE = /^\s*"manifest":\s*"node /
const MANIFEST_NEW_VALUE = '"manifest": "node ../../.dev/dsh-ui-projects/scripts/derive-manifest.mjs --package . --check"'
const MANIFEST_OLD_SPEC = '../dsh-ui-projects/scripts/derive-manifest.mjs'
const MANIFEST_NEW_SPEC = '../../.dev/dsh-ui-projects/scripts/derive-manifest.mjs'

const GITIGNORE = join(SKIN, '.gitignore')
const GITIGNORE_NEW = '/.dev/'
const GITIGNORE_STALE = '/packages/dsh-ui-projects/'
const README = join(SKIN, 'README.md')
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

const FORBIDDEN = [join(SKIN, 'meta') + sep, join(PKG, 'lib') + sep, join(PKG, 'src') + sep]

const stripBom = (text) => text.replace(/^\uFEFF/, '')
const countOf = (text, needle) => text.split(needle).length - 1
const samePath = (a, b) => a.toLowerCase() === b.toLowerCase()
const hexHead = (buffer, count = 3) => [...buffer.subarray(0, Math.min(count, buffer.length))].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')

/** The quoted module specifier inside a line, or null. Used for V0 only — never for editing. */
const specifierIn = (line) => {
  const match = /(['"])((?:\.\.\/)+[^'"]+)\1/.exec(line)
  return match === null ? null : match[2]
}

async function readText(path) {
  const raw = await readFile(path)
  const decoded = raw.toString('utf8')
  return { raw, decoded, text: stripBom(decoded) }
}

async function main() {
  const out = []
  const push = (line = '') => { out.push(line); console.log(line) }
  const rule = (title) => { push('='.repeat(100)); push(title); push('='.repeat(100)) }
  const blockers = []

  push('# one-shot v2: problem 5, plan C2 — whole-line replacement')
  push(`# mode:   ${APPLY ? 'APPLY' : 'dry-run'}`)
  push(`# report: ${REPORT}`)
  push('# 编辑方式：整行 compare(trim) + 整行替换 + 原样缩进；不做任何 token replace。')
  push()

  /* ── forbidden trees ─────────────────────────────────────────────────────────────────────────── */
  const targets = [...LINE_EDITS.map((edit) => edit.file), MANIFEST, GITIGNORE, README]
  const trespass = targets.filter((path) => FORBIDDEN.some((prefix) => path.startsWith(prefix)))
  for (const path of trespass) blockers.push(`目标落在禁止目录内：${path}`)
  push(`目标文件 ${targets.length} 个；落在 meta/ · lib/ · src/ 内的：${trespass.length} 个`)
  push()

  /* ── the edit engine: whole-line match, whole-line write ─────────────────────────────────────── */
  const edits = []
  rule('=== V0 · 路径级数机械验证 ===')
  for (const spec of LINE_EDITS) {
    push(`${spec.id} ${spec.file.slice(SKIN.length + 1)}`)
    if (!existsSync(spec.file)) {
      push('  【文件不存在】')
      blockers.push(`${spec.id} 文件不存在`)
      push()
      continue
    }
    const read = await readText(spec.file)
    const lines = read.text.split('\n')
    const matches = lines.map((line, index) => (line.trim() === spec.oldLine.trim() ? index : -1)).filter((index) => index !== -1)
    push(`  整行匹配（trim 后逐字相等）：${matches.length} 处（预期 1）`)
    if (matches.length !== 1) {
      blockers.push(`${spec.id} 整行匹配 ${matches.length} 处（预期 1）`)
      push('  诊断：本文件中所有提到 dsh-ui-projects 的行：')
      let seen = 0
      lines.forEach((line, index) => {
        if (!line.includes('dsh-ui-projects')) return
        seen += 1
        if (seen <= 6) push(`    行 ${index + 1}：${line}`)
      })
      if (seen === 0) push('    （一处也没有 —— 该文件可能已改过）')
      push()
      continue
    }
    const index = matches[0]
    const indent = /^\s*/.exec(lines[index])[0]
    const newLine = `${indent}${spec.newLine}`
    push(`  命中：行 ${index + 1}（唯一）；缩进 ${JSON.stringify(indent)}`)
    push(`  改前：${lines[index]}`)
    push(`  改后：${newLine}`)

    /* V0: resolve both spellings, then prove the old one physically reaches the framework checkout. */
    const oldSpec = specifierIn(spec.oldLine)
    const newSpec = specifierIn(spec.newLine)
    const dir = dirname(spec.file)
    if (oldSpec === null || newSpec === null) {
      push('  断言 · 能从两行里提取出 specifier ⇒ FAIL（正则没匹配上）')
      blockers.push(`${spec.id} 无法从行内提取 specifier`)
      push()
      continue
    }
    const oldAbs = resolve(dir, oldSpec)
    const newAbs = resolve(dir, newSpec)
    push(`  旧 specifier：${JSON.stringify(oldSpec)}`)
    push(`    path.resolve ⇒ ${oldAbs}`)
    push(`  新 specifier：${JSON.stringify(newSpec)}`)
    push(`    path.resolve ⇒ ${newAbs}`)
    const tailOk = oldSpec.slice(oldSpec.indexOf('dsh-ui-projects') + 'dsh-ui-projects'.length) === newSpec.slice(newSpec.indexOf('dsh-ui-projects') + 'dsh-ui-projects'.length)
    const underDev = newAbs.startsWith(DEV_PREFIX)
    push(`  断言① · 两侧尾段相同（框架根之后的部分逐字相等）⇒ ${tailOk ? 'OK' : 'FAIL'}`)
    push(`  断言② · 新 resolve 结果以 ${DEV_PREFIX} 开头 ⇒ ${underDev ? 'OK' : 'FAIL'}`)
    if (!tailOk) blockers.push(`${spec.id} 两侧尾段不一致`)
    if (!underDev) blockers.push(`${spec.id} 新路径不在 .dev\\dsh-ui-projects 之下`)

    /* Physical identity. realpath follows a junction; the NEW path does not exist yet, so it is checked
       lexically above and physically only if it happens to be there already. */
    if (existsSync(oldAbs)) {
      try {
        const real = realpathSync(oldAbs)
        const targetReal = existsSync(JUNCTION_TARGET) ? realpathSync(JUNCTION_TARGET) : JUNCTION_TARGET
        const ok = real.toLowerCase().startsWith(targetReal.toLowerCase() + sep) || samePath(real, targetReal)
        push(`  物理解析（realpathSync(旧)，会跟随 junction）⇒ ${real} ⇒ ${ok ? 'OK' : 'FAIL'}（应落在 ${JUNCTION_TARGET} 之下）`)
        if (!ok) blockers.push(`${spec.id} 旧路径未解析到框架检出目录`)
      } catch (error) {
        push(`  物理解析（旧）⇒ FAIL（${error.message}）`)
        blockers.push(`${spec.id} realpathSync(旧) 失败`)
      }
    } else {
      push('  物理解析（旧）⇒ 跳过：旧路径当前不存在（junction 可能已断，或已移动过）')
      blockers.push(`${spec.id} 旧路径当前不可达`)
    }
    if (existsSync(newAbs)) {
      try {
        const real = realpathSync(newAbs)
        push(`  物理解析（新，已存在）⇒ ${real}（若已存在则与旧侧应为同一目录）`)
      } catch (error) {
        push(`  物理解析（新）⇒ FAIL（${error.message}）`)
      }
    } else {
      push('  物理解析（新）⇒ 跳过：新路径尚不存在（apply 移动 junction 之后才存在）—— 这是预期的。')
    }
    push()
    edits.push({ id: spec.id, kind: 'mjs', path: spec.file, text: read.text, index, before: lines[index], after: newLine })
  }

  /* ── C-5 · the manifest line ─────────────────────────────────────────────────────────────────── */
  push('C-5 packages/liquid-glass/package.json')
  if (!existsSync(MANIFEST)) {
    push('  【文件不存在】')
    blockers.push('C-5 文件不存在')
  } else {
    const read = await readText(MANIFEST)
    const lines = read.text.split('\n')
    const matches = lines.map((line, index) => (MANIFEST_LINE.test(line) ? index : -1)).filter((index) => index !== -1)
    push(`  行首匹配 /^\\s*"manifest":\\s*"node /：${matches.length} 处（预期 1）`)
    if (matches.length !== 1) {
      blockers.push(`C-5 的 manifest 行命中 ${matches.length} 处（预期 1）`)
      for (const index of matches) push(`    行 ${index + 1}：${lines[index]}`)
    } else {
      const index = matches[0]
      const before = lines[index]
      const indent = /^\s*/.exec(before)[0]
      const hadComma = /,\s*$/.test(before)
      /* Whole line, built from the brief's value; indentation and the trailing comma come from the file. */
      const after = `${indent}${MANIFEST_NEW_VALUE}${hadComma ? ',' : ''}`
      push(`  命中：行 ${index + 1}（唯一）；缩进 ${JSON.stringify(indent)}；原行尾逗号：${hadComma ? '有' : '无'}`)
      push(`  改前：${before}`)
      push(`  改后：${after}`)
      if (!hadComma) push('  （按原行不给逗号加逗号 —— 若它是最后一个属性，加了会让 JSON 不合法）')
      const oldAbs = resolve(PKG, MANIFEST_OLD_SPEC)
      const newAbs = resolve(PKG, MANIFEST_NEW_SPEC)
      push(`  path.resolve（旧，cwd=${PKG}）⇒ ${oldAbs}`)
      push(`  path.resolve（新）⇒ ${newAbs}`)
      const underDev = newAbs.startsWith(DEV_PREFIX)
      push(`  断言 · 新 resolve 结果以 ${DEV_PREFIX} 开头 ⇒ ${underDev ? 'OK' : 'FAIL'}`)
      if (!underDev) blockers.push('C-5 新路径不在 .dev\\dsh-ui-projects 之下')
      const nextText = [...lines].map((line, i) => (i === index ? after : line)).join('\n')
      let jsonOk = true
      let reason = ''
      try { JSON.parse(nextText) } catch (error) { jsonOk = false; reason = error.message }
      push(`  断言 · 改后 JSON 合法 ⇒ ${jsonOk ? 'OK' : `FAIL（${reason}）`}`)
      if (!jsonOk) blockers.push('C-5 改后 JSON 不合法')
      edits.push({ id: 'C-5', kind: 'json', path: MANIFEST, text: read.text, index, before, after })
    }
  }
  push()

  /* ── V1 ──────────────────────────────────────────────────────────────────────────────────────── */
  rule('=== V1 · 改动前后整行 ===')
  for (const edit of edits) {
    push(`${edit.id} ${edit.path}`)
    push(`  行号：${edit.index + 1}`)
    push(`  改前：${edit.before}`)
    push(`  改后：${edit.after}`)
  }
  push()

  /* ── V2 ──────────────────────────────────────────────────────────────────────────────────────── */
  rule('=== V2 · node --check 4 个 .mjs（改动后内容）===')
  push(`临时文件：${SCRIPTS}\\.tmpcheck-<name>.mjs（检查后立即删除；node --check 只验语法，不解析 import）`)
  for (const edit of edits.filter((item) => item.kind === 'mjs')) {
    const nextText = edit.text.split('\n').map((line, index) => (index === edit.index ? edit.after : line)).join('\n')
    const tmp = join(dirname(edit.path), `.tmpcheck-${edit.path.split(sep).pop()}`)
    await writeFile(tmp, nextText, 'utf8')
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

  /* ── FS pre-checks (unchanged from v1, which reported all OK) ────────────────────────────────── */
  rule('=== FS-1..FS-4 前置检查 ===')
  push(`FS-1 ${DEV_DIR}：${existsSync(DEV_DIR) ? '已存在（复用）' : '不存在（apply 时 mkdir -p）'}`)
  push()
  push(`FS-2 源 ${JUNCTION_SRC}：`)
  const srcExists = existsSync(JUNCTION_SRC)
  push(`  存在 ⇒ ${srcExists ? 'YES' : 'NO'}`)
  if (srcExists) {
    const isLink = lstatSync(JUNCTION_SRC).isSymbolicLink()
    push(`  是 junction/symlink（lstat.isSymbolicLink）⇒ ${isLink ? 'YES' : 'NO'}`)
    if (isLink) {
      try {
        const real = realpathSync(JUNCTION_SRC)
        push(`  解析目标 ⇒ ${real}`)
        push(`  与预期一致 ⇒ ${samePath(real, JUNCTION_TARGET) ? 'YES' : `NO（预期 ${JUNCTION_TARGET}）`}`)
        if (!samePath(real, JUNCTION_TARGET)) blockers.push('FS-2 源的解析目标不是预期框架路径')
      } catch (error) {
        push(`  解析失败 ⇒ ${error.message}`)
        blockers.push('FS-2 源 realpathSync 失败')
      }
    } else blockers.push('FS-2 源不是 junction')
  } else blockers.push('FS-2 源不存在')
  push()
  push(`FS-2 目标 ${JUNCTION_DST}：${existsSync(JUNCTION_DST) ? '【已存在】⇒ 拒绝 apply' : '不存在 ⇒ OK'}`)
  if (existsSync(JUNCTION_DST)) blockers.push('FS-2 目标已存在')
  push()

  const gitignoreExists = existsSync(GITIGNORE)
  if (!gitignoreExists) {
    push(`FS-3 ${GITIGNORE}：【不存在】`)
    blockers.push('.gitignore 不存在')
  } else {
    const read = await readText(GITIGNORE)
    const lines = read.text.split('\n')
    const hasNew = lines.some((line) => line.trim() === GITIGNORE_NEW)
    const stale = lines.some((line) => line.trim() === GITIGNORE_STALE)
    const eol = read.decoded.includes('\r\n') ? '\r\n' : '\n'
    push(`FS-3 ${GITIGNORE}`)
    push(`  已含 ${JSON.stringify(GITIGNORE_NEW)}：${hasNew ? 'YES（不重复追加）' : 'NO（将追加一行）'}`)
    push(`  行尾：${eol === '\r\n' ? 'CRLF' : 'LF'} ⇒ 追加行使用同一种`)
    push(`  INFO · 是否仍有旧行 ${JSON.stringify(GITIGNORE_STALE)}：${stale ? '有 —— 按本轮指令【不动它】（上一版会删，本版不删）' : '没有'}`)
    push(`  原文行数：${lines.length}`)
    if (!hasNew) {
      const nextLines = [...lines]
      if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() === '') nextLines[nextLines.length - 1] = GITIGNORE_NEW
      else nextLines.push(GITIGNORE_NEW)
      edits.push({ id: 'FS-3', kind: 'text', path: GITIGNORE, text: read.text, nextText: nextLines.join('\n'), index: lines.length - 1, before: `（文末，${lines.length} 行）`, after: `（追加 ${GITIGNORE_NEW}）`, eol })
    } else {
      push('  无需改动')
    }
  }
  push()

  if (!existsSync(README)) {
    push(`FS-4 ${README}：【不存在】`)
    blockers.push('README.md 不存在')
  } else {
    const read = await readText(README)
    const hasSection = read.text.includes('## Development-only dependencies')
    push(`FS-4 ${README}`)
    push(`  已含 "## Development-only dependencies"：${hasSection ? 'YES（跳过，避免重复）' : 'NO（将追加）'}`)
    if (!hasSection) {
      const nextText = `${read.text.replace(/\n*$/, '\n')}${README_SECTION.join('\n')}`
      push('  将追加的原文：')
      for (const line of README_SECTION) push(`    ${line}`)
      edits.push({ id: 'FS-4', kind: 'text', path: README, text: read.text, nextText, index: 0, before: '（文末）', after: `（追加 ${README_SECTION.length} 行）` })
    }
  }
  push()

  /* ── summary ─────────────────────────────────────────────────────────────────────────────────── */
  const canApply = blockers.length === 0
  rule('=== 汇总 ===')
  push(`计划：4 个 FS 操作 + ${edits.filter((edit) => edit.kind === 'mjs' || edit.kind === 'json').length} 处代码行替换 + ${edits.filter((edit) => edit.kind === 'text').length} 处文本追加`)
  for (const edit of edits) push(`  · [${edit.kind}] ${edit.id} ⇒ ${edit.path}`)
  for (const blocker of blockers) push(`  阻碍：${blocker}`)
  push(`apply 可行性：${canApply ? 'YES' : 'NO'}`)
  push('--apply 顺序：FS-1 ⇒ FS-2 ⇒ C-1..C-5 ⇒ FS-3 ⇒ FS-4 ⇒ V3；任一步失败即停，已落盘保留，不自动回滚。')
  push()

  const header = ['# one-shot-fix-p2-problem5-v2 report', `# mode: ${APPLY ? 'APPLY' : 'dry-run'}`, '']
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
  const fail = async (step, error) => {
    console.error(`FAIL ${step}：${error.message}`)
    console.error('已停止；已落盘的改动保留，未落盘的不动；本脚本不自动回滚。')
    push(`FAIL ${step}：${error.message}`)
    push('已停止；已落盘的改动保留；不自动回滚。')
    await writeFile(REPORT, `${header.join('\n')}${out.join('\n')}\n`, 'utf8')
    process.exitCode = 1
  }
  const writeAtomic = async (path, nextText) => {
    const tmp = `${path}.tmp`
    const bak = `${path}.bak-c2`
    /* Node writes UTF-8 with no BOM; the text handed in has already been stripped on read. */
    await writeFile(tmp, nextText, 'utf8')
    await copyFile(path, bak)
    await rename(tmp, path)
    backups.push(bak)
  }

  rule('=== 落盘 ===')
  try {
    await mkdir(DEV_DIR, { recursive: true })
    push(`FS-1 OK  ${DEV_DIR}`)
  } catch (error) { await fail('FS-1 mkdir', error); return }

  try {
    await rename(JUNCTION_SRC, JUNCTION_DST)
    push(`FS-2 OK  junction：${JUNCTION_SRC} ⇒ ${JUNCTION_DST}`)
    push(`        新位置 realpath ⇒ ${await realpath(JUNCTION_DST).catch(() => '(失败)')}`)
  } catch (error) { await fail('FS-2 rename（关键前置）', error); return }

  for (const edit of edits.filter((item) => item.kind === 'mjs' || item.kind === 'json')) {
    const nextText = edit.text.split('\n').map((line, index) => (index === edit.index ? edit.after : line)).join('\n')
    try {
      await writeAtomic(edit.path, nextText)
      push(`${edit.id} OK  ${edit.path}（备份 ${edit.path}.bak-c2）`)
    } catch (error) { await fail(edit.id, error); return }
  }

  for (const edit of edits.filter((item) => item.kind === 'text')) {
    try {
      await writeAtomic(edit.path, edit.nextText)
      push(`${edit.id} OK  ${edit.path}（备份 ${edit.path}.bak-c2）`)
    } catch (error) { await fail(edit.id, error); return }
  }

  rule('=== V3 · apply 后真实解析验证 ===')
  const argv = ['../../.dev/dsh-ui-projects/scripts/derive-manifest.mjs', '--package', '.', '--check']
  push(`cwd: ${PKG}`)
  push(`node ${argv.join(' ')}`)
  const v3 = spawnSync(process.execPath, argv, { cwd: PKG, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
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