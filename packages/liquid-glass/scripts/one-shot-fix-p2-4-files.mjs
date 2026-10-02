#!/usr/bin/env node
/**
 * ONE-SHOT: P2-4 `files` FIXES (2026-10-02) — one tarball gains a CHANGELOG, the other gains a whitelist,
 * and the borrowed-script problem gets written down.
 *
 *   1. `packages/liquid-glass/package.json` — `files` lists four entries; `CHANGELOG.md` is published by the
 *      repo but not packed, so it is added. The whole block is replaced rather than patched item by item: a
 *      block has no token boundaries to get wrong, which is exactly how the previous round's `//` bug
 *      happened. The observed indentation and the observed closing line are reused, so a trailing comma on
 *      `],` survives and a bare `]` stays bare.
 *   2. `meta/package.json` — the meta tarball had no whitelist at all, so four `.bak` files went into it.
 *      A two-entry `files` array goes in right after `"version"`, and only after checking the field is not
 *      already there.
 *   3. `docs/known-issues.md` — a new file recording that the skin package borrows the framework's
 *      `derive-manifest.mjs`, with the three options and the choice made (c). The wrapped lines of the brief
 *      are rejoined into whole paragraphs; the wording is unchanged.
 *
 * DRY RUN BY DEFAULT. `--apply` backs both edited manifests up to `.bak-p2-4` before renaming the temp file
 * into place. The new document has no backup, because there is nothing to back up.
 *
 * Usage:  node scripts/one-shot-fix-p2-4-files.mjs
 *         node scripts/one-shot-fix-p2-4-files.mjs --apply
 */
import { readFile, writeFile, rename, copyFile, unlink, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, sep } from 'node:path'

const APPLY = process.argv.includes('--apply')
const scriptDir = dirname(fileURLToPath(import.meta.url))
const REPORT = join(scriptDir, 'one-shot-fix-p2-4-files.report.txt')

const SKIN = 'E:\\dsh-plugins\\dsh-plugin-skin'
const PKG = join(SKIN, 'packages', 'liquid-glass')
const LIQUID_MANIFEST = join(PKG, 'package.json')
const META_MANIFEST = join(SKIN, 'meta', 'package.json')
const DOCS_DIR = join(SKIN, 'docs')
const KNOWN_ISSUES = join(DOCS_DIR, 'known-issues.md')

