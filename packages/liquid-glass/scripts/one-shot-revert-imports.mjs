#!/usr/bin/env node
/**
 * ONE-SHOT: REVERT THE IMPORT REWRITE (2026-10-02) — five edits, in the skin package.
 *
 * WHAT WENT WRONG. The monorepo migration shortened `'../../dsh-ui-projects/…` to `'dsh-ui-projects/…` and
 * put a junction in `node_modules`, expecting Node to resolve it. It does not: the package's `exports` field
 * gates which subpaths may be reached, and the deep paths these scripts import are not among them. The
 * junction now lives at `packages/dsh-ui-projects/`, one level up from the package instead of inside
 * `node_modules`, so the specifier has to be a relative path again — which is what this script puts back.
 *
 * EVERY EDIT IS COUNT-GUARDED. Each `.mjs` must contain the shortened specifier exactly once; `package.json`
 * must have exactly one `"manifest":` line. A count of zero is as much a refusal as a count of two — zero
 * usually means the file was already reverted, and re-applying a prefix on top of a prefix is how a path
 * ends up as `../../../../…`.
 *
 * DRY RUN BY DEFAULT. `--apply` writes `<file>.tmp`, copies the original to `<file>.bak-revert`, then
 * renames. Any failure leaves the original in place. `verify.mjs` is not run: that is the user's step.
 *
 * Usage:  node scripts/one-shot-revert-imports.mjs
 *         node scripts/one-shot-revert-imports.mjs --apply
 */
