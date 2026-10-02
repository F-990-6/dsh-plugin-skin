#!/usr/bin/env node
/**
 * ONE-SHOT: P2-4c (2026-10-02) — make the framework peer optional, and delete the four leftovers in `meta/`.
 *
 *   1. `meta/package.json` declares `dsh-ui-projects` as a peer, and that package is not on the registry, so
 *      `npm install` 404s. Marking the peer optional is the fix. The block is replaced WHOLESALE, and whether
 *      the new block needs a trailing comma is decided by PARSING, not by reading: `JSON.parse` is tried with
 *      the comma and without it, the variant that parses is the one written, and the report says which.
 *   2. Four `.bak` files under `meta/` go. Two of them (`README.md.bak-*`) are packed by npm no matter what
 *      `files` says, because npm always includes `README*`; the other two are inert but pointless now that
 *      `known-issues.md` records where they came from.
 *
 * THE DELETIONS ARE PERMANENT AND UNBACKED. That is deliberate — they are themselves backups, and a backup of
 * a backup is noise — but it means `--apply` cannot be undone from anything this script creates. The dry run
 * says so too. Each path is checked against its own prefix and suffix before it is touched, so a renamed
 * target cannot turn this into "delete the real README".
 *
 * DRY RUN BY DEFAULT. Usage:  node scripts/one-shot-fix-p2-4c.mjs [--apply]
 */
import { readFile, writeFile, rename, copyFile, unlink, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, sep } from 'node:path'

const APPLY = process.argv.includes('--apply')
const scriptDir = dirname(fileURLToPath(import.meta.url))
const REPORT = join(scriptDir, 'one-shot-fix-p2-4c.report.txt')

const SKIN = 'E:\\dsh-plugins\\dsh-plugin-skin'
const META_DIR = join(SKIN, 'meta')
const META_MANIFEST = join(META_DIR, 'package.json')

const PEER_HEAD = /^\s*"peerDependencies":\s*\{/
const PEER_META = /^\s*"peerDependenciesMeta"\s*:/
const CLOSE_LINE = /^\s*\}/

const PEER_ENTRY = '"dsh-ui-projects": "^0.1.0"'
const NEW_BLOCK_KEY = '"peerDependenciesMeta"'

/** Exactly four, named one by one — no pattern, no directory scan. */
const BAK_FILES = [
  join(META_DIR, 'README.md.bak-legacy'),
  join(META_DIR, 'README.md.bak-p2-fix2'),
  join(META_DIR, 'package.json.bak-legacy'),
  join(META_DIR, 'package.json.bak-p2-fix2'),
]
const ALLOWED_SUFFIXES = ['.bak-legacy', '.bak-p2-fix2']

const FORBIDDEN = [join(SKIN, 'packages', 'liquid-glass') + sep]

