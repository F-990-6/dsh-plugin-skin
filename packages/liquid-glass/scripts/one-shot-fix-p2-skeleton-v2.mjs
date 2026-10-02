#!/usr/bin/env node
/**
 * ONE-SHOT v2: FIX THE P2-1 SKELETON AND STRIP THE BOMs (2026-10-02) — six files, three edits.
 *
 * WHY v2. The first attempt refused to run because `dsh-plugin-skin/package.json` begins with a byte-order
 * mark: `Set-Content -Encoding UTF8` on PowerShell 5.1 writes UTF-8 WITH a BOM, and `JSON.parse` rejects a
 * BOM outright ("Unexpected token ''"). The fix is in the reading, not in the parsing: strip a leading
 * U+FEFF before anything looks at the text, and write back with Node's own `writeFile(…, 'utf8')`, which
 * emits no BOM at all.
 *
 * LINE ENDINGS ARE NOT TOUCHED. The text is split on `\n` only — a `\r` stays at the end of its line — and
 * joined back with `\n`, so every line that is not edited comes out byte-for-byte identical. That property is
 * checked, not assumed: for the three files this round only strips BOMs from, the byte count must fall by
 * exactly 3 or not at all, and anything else refuses the write.
 *
 * DRY RUN BY DEFAULT. `--apply` moves an older `.bak-p2-fix` aside, writes `<file>.tmp`, copies the original
 * to `<file>.bak-p2-fix2`, then renames. Backups are never deleted here.
 *
 * Usage:  node scripts/one-shot-fix-p2-skeleton-v2.mjs
 *         node scripts/one-shot-fix-p2-skeleton-v2.mjs --apply
 */