const FILES_HEAD = /^\s*"files":\s*\[/
const FILES_ITEMS = ['lib', 'cordis.patch.yml', 'install.ps1', 'README.md', 'CHANGELOG.md']
const META_FILES_ITEMS = ['README.md', 'package.json']
const VERSION_LINE = /^\s*"version":\s*"1\.0\.0"\s*,?\s*$/
const HAS_FILES_FIELD = /^\s*"files"\s*:/

const FORBIDDEN = [join(PKG, 'scripts') + sep, join(PKG, 'lib') + sep, join(PKG, 'src') + sep]

/** The document, with the brief's wrapped lines rejoined; wording unchanged. */
const KNOWN_ISSUES_TEXT = [
  '# dsh-plugin-skin · 已知问题',
  '',
  '本文件记录 monorepo 结构性问题——不阻塞日常开发、但影响长期可维护性的项目。',
  '',
  '## 1 · 皮肤包借框架包的 `derive-manifest.mjs`',
  '',
  '**事实**：`packages/liquid-glass/package.json` 的 `scripts.manifest` 指向：',
  '',
  '    node ../dsh-ui-projects/scripts/derive-manifest.mjs --package . --check',
  '',
  '`derive-manifest.mjs` **不在皮肤包里**——它属于框架包 `dsh-ui-projects`。开发时依赖 `packages/.dev/dsh-ui-projects` junction 才能跑到。',
  '',
  '**影响**：',
  '',
  '- **发布 npm 后**——皮肤包的用户装完**跑不了** `npm run manifest`——**但这是预期的**：`files` 字段不含 `scripts/`——`derive-manifest.mjs` 也不在 tarball 里——**开发工具不发布**',
  '- **开发时**——junction 断（框架包路径改名/删）——`npm run manifest` 崩——**但其他脚本（verify/build）正常**——因为它们的 import 直接走 .mjs 里写的路径',
  '',
  '**不阻塞 P2-4**——但记入——',
  '',
  '**未来修法**（可选）：',
  '',
  'a) 把 `derive-manifest.mjs` 复制一份到皮肤包的 `scripts/` 下（重复代码——易脱节）',
  'b) 抽成共享 dev 依赖——`@xjl-resources/dsh-ui-projects-dev` 之类——发布到 npm——皮肤包 devDependencies 引用',
  'c) 保持现状——**monorepo 内部开发工具**——**不发布**',
  '',
  '当前选 c。',
  '',
]

const stripBom = (text) => text.replace(/^\uFEFF/, '')

async function readText(path) {
  const raw = await readFile(path)
  const decoded = raw.toString('utf8')
  return { raw, decoded, text: stripBom(decoded), eol: decoded.includes('\r\n') ? '\r\n' : '\n' }
}

async function main() {
  const out = []
  const push = (line = '') => { out.push(line); console.log(line) }
  const rule = (title) => { push('='.repeat(100)); push(title); push('='.repeat(100)) }
  const blockers = []
  const edits = []

  push('# one-shot: P2-4 files fixes')
  push(`# mode:   ${APPLY ? 'APPLY' : 'dry-run'}`)
  push(`# report: ${REPORT}`)
  push('# 编辑用整块/整行替换；不做 token patch；未编辑行逐字节不变。')
  push()

  /* ── forbidden trees ─────────────────────────────────────────────────────────────────────────── */
  const targets = [LIQUID_MANIFEST, META_MANIFEST, KNOWN_ISSUES]
  const trespass = targets.filter((path) => FORBIDDEN.some((prefix) => path.startsWith(prefix)))
  for (const path of trespass) blockers.push(`目标落在禁止目录内：${path}`)
  push(`目标 3 个；落在 scripts/ · lib/ · src/ 内的：${trespass.length} 个`)
  push()

  /* ── 编辑 1 · the liquid-glass files block ───────────────────────────────────────────────────── */
  rule('=== 编辑 1 · liquid-glass files ===')
  let liquidEol = '\n'
  push(`文件：${LIQUID_MANIFEST}`)
  if (!existsSync(LIQUID_MANIFEST)) {
    push('【文件不存在】')
    blockers.push('编辑 1 的文件不存在')
  } else {
    const read = await readText(LIQUID_MANIFEST)
    liquidEol = read.eol
    const lines = read.text.split('\n')
    const heads = lines.map((line, index) => (FILES_HEAD.test(line) ? index : -1)).filter((index) => index !== -1)
    push(`行首匹配 /^\\s*"files":\\s*\\[/：${heads.length} 处（预期 1）`)
    if (heads.length !== 1) {
      blockers.push(`编辑 1 的 files 块命中 ${heads.length} 处（预期 1）`)
      for (const index of heads) push(`  行 ${index + 1}：${lines[index]}`)
    } else {
      const start = heads[0]
      let end = -1
      for (let i = start + 1; i < lines.length; i += 1) {
        if (lines[i].trim() === ']' || lines[i].trim() === '],') { end = i; break }
      }
      if (end === -1) {
        push('  未找到该数组的收尾 `]` —— 拒绝 apply')
        blockers.push('编辑 1 找不到 files 数组的收尾行')
      } else {
        const block = lines.slice(start, end + 1)
        const headIndent = /^\s*/.exec(lines[start])[0]
        const itemIndent = (() => {
          for (let i = start + 1; i < end; i += 1) if (lines[i].trim() !== '') return /^\s*/.exec(lines[i])[0]
          return `${headIndent}  `
        })()
        const items = block.slice(1, -1).map((line) => line.trim()).filter((line) => line !== '')
        const names = items.map((item) => item.replace(/,\s*$/, ''))
        push(`命中：行 ${start + 1} – ${end + 1}（files 整块，${block.length} 行）`)
        push('改前：')
        for (const line of block) push(`    ${line}`)
        push(`  项数：${items.length}（预期 4）；项名：${names.map((name) => JSON.stringify(name)).join(', ')}`)
        const fourOk = items.length === 4
        const readmeIndex = names.indexOf('"README.md"')
        const readmeNoComma = readmeIndex !== -1 && !/,\s*$/.test(items[readmeIndex])
        push(`  前置：项数恰为 4 ⇒ ${fourOk ? 'OK' : 'FAIL'}；"README.md" 无尾逗号 ⇒ ${readmeNoComma ? 'OK' : 'FAIL'}`)
        if (!fourOk) blockers.push(`编辑 1 的 files 数组项数为 ${items.length}（预期 4）`)
        if (!readmeNoComma) blockers.push('编辑 1 的 "README.md" 项已带尾逗号或不存在')
        if (fourOk && readmeNoComma) {
          /* Whole-block replacement: reuse the observed head indent, item indent and closing line. */
          const nextBlock = [
            `${headIndent}"files": [`,
            ...FILES_ITEMS.map((name, index) => `${itemIndent}"${name}"${index === FILES_ITEMS.length - 1 ? '' : ','}`),
            lines[end],
          ]
          push('改后：')
          for (const line of nextBlock) push(`    ${line}`)
          const nextText = [...lines.slice(0, start), ...nextBlock, ...lines.slice(end + 1)].join('\n')
          let jsonOk = true
          let reason = ''
          try { JSON.parse(nextText) } catch (error) { jsonOk = false; reason = error.message }
          push(`JSON 合法：${jsonOk ? 'OK' : `FAIL（${reason}）`}`)
          if (!jsonOk) blockers.push(`编辑 1 改后 JSON 不合法：${reason}`)
          else edits.push({ id: '编辑 1', kind: 'json', path: LIQUID_MANIFEST, text: read.text, nextText, range: [start, end], before: block.join('\n'), after: nextBlock.join('\n') })
        }
      }
    }
  }
  push()

  /* ── 编辑 2 · the meta files whitelist ───────────────────────────────────────────────────────── */
  rule('=== 编辑 2 · meta files ===')
  push(`文件：${META_MANIFEST}`)
  let metaEol = '\n'
  if (!existsSync(META_MANIFEST)) {
    push('【文件不存在】')
    blockers.push('编辑 2 的文件不存在')
  } else {
    const read = await readText(META_MANIFEST)
    metaEol = read.eol
    const lines = read.text.split('\n')
    const hasFiles = lines.filter((line) => HAS_FILES_FIELD.test(line))
    push(`已有 "files" 字段的行：${hasFiles.length} 处（预期 0）`)
    for (const line of hasFiles) push(`    ${line.trim()}`)
    if (hasFiles.length !== 0) blockers.push('编辑 2 的文件已存在 files 字段')
    const versions = lines.map((line, index) => (VERSION_LINE.test(line) ? index : -1)).filter((index) => index !== -1)
    push(`行首匹配 /^\\s*"version":\\s*"1\\.0\\.0"\\s*,?\\s*$/：${versions.length} 处（预期 1）`)
    if (versions.length !== 1) {
      blockers.push(`编辑 2 的 version 行命中 ${versions.length} 处（预期 1）`)
      for (const index of versions) push(`  行 ${index + 1}：${lines[index]}`)
    } else {
      const index = versions[0]
      const indent = /^\s*/.exec(lines[index])[0]
      const insert = [
        `${indent}"files": [`,
        `${indent}  "README.md",`,
        `${indent}  "package.json"`,
        `${indent}],`,
      ]
      push(`插入位置：行 ${index + 1}（"version" 行之后）；缩进 ${JSON.stringify(indent)}`)
      push(`插入内容（${insert.length} 行）：`)
      for (const line of insert) push(`    ${line}`)
      const nextText = [...lines.slice(0, index + 1), ...insert, ...lines.slice(index + 1)].join('\n')
      let jsonOk = true
      let reason = ''
      try { JSON.parse(nextText) } catch (error) { jsonOk = false; reason = error.message }
      push(`JSON 合法：${jsonOk ? 'OK' : `FAIL（${reason}）`}`)
      if (!jsonOk) blockers.push(`编辑 2 改后 JSON 不合法：${reason}`)
      else edits.push({ id: '编辑 2', kind: 'json', path: META_MANIFEST, text: read.text, nextText, range: [index + 1, index + insert.length], before: `（行 ${index + 1}）${lines[index]}`, after: insert.join('\n') })
    }
  }
  push()

  /* ── 编辑 3 · the new document ───────────────────────────────────────────────────────────────── */
  rule('=== 编辑 3 · known-issues.md 新建 ===')
  push(`路径：${KNOWN_ISSUES}`)
  if (existsSync(KNOWN_ISSUES)) {
    const info = await stat(KNOWN_ISSUES)
    push(`【目标已存在】（${info.size} 字节）⇒ 拒绝 apply（不覆盖）`)
    blockers.push('编辑 3 的目标文件已存在')
  } else {
    /* Follow the edited manifests' line ending so the new file is not the odd one out. */
    const eol = liquidEol === '\r\n' || metaEol === '\r\n' ? '\r\n' : '\n'
    const text = `${KNOWN_ISSUES_TEXT.join(eol)}`
    push(`目录 ${DOCS_DIR}：${existsSync(DOCS_DIR) ? '已存在（复用）' : '不存在（apply 时 mkdir -p）'}`)
    push(`大小：${Buffer.byteLength(text, 'utf8')} 字节（新文件）`)
    push(`行尾：${eol === '\r\n' ? 'CRLF' : 'LF'}（跟随被编辑的两个 package.json）`)
    push(`行数：${KNOWN_ISSUES_TEXT.length}`)
    push(`首行：${KNOWN_ISSUES_TEXT[0]}`)
    push('全文预览：')
    for (const line of KNOWN_ISSUES_TEXT) push(`    ${line}`)
    push('（说明：你的指令里为方便阅读而折行的段落，已合并为整段；措辞未改。）')
    edits.push({ id: '编辑 3', kind: 'new', path: KNOWN_ISSUES, text, range: [1, KNOWN_ISSUES_TEXT.length], before: '（新文件）', after: `${KNOWN_ISSUES_TEXT.length} 行` })
  }
  push()

  /* ── checks ──────────────────────────────────────────────────────────────────────────────────── */
  rule('=== 前置检查 ===')
  const has = (id) => edits.some((edit) => edit.id === id)
  push(`${has('编辑 1') ? 'OK  ' : 'FAIL'} · 编辑 1 命中 1 处`)
  push(`${has('编辑 2') ? 'OK  ' : 'FAIL'} · 编辑 2 命中 1 处`)
  push(`${has('编辑 3') ? 'OK  ' : 'FAIL'} · 编辑 3 目标文件不存在（全新）`)
  const bothJson = ['编辑 1', '编辑 2'].every((id) => {
    const edit = edits.find((item) => item.id === id)
    if (edit === undefined) return false
    try { JSON.parse(edit.nextText); return true } catch { return false }
  })
  push(`${bothJson ? 'OK  ' : 'FAIL'} · 2 JSON 合法`)
  push()

  /* ── summary ─────────────────────────────────────────────────────────────────────────────────── */
  const canApply = blockers.length === 0 && edits.length === 3
  rule('=== 汇总 ===')
  push(`计划：${edits.filter((edit) => edit.kind === 'json').length} 处编辑 + ${edits.filter((edit) => edit.kind === 'new').length} 处新建`)
  for (const edit of edits) push(`  · [${edit.kind}] ${edit.id} ⇒ ${edit.path}`)
  for (const blocker of blockers) push(`  阻碍：${blocker}`)
  push(`apply 可行性：${canApply ? 'YES' : 'NO'}`)
  push('--apply：2 个既有文件写 .tmp → .bak-p2-4 → rename；known-issues.md 直接新写（无备份）。不自动回滚。')
  push()

  const header = ['# one-shot-fix-p2-4-files report', `# mode: ${APPLY ? 'APPLY' : 'dry-run'}`, '']
  await writeFile(REPORT, `${header.join('\n')}${out.join('\n')}\n`, 'utf8')

  if (!APPLY) {
    push(`报告已写入 ${REPORT}（UTF-8）`)
    push('DRY RUN：未修改任何文件。加 --apply 才落盘。')
    return
  }
  if (!canApply) {
    console.error(`\nREFUSED：${blockers.join('；') || `可用编辑 ${edits.length} 处（预期 3）`}。未修改任何文件。`)
    process.exitCode = 1
    return
  }

  /* ── apply ───────────────────────────────────────────────────────────────────────────────────── */
  rule('=== 落盘 ===')
  const backups = []
  const fail = async (step, error) => {
    console.error(`FAIL ${step}：${error.message}`)
    console.error('已停止；已落盘的保留，未落盘的不动；不自动回滚。')
    push(`FAIL ${step}：${error.message}`)
    await writeFile(REPORT, `${header.join('\n')}${out.join('\n')}\n`, 'utf8')
    process.exitCode = 1
  }

  for (const edit of edits.filter((item) => item.kind === 'json')) {
    const tmp = `${edit.path}.tmp`
    const bak = `${edit.path}.bak-p2-4`
    try {
      await writeFile(tmp, edit.nextText, 'utf8') /* no BOM: text was stripped on read */
      await copyFile(edit.path, bak)
      await rename(tmp, edit.path)
      backups.push(bak)
      push(`${edit.id} OK  ${edit.path}（备份 ${bak}）`)
    } catch (error) { await fail(edit.id, error); return }
  }

  const newEdit = edits.find((item) => item.kind === 'new')
  if (newEdit !== undefined) {
    try {
      await mkdir(DOCS_DIR, { recursive: true })
      await writeFile(newEdit.path, newEdit.text, 'utf8')
      const info = await stat(newEdit.path)
      push(`${newEdit.id} OK  ${newEdit.path}（新文件，${info.size} 字节，无备份）`)
    } catch (error) { await fail(newEdit.id, error); return }
  }

  push()
  push(`已落盘 ${edits.length} / 3 处`)
  push('备份清单（本轮不删除）：')
  for (const bak of backups) push(`  · ${bak}`)
  push('known-issues.md 为新建文件，无备份。')
  push('本脚本不自动运行任何套件 —— 建议你之后手动跑：npm pack --dry-run（在 packages/liquid-glass 与 meta 各一次）。')

  await writeFile(REPORT, `${header.join('\n')}${out.join('\n')}\n`, 'utf8')
  push(`报告已写入 ${REPORT}（UTF-8）`)
}

main().catch((error) => {
  console.error(`\nABORTED，未修改任何文件：${error.message}`)
  process.exitCode = 1
})