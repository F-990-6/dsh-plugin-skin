#!/usr/bin/env node
/**
 * ONE-SHOT: FIX THE P2-1 SKELETON (2026-10-02) — three files, three edits, no relocation.
 *
 * WHY. The skeleton's `workspaces` pattern `packages/*` matched the junction
 * `packages/dsh-ui-projects` → `E:\dsh\plugins\dsh-ui-projects`, so the framework package was adopted as a
 * member of the skin monorepo — it would then be installed, versioned and published as if it lived there.
 * Naming the one real member fixes it without moving the junction, and the two `"private": true` lines go
 * for the same publishing reason.
 *
 * EVERY EDIT IS COUNT-GUARDED AND JSON-CHECKED. A count of zero is refused as firmly as a count of two:
 * `"packages/*"` missing means this file was already patched, and re-running a patch on top of itself is how
 * a manifest ends up half-edited. Deleting a `"private": true,` line can also leave a trailing comma in front
 * of `}` — which is invalid JSON — so every result is parsed before anything is written, and a failure is
 * reported with the reason instead of being written and discovered later.
 *
 * DRY RUN BY DEFAULT. `--apply` writes `<file>.tmp`, copies the original to `<file>.bak-p2-fix`, then
 * renames. The backups are NOT deleted: when to clear them is the user's decision.
 *
 * Usage:  node scripts/one-shot-fix-p2-skeleton.mjs
 *         node scripts/one-shot-fix-p2-skeleton.mjs --apply
 */