import { readFile, writeFile, rename, copyFile, unlink, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const APPLY = process.argv.includes('--apply')
const scriptDir = dirname(fileURLToPath(import.meta.url))
const REPORT = join(scriptDir, 'one-shot-revert-imports.report.txt')

/** Constraint 1: an absolute working directory, not one derived from where this script happens to sit. */
const WORKDIR = 'E:\\dsh-plugins\\dsh-plugin-skin\\packages\\liquid-glass'

/** The four scripts, and the one rewrite each needs. */
const NEEDLE = "'dsh-ui-projects/"
const REPLACEMENT = "'../../dsh-ui-projects/"
const MJS_FILES = [
  'scripts/build.mjs',
  'scripts/derive-boot-css.mjs',
  'scripts/emitted-css.mjs',
  'scripts/verify.mjs',
]

const MANIFEST_LINE = /^\s*"manifest":\s*"/
const MANIFEST_TARGET_VALUE = 'node ../dsh-ui-projects/scripts/derive-manifest.mjs --package . --check'

const exists = async (path) => {
  try { await stat(path); return true } catch { return false }
}

const countOf = (text, needle) => text.split(needle).length - 1

async function main() {
  const out = []
  const push = (line = '') => { out.push(line); console.log(line) }
  const rule = (title) => { push('='.repeat(100)); push(title); push('='.repeat(100)) }
  const blockers = []

  push('# one-shot: revert the shortened module specifiers')
  push(`# workdir: ${WORKDIR}（绝对路径，按指令固定）`)
  push(`# mode:    ${APPLY ? 'APPLY' : 'dry-run'}`)
  push(`# report:  ${REPORT}`)
  push('# 每个文件：计数保护 → tmp → .bak-revert → rename；任何一步失败，原文件不动。')
  push()

  /* ── the working directory itself must exist before anything else is claimed ─────────────────── */
  rule('=== 工作目录检查 ===')
  const workdirOk = await exists(WORKDIR)
  push(`${workdirOk ? 'OK  ' : 'FAIL'} · 目录存在：${WORKDIR}`)
  if (!workdirOk) {
    blockers.push(`工作目录不存在：${WORKDIR}`)
    push()
    push('==== 汇总 ====')
    push(`计划：5 处改动`)
    push(`apply 可行性：NO（工作目录不存在，未读取任何文件）`)
    const header = ['# one-shot-revert-imports report', `# workdir: ${WORKDIR}`, `# mode: ${APPLY ? 'APPLY' : 'dry-run'}`, '']
    await writeFile(REPORT, `${header.join('\n')}${out.join('\n')}\n`, 'utf8')
    console.log(`\n报告已写入 ${REPORT}（UTF-8）`)
    if (APPLY) {
      console.error('REFUSED：工作目录不存在，未修改任何文件。')
      process.exitCode = 1
    }
    return
  }
  push()

  /* ── the four .mjs files ─────────────────────────────────────────────────────────────────────── */
  rule('=== 4 个 .mjs 的替换计划 ===')
  const edits = []
  let mjsOk = 0
  for (const relativePath of MJS_FILES) {
    const full = join(WORKDIR, relativePath)
    if (!(await exists(full))) {
      push(`· ${relativePath}：【文件不存在】`)
      blockers.push(`${relativePath} 不存在`)
      continue
    }
    const text = await readFile(full, 'utf8')
    const hits = countOf(text, NEEDLE)
    const already = countOf(text, REPLACEMENT)
    push(`· ${relativePath}：命中 ${JSON.stringify(NEEDLE)} ${hits} 处（预期 1）${already > 0 ? `；已含 ${JSON.stringify(REPLACEMENT)} ${already} 处` : ''}`)
    if (hits !== 1) {
      push(`    ⇒ 拒绝 apply（命中 ≠ 1）`)
      blockers.push(`${relativePath} 命中 ${hits} 处（预期 1）`)
      continue
    }
    const lines = text.split('\n')
    const lineIndex = lines.findIndex((line) => line.includes(NEEDLE))
    const before = lines[lineIndex]
    const afterLine = before.split(NEEDLE).join(REPLACEMENT)
    push(`    行 ${lineIndex + 1}`)
    push(`    改前：${before.trim().slice(0, 150)}`)
    push(`    改后：${afterLine.trim().slice(0, 150)}`)
    /* The edit is exactly one substring swap, so nothing else in the file can move. */
    const nextText = text.split(NEEDLE).join(REPLACEMENT)
    const sanity = countOf(nextText, REPLACEMENT) === already + 1 && countOf(nextText, NEEDLE) === 0
    push(`    自检：替换后 ${JSON.stringify(NEEDLE)} 归零、目标串恰好 +1 ⇒ ${sanity ? 'OK' : 'FAIL'}`)
    if (!sanity) {
      blockers.push(`${relativePath} 替换自检失败`)
      continue
    }
    edits.push({ kind: 'replace', full, relativePath, text, nextText })
    mjsOk += 1
  }
  push()
  push(`${mjsOk === MJS_FILES.length ? 'OK  ' : 'FAIL'} · 4 文件各命中 1 处（实际可用 ${mjsOk} 个）`)
  push()

  /* ── package.json ────────────────────────────────────────────────────────────────────────────── */
  rule('=== package.json 的替换计划 ===')
  const manifestPath = join(WORKDIR, 'package.json')
  if (!(await exists(manifestPath))) {
    push('package.json：【不存在】')
    blockers.push('package.json 不存在')
  } else {
    const text = await readFile(manifestPath, 'utf8')
    const lines = text.split('\n')
    const hits = []
    lines.forEach((line, index) => {
      if (MANIFEST_LINE.test(line)) hits.push(index)
    })
    push(`含 "manifest": 的行：${hits.length} 处（预期 1）`)
    if (hits.length !== 1) {
      blockers.push(`package.json 的 "manifest": 行命中 ${hits.length} 处（预期 1）`)
      for (const index of hits) push(`  行 ${index + 1}：${lines[index].trim()}`)
    } else {
      const index = hits[0]
      const before = lines[index]
      /* Keep the indentation and the trailing comma (if any); replace only the value string. */
      const indent = /^\s*/.exec(before)[0]
      const trailingComma = /,\s*$/.test(before) ? ',' : ''
      const valueMatch = /"manifest":\s*"((?:[^"\\]|\\.)*)"/.exec(before)
      if (valueMatch === null) {
        push('  无法提取当前值（不猜）—— 拒绝 apply')
        blockers.push('package.json 的 manifest 值无法提取')
      } else {
        const currentValue = valueMatch[1]
        const after = `${indent}"manifest": "${MANIFEST_TARGET_VALUE}"${trailingComma}`
        push(`  行 ${index + 1}`)
        push(`    改前：${before}`)
        push(`    改后：${after}`)
        push(`    （保留缩进 ${JSON.stringify(indent)}${trailingComma === '' ? '；原行无尾逗号' : '；保留尾逗号'}）`)
        push(`    当前值：${currentValue}`)
        push(`    目标值：${MANIFEST_TARGET_VALUE}`)
        const nextLines = [...lines]
        nextLines[index] = after
        const nextText = nextLines.join('\n')
        let jsonOk = true
        let jsonError = ''
        try {
          JSON.parse(nextText)
        } catch (error) {
          jsonOk = false
          jsonError = error.message
        }
        push(`    自检：替换后仍是合法 JSON ⇒ ${jsonOk ? 'OK' : `FAIL（${jsonError}）`}`)
        if (!jsonOk) blockers.push('package.json 替换后 JSON 不合法')
        else if (currentValue === MANIFEST_TARGET_VALUE) blockers.push('package.json 的 manifest 已是目标值（无需改动，拒绝以免误报）')
        else edits.push({ kind: 'replace', full: manifestPath, relativePath: 'package.json', text, nextText })
      }
    }
  }
  push()

  /* ── summary ─────────────────────────────────────────────────────────────────────────────────── */
  rule('=== 汇总 ===')
  push(`计划：${edits.length} 处改动（预期 5：4 个 .mjs + 1 个 package.json）`)
  push(`apply 可行性：${blockers.length === 0 && edits.length === 5 ? 'YES' : 'NO'}${blockers.length === 0 && edits.length === 5 ? '' : `（${blockers.join('；') || `可用改动 ${edits.length} 处`}）`}`)
  for (const blocker of blockers) push(`  阻碍：${blocker}`)
  push()

  const header = ['# one-shot-revert-imports report', `# workdir: ${WORKDIR}`, `# mode: ${APPLY ? 'APPLY' : 'dry-run'}`, '']
  await writeFile(REPORT, `${header.join('\n')}${out.join('\n')}\n`, 'utf8')

  if (!APPLY) {
    push(`报告已写入 ${REPORT}（UTF-8）`)
    push('DRY RUN：未修改任何文件。加 --apply 才落盘。')
    return
  }
  if (blockers.length > 0 || edits.length !== 5) {
    console.error(`\nREFUSED：${blockers.join('；') || `可用改动 ${edits.length} 处（预期 5）`}。未修改任何文件。`)
    process.exitCode = 1
    return
  }

  /* ── apply: tmp → .bak-revert → rename, one file at a time ───────────────────────────────────── */
  rule('=== 落盘 ===')
  const backups = []
  for (const edit of edits) {
    const tmp = `${edit.full}.tmp`
    const bak = `${edit.full}.bak-revert`
    try {
      await writeFile(tmp, edit.nextText, 'utf8')
      await copyFile(edit.full, bak)
      await rename(tmp, edit.full)
      backups.push(bak)
      push(`OK   ${edit.relativePath}  ⇒ ${relative(WORKDIR, edit.full)}（备份 ${relative(WORKDIR, bak)}）`)
    } catch (error) {
      /* Leave the original alone: remove the temp file if it was created, and stop. */
      await unlink(tmp).catch(() => {})
      console.error(`FAIL ${edit.relativePath}：${error.message}`)
      console.error('已停止后续文件的写入；已完成的文件保留其 .bak-revert。')
      process.exitCode = 1
      break
    }
  }
  push()
  push(`已落盘 ${backups.length} / ${edits.length} 处`)
  push('备份清单：')
  for (const bak of backups) push(`  · ${bak}`)
  push('本脚本不自动运行 verify.mjs —— 请你手动执行：')
  push(`    cd ${WORKDIR}`)
  push('    node scripts/verify.mjs')
}

main().catch((error) => {
  console.error(`\nABORTED，未修改任何文件：${error.message}`)
  process.exitCode = 1
})