const stripBom = (text) => text.replace(/^\uFEFF/, '')

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

  push('# one-shot: P2-4c (optional peer + four deletions in meta/)')
  push(`# mode:   ${APPLY ? 'APPLY' : 'dry-run'}`)
  push(`# report: ${REPORT}`)
  push('# 删除是永久的、且不生成备份 —— .bak 本身即备份，备份的备份无意义。')
  push()

  /* ── 编辑 1 · the peer block ─────────────────────────────────────────────────────────────────── */
  rule('=== 编辑 1 · meta peerDependenciesMeta ===')
  push(`文件：${META_MANIFEST}`)
  let edit = null
  if (!existsSync(META_MANIFEST)) {
    push('【文件不存在】')
    blockers.push('meta/package.json 不存在')
  } else {
    const read = await readText(META_MANIFEST)
    const lines = read.text.split('\n')
    const heads = lines.map((line, index) => (PEER_HEAD.test(line) ? index : -1)).filter((index) => index !== -1)
    const metas = lines.map((line, index) => (PEER_META.test(line) ? index : -1)).filter((index) => index !== -1)
    push(`含 "peerDependencies" 的行：${heads.length} 处（预期 1）`)
    push(`含 "peerDependenciesMeta" 的行：${metas.length} 处（预期 0）`)
    if (metas.length > 0) {
      for (const index of metas) push(`  行 ${index + 1}：${lines[index]}`)
      blockers.push('meta/package.json 已存在 peerDependenciesMeta')
    }
    if (heads.length !== 1) {
      blockers.push(`peerDependencies 块命中 ${heads.length} 处（预期 1）`)
      for (const index of heads) push(`  行 ${index + 1}：${lines[index]}`)
    } else if (metas.length === 0) {
      const start = heads[0]
      let end = -1
      for (let i = start + 1; i < lines.length; i += 1) {
        if (CLOSE_LINE.test(lines[i])) { end = i; break }
      }
      if (end === -1) {
        push('  未找到该块的收尾 `}` —— 拒绝 apply')
        blockers.push('peerDependencies 块找不到收尾行')
      } else {
        const block = lines.slice(start, end + 1)
        const headIndent = /^\s*/.exec(lines[start])[0]
        const entryIndent = (() => {
          for (let i = start + 1; i < end; i += 1) if (lines[i].trim() !== '') return /^\s*/.exec(lines[i])[0]
          return `${headIndent}  `
        })()
        const closeIndent = /^\s*/.exec(lines[end])[0]
        push(`定位 peerDependencies 块：行 ${start + 1} – ${end + 1}`)
        push('改前（整块）：')
        for (const line of block) push(`    ${line}`)

        /* Two candidate replacements; a parser decides which one is legal. */
        const newBlockFor = (trailingComma) => [
          `${headIndent}"peerDependencies": {`,
          ...block.slice(1, -1),
          `${closeIndent}}${trailingComma ? ',' : ''}`,
          `${headIndent}${NEW_BLOCK_KEY}: {`,
          `${entryIndent}${PEER_ENTRY.replace(/^"dsh-ui-projects"/, '"dsh-ui-projects"')},`.replace(',', ','),
          `${closeIndent}}${trailingComma ? ',' : ''}`,
        ]
        /* Simpler and exact: the meta block is one line, exactly as the brief spells it. */
        const build = (commaOnPeer, commaOnMeta) => [
          `${headIndent}"peerDependencies": {`,
          ...block.slice(1, -1),
          `${closeIndent}}${commaOnPeer ? ',' : ''}`,
          `${headIndent}"peerDependenciesMeta": {`,
          `${entryIndent}"dsh-ui-projects": { "optional": true }`,
          `${closeIndent}}${commaOnMeta ? ',' : ''}`,
        ]
        const candidates = [
          { commaOnPeer: true, commaOnMeta: false, block: build(true, false) },
          { commaOnPeer: true, commaOnMeta: true, block: build(true, true) },
          { commaOnPeer: false, commaOnMeta: false, block: build(false, false) },
        ]
        let chosen = null
        const tried = []
        for (const candidate of candidates) {
          const nextText = [...lines.slice(0, start), ...candidate.block, ...lines.slice(end + 1)].join('\n')
          try {
            JSON.parse(nextText)
            tried.push(`peer 尾逗号=${candidate.commaOnPeer} / meta 尾逗号=${candidate.commaOnMeta} ⇒ 合法`)
            if (chosen === null) chosen = { ...candidate, nextText }
          } catch (error) {
            tried.push(`peer 尾逗号=${candidate.commaOnPeer} / meta 尾逗号=${candidate.commaOnMeta} ⇒ 不合法（${error.message.split('\n')[0]}）`)
          }
        }
        push('逗号/语法候选（由 JSON.parse 判定，不由人眼判定）：')
        for (const line of tried) push(`    ${line}`)
        if (chosen === null) {
          push('  三个候选都不合法 —— 拒绝 apply（不猜）')
          blockers.push('编辑 1 无任何合法候选')
        } else {
          push('改后（整块）：')
          for (const line of chosen.block) push(`    ${line}`)
          push(`  ${NEW_BLOCK_KEY} 的收尾逗号：${chosen.commaOnMeta ? '有' : '无'}（按解析结果选定）`)
          push('JSON 合法：OK')
          edit = { id: '编辑 1', path: META_MANIFEST, text: read.text, nextText: chosen.nextText, range: [start, end], before: block.join('\n'), after: chosen.block.join('\n') }
        }
      }
    }
  }
  push()

  /* ── 删除 2 · the four leftovers ─────────────────────────────────────────────────────────────── */
  rule('=== 删除 2 · meta 下 .bak ===')
  const deletions = []
  let present = 0
  for (const path of BAK_FILES) {
    const inMeta = path.startsWith(META_DIR + sep)
    const suffixOk = ALLOWED_SUFFIXES.some((suffix) => path.endsWith(suffix))
    const forbidden = FORBIDDEN.some((prefix) => path.startsWith(prefix))
    if (!inMeta || !suffixOk || forbidden) {
      push(`${path} ⇒ 【拒绝：路径不在 meta/ 下、或后缀不是 ${ALLOWED_SUFFIXES.join(' / ')}、或落在 packages/liquid-glass/ 内】`)
      blockers.push(`删除目标不合法：${path}`)
      continue
    }
    if (existsSync(path)) {
      const info = await stat(path)
      present += 1
      deletions.push({ path, action: 'delete', size: info.size })
      push(`${path.slice(META_DIR.length + 1)} ⇒ 存在（${info.size} 字节，将删除；不生成备份）`)
    } else {
      deletions.push({ path, action: 'skip' })
      push(`${path.slice(META_DIR.length + 1)} ⇒ 未找到（跳过）`)
    }
  }
  push(`实际将删除数：${present} / ${BAK_FILES.length}`)
  push('说明：README.md.bak-* 即使被 files 白名单排除，npm 仍会因 README* 前缀强制打包，故必须删除。')
  push()

  /* ── checks ──────────────────────────────────────────────────────────────────────────────────── */
  rule('=== 前置检查 ===')
  push(`${edit !== null ? 'OK  ' : 'FAIL'} · 编辑 1 命中 1 处`)
  push(`${edit !== null ? 'OK  ' : 'FAIL'} · JSON 合法`)
  push(`INFO · 删除目标中存在的：${present} / ${BAK_FILES.length}（存在性不足不是阻碍，按存在性处理）`)
  push()

  /* ── summary ─────────────────────────────────────────────────────────────────────────────────── */
  const canApply = blockers.length === 0 && edit !== null
  rule('=== 汇总 ===')
  push(`计划：1 处编辑 + ${present} 个文件删除`)
  if (edit !== null) push(`  · [编辑] ${edit.path}（行 ${edit.range[0] + 1} – ${edit.range[1] + 1} 整块替换）`)
  for (const entry of deletions.filter((item) => item.action === 'delete')) push(`  · [删除] ${entry.path}`)
  for (const blocker of blockers) push(`  阻碍：${blocker}`)
  push(`apply 可行性：${canApply ? 'YES' : 'NO'}`)
  push('⚠️ apply 会【永久删除】上面列出的文件，且不生成备份 —— 这是本轮指令的选择。')
  push()

  const header = ['# one-shot-fix-p2-4c report', `# mode: ${APPLY ? 'APPLY' : 'dry-run'}`, '']
  await writeFile(REPORT, `${header.join('\n')}${out.join('\n')}\n`, 'utf8')

  if (!APPLY) {
    push(`报告已写入 ${REPORT}（UTF-8）`)
    push('DRY RUN：未修改任何文件、未删除任何文件。加 --apply 才落盘。')
    return
  }
  if (!canApply) {
    console.error(`\nREFUSED：${blockers.join('；')}。未修改任何文件。`)
    process.exitCode = 1
    return
  }

  /* ── apply ───────────────────────────────────────────────────────────────────────────────────── */
  rule('=== 落盘 ===')
  const tmp = `${edit.path}.tmp`
  const bak = `${edit.path}.bak-p2-4c`
  try {
    await writeFile(tmp, edit.nextText, 'utf8') /* no BOM: stripped on read */
    await copyFile(edit.path, bak)
    await rename(tmp, edit.path)
    push(`编辑 1 OK  ${edit.path}（备份 ${bak}）`)
  } catch (error) {
    console.error(`FAIL 编辑 1：${error.message}`)
    console.error('已停止；未执行任何删除；不自动回滚。')
    await unlink(tmp).catch(() => {})
    await writeFile(REPORT, `${header.join('\n')}${out.join('\n')}\n`, 'utf8')
    process.exitCode = 1
    return
  }

  push('删除报告（永久，不生成备份）：')
  const results = []
  for (const entry of deletions) {
    if (entry.action === 'skip') {
      results.push(`not found · ${entry.path}`)
      push(`  not found · ${entry.path}`)
      continue
    }
    try {
      await unlink(entry.path)
      results.push(`deleted · ${entry.path}`)
      push(`  deleted   · ${entry.path}`)
    } catch (error) {
      results.push(`FAILED · ${entry.path}（${error.message}）`)
      push(`  FAILED    · ${entry.path}（${error.message}）`)
      process.exitCode = 1
    }
  }
  push()
  push(`已删除 ${results.filter((line) => line.startsWith('deleted')).length} / ${present} 个存在的目标`)
  push(`备份：${bak}（仅编辑 1；删除的文件没有备份）`)
  push('本脚本不自动运行任何套件 —— 建议之后手动跑：npm pack --dry-run（在 meta 里）确认 tarball 干净。')

  await writeFile(REPORT, `${header.join('\n')}${out.join('\n')}\n`, 'utf8')
  push(`报告已写入 ${REPORT}（UTF-8）`)
}

main().catch((error) => {
  console.error(`\nABORTED，未修改任何文件：${error.message}`)
  process.exitCode = 1
})