import { readFile, writeFile, rename, copyFile, unlink, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const APPLY = process.argv.includes('--apply')
const scriptDir = dirname(fileURLToPath(import.meta.url))
const REPORT = join(scriptDir, 'one-shot-fix-p2-skeleton.report.txt')

const SKIN_ROOT = 'E:\\dsh-plugins\\dsh-plugin-skin'
const PATHS = {
  skinManifest: join(SKIN_ROOT, 'package.json'),
  liquidGlass: join(SKIN_ROOT, 'packages', 'liquid-glass', 'package.json'),
  meta: join(SKIN_ROOT, 'meta', 'package.json'),
}

/** Edit 1: one token, exactly once. */
const WORKSPACE_TOKEN = '"packages/*"'
const WORKSPACE_REPLACEMENT = '"packages/liquid-glass"'
/** Edits 2 and 3: the whole line goes. */
const PRIVATE_LINE = /^\s*"private":\s*true\s*,?\s*$/

const exists = async (path) => {
  try { await stat(path); return true } catch { return false }
}
const countOf = (text, needle) => text.split(needle).length - 1

async function main() {
  const out = []
  const push = (line = '') => { out.push(line); console.log(line) }
  const rule = (title) => { push('='.repeat(100)); push(title); push('='.repeat(100)) }
  const blockers = []
  const edits = []

  push('# one-shot: fix the P2-1 skeleton (workspaces token + two private flags)')
  push(`# mode:   ${APPLY ? 'APPLY' : 'dry-run'}`)
  push(`# report: ${REPORT}`)
  push('# 不重做 P2-1、不移动 junction、不碰 packages/liquid-glass/scripts/')
  push()

  /* ── 编辑 1 · workspaces token ───────────────────────────────────────────────────────────────── */
  rule('=== 编辑 1 · workspaces ===')
  push(`文件：${PATHS.skinManifest}`)
  if (!(await exists(PATHS.skinManifest))) {
    push('【文件不存在】')
    blockers.push('编辑 1 的文件不存在')
  } else {
    const text = await readFile(PATHS.skinManifest, 'utf8')
    const hits = countOf(text, WORKSPACE_TOKEN)
    push(`token ${WORKSPACE_TOKEN} 命中：${hits} 处（预期 1）`)
    const lines = text.split('\n')
    const lineIndex = lines.findIndex((line) => line.includes(WORKSPACE_TOKEN))
    if (hits !== 1) {
      push(`  ⇒ 拒绝 apply（命中 ≠ 1${hits === 0 ? '：可能已被改过' : ''}）`)
      blockers.push(`编辑 1 的 token 命中 ${hits} 处（预期 1）`)
      for (let i = 0; i < lines.length; i += 1) if (lines[i].includes('workspaces')) push(`    参考 行 ${i + 1}：${lines[i]}`)
    } else {
      const before = lines[lineIndex]
      const after = before.split(WORKSPACE_TOKEN).join(WORKSPACE_REPLACEMENT)
      push(`命中：行 ${lineIndex + 1}（唯一）`)
      push(`改前：${before}`)
      push(`改后：${after}`)
      const nextText = text.split(WORKSPACE_TOKEN).join(WORKSPACE_REPLACEMENT)
      push('上下文（±4 行）：')
      for (let i = Math.max(0, lineIndex - 4); i <= Math.min(lines.length - 1, lineIndex + 4); i += 1) {
        push(`  ${String(i + 1).padStart(4)}| ${nextText.split('\n')[i]}${i === lineIndex ? '   <-- 已替换' : ''}`)
      }
      edits.push({ id: '编辑 1 · workspaces', path: PATHS.skinManifest, text, nextText, kind: 'replace' })
    }
  }
  push()

  /* ── 编辑 2 与 3 · delete the `"private": true` line ─────────────────────────────────────────── */
  const deletions = [
    { id: '编辑 2 · 液体玻璃 private', path: PATHS.liquidGlass },
    { id: '编辑 3 · meta private', path: PATHS.meta },
  ]
  for (const deletion of deletions) {
    rule(`=== ${deletion.id} ===`)
    push(`文件：${deletion.path}`)
    if (!(await exists(deletion.path))) {
      push('【文件不存在】')
      blockers.push(`${deletion.id} 的文件不存在`)
      push()
      continue
    }
    const text = await readFile(deletion.path, 'utf8')
    const lines = text.split('\n')
    const hits = []
    lines.forEach((line, index) => {
      if (PRIVATE_LINE.test(line)) hits.push(index)
    })
    push(`匹配 /^\\s*"private":\\s*true\\s*,?\\s*$/：${hits.length} 处（预期 1）`)
    if (hits.length !== 1) {
      push('  ⇒ 拒绝 apply（命中 ≠ 1）')
      blockers.push(`${deletion.id} 命中 ${hits.length} 处（预期 1）`)
      for (const index of hits) push(`    行 ${index + 1}：${lines[index]}`)
      push()
      continue
    }
    const index = hits[0]
    push(`命中：行 ${index + 1}（唯一）`)
    push(`删除：${lines[index]}`)
    const nextLines = lines.filter((_, i) => i !== index) /* whole line, no blank left behind */
    const nextText = nextLines.join('\n')
    push('上下文（删除后 ±3 行）：')
    for (let i = Math.max(0, index - 3); i <= Math.min(nextLines.length - 1, index + 3); i += 1) {
      push(`  ${String(i + 1).padStart(4)}| ${nextLines[i]}${i === index ? '   <-- 删除处（原行已移除）' : ''}`)
    }
    edits.push({ id: deletion.id, path: deletion.path, text, nextText, kind: 'delete-line' })
    push()
  }

  /* ── JSON validity of every result ───────────────────────────────────────────────────────────── */
  rule('=== JSON 合法性（编辑后）===')
  push('（在本进程内 JSON.parse；等价于 `node -e "JSON.parse(...)"`，但不需要起子进程。）')
  const jsonOk = new Map()
  for (const edit of edits) {
    let ok = true
    let reason = ''
    try {
      JSON.parse(edit.nextText)
    } catch (error) {
      ok = false
      reason = error.message
    }
    jsonOk.set(edit.path, ok)
    push(`${ok ? 'OK  ' : 'FAIL'} · ${edit.id} ⇒ ${edit.path.split('\\').pop()}（${edit.path}）${ok ? '' : ` —— ${reason}`}`)
    if (!ok) {
      blockers.push(`${edit.id} 编辑后 JSON 不合法：${reason}`)
      if (edit.kind === 'delete-line') {
        push('     提示：该行原本带尾逗号且后面就是 `}`，删掉它会留下悬空逗号 ⇒ 需要人工处理（本脚本不擅自补改）。')
      }
    }
  }
  push()

  /* ── the guard summary, in the brief's own shape ─────────────────────────────────────────────── */
  rule('=== 前置检查 ===')
  const byId = (prefix) => edits.find((edit) => edit.id.startsWith(prefix))
  push(`${byId('编辑 1') !== undefined ? 'OK  ' : 'FAIL'} · 编辑 1 命中 1 处`)
  push(`${byId('编辑 2') !== undefined ? 'OK  ' : 'FAIL'} · 编辑 2 命中 1 处`)
  push(`${byId('编辑 3') !== undefined ? 'OK  ' : 'FAIL'} · 编辑 3 命中 1 处`)
  const allJson = edits.length > 0 && [...jsonOk.values()].every(Boolean)
  push(`${allJson ? 'OK  ' : 'FAIL'} · 3 个 JSON 编辑后合法`)
  push()

  /* ── summary ─────────────────────────────────────────────────────────────────────────────────── */
  const canApply = blockers.length === 0 && edits.length === 3
  rule('=== 汇总 ===')
  push(`计划：${edits.length} 处编辑（预期 3）`)
  for (const edit of edits) push(`  · ${edit.id} ⇒ ${edit.path}`)
  for (const blocker of blockers) push(`  阻碍：${blocker}`)
  push(`apply 可行性：${canApply ? 'YES' : 'NO'}`)
  push('本轮不碰 junction、不碰 packages/liquid-glass/scripts/、不做临时文件预检、不自动回滚。')
  push('--apply 生成的 .bak-p2-fix 不会被删除 —— 何时清理由你决定。')
  push()

  const header = ['# one-shot-fix-p2-skeleton report', `# mode: ${APPLY ? 'APPLY' : 'dry-run'}`, '']
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

  /* ── apply: tmp → .bak-p2-fix → rename, one file at a time ───────────────────────────────────── */
  rule('=== 落盘 ===')
  const backups = []
  for (const edit of edits) {
    const tmp = `${edit.path}.tmp`
    const bak = `${edit.path}.bak-p2-fix`
    try {
      await writeFile(tmp, edit.nextText, 'utf8')
      await copyFile(edit.path, bak)
      await rename(tmp, edit.path)
      backups.push({ path: edit.path, bak })
      push(`OK   ${edit.id} ⇒ ${edit.path}`)
    } catch (error) {
      await unlink(tmp).catch(() => {})
      console.error(`FAIL ${edit.id}：${error.message}`)
      console.error('已停止后续写入；已完成的文件保留其 .bak-p2-fix。')
      process.exitCode = 1
      break
    }
  }
  push()
  push(`已落盘 ${backups.length} / ${edits.length} 处`)
  push('备份清单（本轮不删除）：')
  for (const entry of backups) push(`  · ${entry.bak}`)
  push('下一步（由你决定）：node scripts/verify.mjs（在 liquid-glass 里）或其他你惯用的校验。')
}

main().catch((error) => {
  console.error(`\nABORTED，未修改任何文件：${error.message}`)
  process.exitCode = 1
})