#!/usr/bin/env node
/**
 * ONE-SHOT: P2-3 LEGACY (2026-10-02) — a caret on the meta dependency, and a prerequisites section in its
 * README.
 *
 * TWO EDITS, BOTH COUNT-GUARDED.
 *   1. `meta/package.json` pins the liquid-glass skin at `1.0.0`. A meta package whose whole purpose is to
 *      carry skins must accept a compatible newer one, so the value becomes `^1.0.0`. The edit is a
 *      value-string swap on exactly one line — if the line is missing, or already carries a caret, this
 *      refuses rather than rewriting the manifest to say something nobody asked for.
 *   2. `meta/README.md` tells the reader to install two packages in one command without saying that the
 *      framework has to be there first. The `## For users` section is replaced — HEADING KEPT, body only —
 *      because the brief's replacement text starts with `**Prerequisites**` and contains no heading: writing
 *      it over the heading as well would leave the document without one. Both the before and the after are
 *      printed in full so that choice is visible and can be vetoed.
 *
 * BOMs ARE STRIPPED ON READ (PowerShell 5.1 writes UTF-8 with one) and Node writes none back. Line endings
 * are untouched: text is split on `\n` only, so a `\r` stays where it was.
 *
 * DRY RUN BY DEFAULT. `--apply` writes `<file>.tmp`, copies the original to `<file>.bak-legacy`, then renames.
 *
 * Usage:  node scripts/one-shot-fix-p2-3-legacy.mjs
 *         node scripts/one-shot-fix-p2-3-legacy.mjs --apply
 */