import { readFile, writeFile, rename, copyFile, unlink, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const APPLY = process.argv.includes('--apply')
const scriptDir = dirname(fileURLToPath(import.meta.url))
const REPORT = join(scriptDir, 'one-shot-fix-p2-skeleton-v2.report.txt')

const SKIN = 'E:\\dsh-plugins\\dsh-plugin-skin'
const FILES = {
  skinManifest: join(SKIN, 'package.json'),
  liquidGlass: join(SKIN, 'packages', 'liquid-glass', 'package.json'),
  metaManifest: join(SKIN, 'meta', 'package.json'),
  readme: join(SKIN, 'README.md'),
  gitignore: join(SKIN, '.gitignore'),
  metaReadme: join(SKIN, 'meta', 'README.md'),
}

const WORKSPACE_TOKEN = '"packages/*"'
const WORKSPACE_REPLACEMENT = '"packages/liquid-glass"'
const PRIVATE_LINE = /^\s*"private":\s*true\s*,?\s*$/
const OLD_BAK_SUFFIX = '.bak-p2-fix'
const NEW_BAK_SUFFIX = '.bak-p2-fix2'

const exists = async (path) => {
  try { await stat(path); return true } catch { return false }
}
const countOf = (text, needle) => text.split(needle).length - 1

/** The first bytes of a file, as hex, and whether they are a UTF-8 BOM. */
const hexHead = (buffer, count = 3) => [...buffer.subarray(0, Math.min(count, buffer.length))].map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ')
const hasBom = (buffer) => buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf

/** Strip a leading BOM — the brief's own expression, verbatim. */
const stripBom = (content) => content.replace(/^\uFEFF/, '')

async function main() {
  const out = []
  const push = (line = '') => { out.push(line); console.log(line) }
  const rule = (title) => { push('='.repeat(100)); push(title); push('='.repeat(100)) }
  const blockers = []

  push('# one-shot v2: strip BOMs and patch the skeleton')
  push(`# mode:   ${APPLY ? 'APPLY' : 'dry-run'}`)
  push(`# report: ${REPORT}`)
  push('# 读 → strip BOM → 编辑（若需）→ writeFile(…, "utf8")（Node 默认无 BOM）')
  push('# 行尾：只按 \\n 切分/合回 ⇒ 未编辑的行逐字节不变（下面有字节数自检）')
  push()

  /* ── gather every file once: raw bytes, decoded text, and the BOM facts ──────────────────────── */
  const state = new Map()
  for (const [key, path] of Object.entries(FILES)) {
    if (!(await exists(path))) {
      blockers.push(`${key} 不存在：${path}`)
      continue
    }
    const raw = await readFile(path)
    const decoded = raw.toString('utf8')
    state.set(key, {
      key,
      path,
      raw,
      decoded,
      bom: hasBom(raw),
      head: hexHead(raw),
      text: stripBom(decoded),
      next: null,
      kind: 'bom-only',
      note: '',
    })
  }

  /* ── 编辑 1 · workspaces token ───────────────────────────────────────────────────────────────── */
  rule('=== 编辑 1 ===')
  const skin = state.get('skinManifest')
  if (skin === undefined) {
    push('【缺失】')
    blockers.push('编辑 1 的文件缺失')
  } else {
    push(`文件：${skin.path}`)
    push(`原首字节：${skin.head}（${skin.bom ? '有 BOM' : '无 BOM'}）`)
    const hits = countOf(skin.text, WORKSPACE_TOKEN)
    push(`token ${WORKSPACE_TOKEN} 命中：${hits} 处（预期 1）`)
    if (hits !== 1) {
      blockers.push(`编辑 1 的 token 命中 ${hits} 处（预期 1）`)
      const lines = skin.text.split('\n')
      for (let i = 0; i < lines.length; i += 1) if (lines[i].includes('workspaces')) push(`    参考 行 ${i + 1}：${lines[i]}`)
    } else {
      const lines = skin.text.split('\n')
      const index = lines.findIndex((line) => line.includes(WORKSPACE_TOKEN))
      push(`改前：${lines[index]}`)
      push(`改后：${lines[index].split(WORKSPACE_TOKEN).join(WORKSPACE_REPLACEMENT)}`)
      skin.next = skin.text.split(WORKSPACE_TOKEN).join(WORKSPACE_REPLACEMENT)
      skin.kind = 'edit-1'
    }
  }
  push()

  /* ── 编辑 2 与 3 · delete the `"private": true` line ─────────────────────────────────────────── */
  for (const [label, key] of [['编辑 2', 'liquidGlass'], ['编辑 3', 'metaManifest']]) {
    rule(`=== ${label} ===`)
    const file = state.get(key)
    if (file === undefined) {
      push('【缺失】')
      blockers.push(`${label} 的文件缺失`)
      push()
      continue
    }
    push(`文件：${file.path}`)
    push(`原首字节：${file.head}（${file.bom ? '有 BOM' : '无 BOM'}）`)
    const lines = file.text.split('\n')
    const hits = []
    lines.forEach((line, index) => {
      if (PRIVATE_LINE.test(line)) hits.push(index)
    })
    push(`匹配 /^\\s*"private":\\s*true\\s*,?\\s*$/：${hits.length} 处（预期 1）`)
    if (hits.length !== 1) {
      blockers.push(`${label} 命中 ${hits.length} 处（预期 1）`)
      for (const index of hits) push(`    行 ${index + 1}：${lines[index]}`)
    } else {
      const index = hits[0]
      push(`删除：${lines[index]}`)
      /* Whole line removed, no blank left; everything else passes through unchanged. */
      file.next = lines.filter((_, i) => i !== index).join('\n')
      file.kind = label === '编辑 2' ? 'edit-2' : 'edit-3'
    }
    push()
  }

  /* ── files 4/5/6 · BOM only ──────────────────────────────────────────────────────────────────── */
  rule('=== 文件 4/5/6（只 BOM）===')
  for (const key of ['readme', 'gitignore', 'metaReadme']) {
    const file = state.get(key)
    if (file === undefined) {
      push(`【缺失】${key}`)
      blockers.push(`文件 ${key} 缺失`)
      continue
    }
    file.next = file.text /* nothing but the BOM changes */
    file.kind = 'bom-only'
    push(`${file.path.split('\\').slice(-2).join('/')}：${file.head} ⇒ ${file.bom ? '无 BOM（将删除 3 字节）' : '本来就无 BOM（字节数不变）'}`)
  }
  push()

  /* ── JSON validity: stripped text in, parsed ─────────────────────────────────────────────────── */
  rule('=== JSON 合法性（先 strip BOM 再 parse）===')
  for (const key of ['skinManifest', 'liquidGlass', 'metaManifest']) {
    const file = state.get(key)
    if (file === undefined || file.next === null) {
      push(`SKIP · ${key}（未就绪）`)
      continue
    }
    let ok = true
    let reason = ''
    try {
      JSON.parse(file.next)
    } catch (error) {
      ok = false
      reason = error.message
    }
    push(`${ok ? 'OK  ' : 'FAIL'} · ${file.kind} ⇒ JSON 合法：${ok ? 'OK' : `FAIL（${reason}）`}`)
    if (!ok) {
      blockers.push(`${file.kind} 编辑后 JSON 不合法：${reason}`)
      if (file.kind === 'edit-2' || file.kind === 'edit-3') {
        push('     提示：该行原带尾逗号且其后就是 `}`，删掉它会留下悬空逗号 ⇒ 需人工处理（本脚本不擅自补改）。')
      }
    }
  }
  push()

  /* ── byte-level self-check for the three BOM-only files ──────────────────────────────────────── */
  rule('=== 字节级自检（只 BOM 的文件）===')
  for (const key of ['readme', 'gitignore', 'metaReadme']) {
    const file = state.get(key)
    if (file === undefined || file.next === null) continue
    const nextBytes = Buffer.byteLength(file.next, 'utf8')
    const delta = nextBytes - file.raw.length
    const expected = file.bom ? -3 : 0
    const ok = delta === expected
    push(`${ok ? 'OK  ' : 'FAIL'} · ${file.path}：${file.raw.length} ⇒ ${nextBytes} 字节（Δ${delta}，预期 ${expected}）`)
    if (!ok) blockers.push(`${file.path} 字节数变化 Δ${delta} ≠ 预期 ${expected}（内容被动过）`)
  }
  push()

  /* ── guard summary ───────────────────────────────────────────────────────────────────────────── */
  rule('=== 前置检查 ===')
  const editsReady = ['edit-1', 'edit-2', 'edit-3'].every((kind) => [...state.values()].some((file) => file.kind === kind && file.next !== null))
  push(`${editsReady ? 'OK  ' : 'FAIL'} · 编辑 1/2/3 各命中 1 处`)
  const jsonReady = ['skinManifest', 'liquidGlass', 'metaManifest'].every((key) => {
    const file = state.get(key)
    if (file === undefined || file.next === null) return false
    try { JSON.parse(file.next); return true } catch { return false }
  })
  push(`${jsonReady ? 'OK  ' : 'FAIL'} · 3 JSON 合法（stripped）`)
  const bomOnlyOk = ['readme', 'gitignore', 'metaReadme'].every((key) => {
    const file = state.get(key)
    if (file === undefined || file.next === null) return false
    return Buffer.byteLength(file.next, 'utf8') - file.raw.length === (file.bom ? -3 : 0)
  })
  push(`${bomOnlyOk ? 'OK  ' : 'FAIL'} · 只 BOM 的 3 个文件字节数变化符合预期`)
  const bomCount = [...state.values()].filter((file) => file.bom).length
  push(`INFO · 6 个文件中有 BOM 的：${bomCount} 个`)
  push()

  /* ── summary ─────────────────────────────────────────────────────────────────────────────────── */
  const ready = [...state.values()].filter((file) => file.next !== null)
  const canApply = blockers.length === 0 && ready.length === 6
  rule('=== 汇总 ===')
  push(`计划：3 处编辑 + 3 处 BOM 清理（共 6 个文件）`)
  for (const file of ready) push(`  · [${file.kind}] ${file.path}`)
  for (const blocker of blockers) push(`  阻碍：${blocker}`)
  push(`apply 可行性：${canApply ? 'YES' : 'NO'}`)
  push('不碰 junction、不碰 packages/liquid-glass/scripts/ 里的其他文件；不做临时文件预检；不自动回滚。')
  push(`--apply 会为每个文件生成 ${NEW_BAK_SUFFIX}；上轮遗留的 ${OLD_BAK_SUFFIX} 会先被改名（不删除）。`)
  push()

  const header = ['# one-shot-fix-p2-skeleton-v2 report', `# mode: ${APPLY ? 'APPLY' : 'dry-run'}`, '']
  await writeFile(REPORT, `${header.join('\n')}${out.join('\n')}\n`, 'utf8')

  if (!APPLY) {
    push(`报告已写入 ${REPORT}（UTF-8）`)
    push('DRY RUN：未修改任何文件。加 --apply 才落盘。')
    return
  }
  if (!canApply) {
    console.error(`\nREFUSED：${blockers.join('；') || `就绪文件 ${ready.length} / 6`}。未修改任何文件。`)
    process.exitCode = 1
    return
  }

  /* ── apply ───────────────────────────────────────────────────────────────────────────────────── */
  rule('=== 落盘 ===')
  const done = []
  for (const file of ready) {
    /* Housekeeping first: move last round's backup aside so the two are never confused. */
    const oldBak = `${file.path}${OLD_BAK_SUFFIX}`
    if (await exists(oldBak)) {
      let n = 1
      while (await exists(`${oldBak}.${n}`)) n += 1
      await rename(oldBak, `${oldBak}.${n}`)
      push(`旧的 ${OLD_BAK_SUFFIX} 改名 ⇒ ${oldBak}.${n}`)
    }
    const tmp = `${file.path}.tmp`
    const bak = `${file.path}${NEW_BAK_SUFFIX}`
    try {
      /* Node writes UTF-8 with no BOM unless a BOM was put in the string — which stripBom removed. */
      await writeFile(tmp, file.next, 'utf8')
      await copyFile(file.path, bak)
      await rename(tmp, file.path)
      const raw = await readFile(file.path)
      done.push({ ...file, newHead: hexHead(raw), newSize: raw.length })
      push(`OK   [${file.kind}] ${file.path}`)
      push(`       首字节：${file.head}（${file.bom ? '有 BOM' : '无 BOM'}） ⇒ ${hexHead(raw)}（${hasBom(raw) ? '有 BOM' : '无 BOM'}）  ${file.raw.length} ⇒ ${raw.length} 字节`)
    } catch (error) {
      await unlink(tmp).catch(() => {})
      console.error(`FAIL ${file.path}：${error.message}`)
      console.error('已停止后续写入；已完成的文件保留其备份。')
      process.exitCode = 1
      break
    }
  }
  push()
  push(`已落盘 ${done.length} / 6 个文件`)
  push('首字节变化汇总：')
  for (const file of done) push(`  · ${file.path}：${file.head} ⇒ ${file.newHead}（${file.raw.length} ⇒ ${file.newSize} 字节）`)
  push()
  push(`备份清单（本轮不删除）：`)
  for (const file of done) push(`  · ${file.path}${NEW_BAK_SUFFIX}`)
  push('本脚本不自动运行 verify —— 请你手动执行你惯用的校验。')
}

main().catch((error) => {
  console.error(`\nABORTED，未修改任何文件：${error.message}`)
  process.exitCode = 1
})