import { readFile, writeFile, rename, copyFile, unlink, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const APPLY = process.argv.includes('--apply')
const scriptDir = dirname(fileURLToPath(import.meta.url))
const REPORT = join(scriptDir, 'one-shot-fix-p2-3-legacy.report.txt')

const META = 'E:\\dsh-plugins\\dsh-plugin-skin\\meta'
const META_MANIFEST = join(META, 'package.json')
const META_README = join(META, 'README.md')

const DEP_LINE = '"@xjl-resources/dsh-plugin-liquid-glass":'
const DEP_OLD_VALUE = '"1.0.0"'
const DEP_NEW_VALUE = '"^1.0.0"'

const SECTION_HEADING = /^##\s+For users\s*$/
const ANY_HEADING = /^##\s/
const NEW_SECTION_BODY = [
  '',
  '**Prerequisites**: install the framework first. The meta package carries no code; it only lists skins as dependencies.',
  '',
  '    dsh plugin add dsh-ui-projects',
  '    dsh plugin add @xjl-resources/dsh-plugin-skin',
  '',
  'Or in one step:',
  '',
  '    dsh plugin add dsh-ui-projects @xjl-resources/dsh-plugin-skin',
  '',
  'To install a single skin instead:',
  '',
  '    dsh plugin add dsh-ui-projects @xjl-resources/dsh-plugin-liquid-glass',
  '',
]

const exists = async (path) => {
  try { await stat(path); return true } catch { return false }
}
const countOf = (text, needle) => text.split(needle).length - 1
const stripBom = (content) => content.replace(/^\uFEFF/, '')
const hexHead = (buffer, count = 3) => [...buffer.subarray(0, Math.min(count, buffer.length))].map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ')

async function main() {
  const out = []
  const push = (line = '') => { out.push(line); console.log(line) }
  const rule = (title) => { push('='.repeat(100)); push(title); push('='.repeat(100)) }
  const blockers = []
  const edits = []

  push('# one-shot: P2-3 legacy fixes (meta version caret + README prerequisites)')
  push(`# mode:   ${APPLY ? 'APPLY' : 'dry-run'}`)
  push(`# report: ${REPORT}`)
  push('# 读 → strip BOM → 编辑 → writeFile(…, "utf8")（无 BOM）；行尾不动')
  push()

  /* ── 遗留 1 · the dependency value ───────────────────────────────────────────────────────────── */
  rule('=== 遗留 1 · meta 版本号 ===')
  push(`文件：${META_MANIFEST}`)
  if (!(await exists(META_MANIFEST))) {
    push('【文件不存在】')
    blockers.push('meta/package.json 不存在')
  } else {
    const raw = await readFile(META_MANIFEST)
    const text = stripBom(raw.toString('utf8'))
    push(`原首字节：${hexHead(raw)}`)
    const lines = text.split('\n')
    const hits = []
    lines.forEach((line, index) => {
      if (line.includes(DEP_LINE)) hits.push(index)
    })
    push(`含 ${DEP_LINE} 的行：${hits.length} 处（预期 1）`)
    if (hits.length !== 1) {
      blockers.push(`遗留 1 命中 ${hits.length} 处（预期 1）`)
      for (const index of hits) push(`  行 ${index + 1}：${lines[index]}`)
    } else {
      const index = hits[0]
      const before = lines[index]
      push(`命中：行 ${index + 1}（唯一）`)
      push(`改前：${before}`)
      if (!before.includes(DEP_OLD_VALUE)) {
        push(`  ⇒ 该行不含 ${DEP_OLD_VALUE}（可能已改成别的值）—— 拒绝 apply，不猜`)
        blockers.push(`遗留 1 的当前值不是 ${DEP_OLD_VALUE}`)
      } else if (countOf(before, DEP_OLD_VALUE) !== 1) {
        push(`  ⇒ 该行内 ${DEP_OLD_VALUE} 出现 ${countOf(before, DEP_OLD_VALUE)} 次 —— 拒绝 apply`)
        blockers.push(`遗留 1 的目标值在该行内不唯一`)
      } else {
        const after = before.split(DEP_OLD_VALUE).join(DEP_NEW_VALUE)
        push(`改后：${after}`)
        const nextLines = [...lines]
        nextLines[index] = after
        const nextText = nextLines.join('\n')
        let jsonOk = true
        let reason = ''
        try {
          JSON.parse(nextText)
        } catch (error) {
          jsonOk = false
          reason = error.message
        }
        push(`JSON 合法：${jsonOk ? 'OK' : `FAIL（${reason}）`}`)
        if (!jsonOk) blockers.push(`遗留 1 编辑后 JSON 不合法：${reason}`)
        else edits.push({ id: '遗留 1', path: META_MANIFEST, decoded: raw.toString('utf8'), text, nextText, raw })
      }
    }
  }
  push()

  /* ── 遗留 2 · the README section ─────────────────────────────────────────────────────────────── */
  rule('=== 遗留 2 · meta README ===')
  push(`文件：${META_README}`)
  if (!(await exists(META_README))) {
    push('【文件不存在】')
    blockers.push('meta/README.md 不存在')
  } else {
    const raw = await readFile(META_README)
    const text = stripBom(raw.toString('utf8'))
    push(`原首字节：${hexHead(raw)}`)
    const lines = text.split('\n')
    const headingIndexes = []
    lines.forEach((line, index) => {
      if (SECTION_HEADING.test(line)) headingIndexes.push(index)
    })
    push(`含 "## For users" 的行：${headingIndexes.length} 处（预期 1）`)
    if (headingIndexes.length !== 1) {
      blockers.push(`遗留 2 的 "## For users" 命中 ${headingIndexes.length} 处（预期 1）`)
      for (const index of headingIndexes) push(`  行 ${index + 1}：${lines[index]}`)
    } else {
      const start = headingIndexes[0]
      let end = lines.length /* exclusive: the next `## ` heading, or EOF */
      for (let i = start + 1; i < lines.length; i += 1) {
        if (ANY_HEADING.test(lines[i])) { end = i; break }
      }
      push(`段起止：行 ${start + 1} – ${end}（标题行保留，替换标题之后的正文）`)
      push('改前全文（标题行之后、下一个 ## 之前）：')
      for (let i = start + 1; i < end; i += 1) push(`  ${String(i + 1).padStart(4)}| ${lines[i]}`)
      const nextLines = [...lines.slice(0, start + 1), ...NEW_SECTION_BODY, ...lines.slice(end)]
      push('改后全文（同一区间，替换后）：')
      const afterStart = start + 1
      for (let i = afterStart; i < afterStart + NEW_SECTION_BODY.length; i += 1) push(`  ${String(i + 1).padStart(4)}| ${nextLines[i]}`)
      push('（说明：标题 `## For users` 本身保留 —— 你给的新段以 `**Prerequisites**` 开头、不含标题，')
      push('  若连标题一起替换，文档会丢掉这个小节标题。前/后全文已列出，若你要连标题一起换，请指出。）')
      const nextText = nextLines.join('\n')
      const sizeDelta = Buffer.byteLength(nextText, 'utf8') - raw.length
      push(`字节数：${raw.length} ⇒ ${Buffer.byteLength(nextText, 'utf8')}（Δ${sizeDelta}）`)
      edits.push({ id: '遗留 2', path: META_README, decoded: raw.toString('utf8'), text, nextText, raw })
    }
  }
  push()

  /* ── guard summary ───────────────────────────────────────────────────────────────────────────── */
  rule('=== 前置检查 ===')
  const has = (id) => edits.some((edit) => edit.id === id)
  push(`${has('遗留 1') ? 'OK  ' : 'FAIL'} · 编辑 1 命中 1 处`)
  push(`${has('遗留 2') ? 'OK  ' : 'FAIL'} · 编辑 2 命中 1 处`)
  const jsonOk = has('遗留 1')
  push(`${jsonOk ? 'OK  ' : 'FAIL'} · JSON 合法（编辑 1 后）`)
  push()

  /* ── summary ─────────────────────────────────────────────────────────────────────────────────── */
  const canApply = blockers.length === 0 && edits.length === 2
  rule('=== 汇总 ===')
  push(`计划：${edits.length} 处编辑（预期 2）`)
  for (const edit of edits) push(`  · ${edit.id} ⇒ ${edit.path}`)
  for (const blocker of blockers) push(`  阻碍：${blocker}`)
  push(`apply 可行性：${canApply ? 'YES' : 'NO'}`)
  push('不碰 junction、不碰 packages/liquid-glass/*；不做临时文件预检；不自动回滚。')
  push('--apply 为每个文件生成 .bak-legacy，且不删除它们。')
  push()

  const header = ['# one-shot-fix-p2-3-legacy report', `# mode: ${APPLY ? 'APPLY' : 'dry-run'}`, '']
  await writeFile(REPORT, `${header.join('\n')}${out.join('\n')}\n`, 'utf8')

  if (!APPLY) {
    push(`报告已写入 ${REPORT}（UTF-8）`)
    push('DRY RUN：未修改任何文件。加 --apply 才落盘。')
    return
  }
  if (!canApply) {
    console.error(`\nREFUSED：${blockers.join('；') || `可用编辑 ${edits.length} 处（预期 2）`}。未修改任何文件。`)
    process.exitCode = 1
    return
  }

  /* ── apply ───────────────────────────────────────────────────────────────────────────────────── */
  rule('=== 落盘 ===')
  const done = []
  for (const edit of edits) {
    const tmp = `${edit.path}.tmp`
    const bak = `${edit.path}.bak-legacy`
    try {
      await writeFile(tmp, edit.nextText, 'utf8') /* Node writes UTF-8 with no BOM */
      await copyFile(edit.path, bak)
      await rename(tmp, edit.path)
      const raw = await readFile(edit.path)
      done.push({ edit, newHead: hexHead(raw), newSize: raw.length, newBom: raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf })
      push(`OK   ${edit.id} ⇒ ${edit.path}（${edit.raw.length} ⇒ ${raw.length} 字节；首字节 ${hexHead(raw)}）`)
    } catch (error) {
      await unlink(tmp).catch(() => {})
      console.error(`FAIL ${edit.id}：${error.message}`)
      console.error('已停止后续写入；已完成的文件保留其 .bak-legacy。')
      process.exitCode = 1
      break
    }
  }
  push()
  push(`已落盘 ${done.length} / ${edits.length} 处`)
  push('备份清单（本轮不删除）：')
  for (const entry of done) push(`  · ${entry.edit.path}.bak-legacy`)
  push('本脚本不自动运行 verify —— 请你手动执行你惯用的校验。')
}

main().catch((error) => {
  console.error(`\nABORTED，未修改任何文件：${error.message}`)
  process.exitCode = 1
})