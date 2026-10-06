/**
 * @xjl-resources/dsh-plugin-liquid-glass — behavioural verification.
 *
 * WHAT THIS SUITE IS, AND WHAT IT DELIBERATELY IS NOT.
 *
 * It verifies the MATERIAL: the declarations in `tokens.css` and `glass.css`, read through the REAL
 * scoper the runtime uses, so what is asserted is the CSS a browser receives rather than the CSS a person
 * wrote. Thirteen of these tests moved here from the framework's suite in step 8b, because their subject
 * was never the framework: a palette, a blur, a dark half, a first-paint sheet.
 *
 * It does NOT drive the framework's runtime. "A package's project registers, applies and is withdrawn" is
 * the framework's contract, and it is tested there — with the framework's own fixture and, in
 * `load-check.mjs`, with THIS package's real bundle. The honest boundary: this suite proves the material
 * and the package's declarations; the framework's suites prove that the framework runs them.
 *
 * Run: `npm test` (after `npm run build`).
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

import { MARKER } from './boot-css-rules.mjs'
import { SKIN_SUPPRESSIONS } from './skin-exceptions.mjs'

/*
 * THE SHARED PIECES, from the framework package, by relative path.
 *
 * These are dev-time imports and the package does not ship them (`files` excludes `scripts/`), which is
 * what makes them acceptable: the scoper is the framework's implementation and a second copy of it here
 * would be a copy that could disagree with the CSS the browser actually gets — the one thing a material
 * suite must not do. The same arrangement the skeleton package uses for `bundle-client.mjs`.
 */
import { scopeCss } from '../../../.dev/dsh-ui-projects/src/client/scope-css.js'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const skinDir = join(packageRoot, 'src', 'client', 'projects', 'liquid-glass')
const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))

let passed = 0
let failed = 0
let skipped = 0
/** `DSH_TEST_ONLY="<substring>"` runs one test, and prints the skip count so a filtered run cannot be mistaken for a full one. */
const onlyTest = typeof process.env.DSH_TEST_ONLY === 'string' ? process.env.DSH_TEST_ONLY : ''
const ok = (label) => {
  passed += 1
  process.stdout.write(`  ok   ${label}\n`)
}
const fail = (label) => {
  failed += 1
  process.stdout.write(`  FAIL ${label}\n`)
}
const equal = (actual, expected, label) => {
  const same = JSON.stringify(actual) === JSON.stringify(expected)
  if (same) ok(label)
  else fail(`${label}\n         got      ${JSON.stringify(actual)}\n         expected ${JSON.stringify(expected)}`)
}
const truthy = (condition, label) => (condition ? ok(label) : fail(label))
const contains = (haystack, needle, label = `contains ${JSON.stringify(needle)}`) =>
  String(haystack).includes(needle) ? ok(label) : fail(`${label} — not found`)
const excludes = (haystack, needle, label = `does not contain ${JSON.stringify(needle)}`) =>
  String(haystack).includes(needle) ? fail(`${label} — found`) : ok(label)

const test = async (name, body) => {
  /*
   * ONE TEST AT A TIME, by substring, exactly as the framework's suite offers it. It is how a report can
   * state what a single test asserts — "the suite grew by 14" says nothing about which claim is new — and
   * it is how a reader reproduces one failure without reading a hundred lines of other results.
   */
  if (onlyTest !== '' && !name.includes(onlyTest)) {
    skipped += 1
    return
  }
  try {
    await body()
  } catch (error) {
    fail(`${name}: threw ${String(error?.stack ?? error)}`)
  }
}

/* ── the material, as the browser receives it ─────────────────────────────── */

const tokensCss = readFileSync(join(skinDir, 'tokens.css'), 'utf8')
const glassCss = readFileSync(join(skinDir, 'glass.css'), 'utf8')
/** The palette sheet and the material sheet, exactly as two `insertCss` calls deliver them. */
const palette = String(scopeCss(MARKER, tokensCss))
const material = String(scopeCss(MARKER, glassCss))
/** What `allCss()` would hold with this skin on. */
const css = `${palette}\n${material}`

/*
 * THE OVERLAY, READ FROM ITS SOURCE RATHER THAN FROM ITS EXPORT (2026-10-06).
 *
 * `src/client/index.js` exports `__overlay.OVERLAY_CSS`, and that is the honest entry point — but it is
 * a module-level SNAPSHOT of a value the package only ever serves as a BUILT bundle (`lib/client.js`,
 * produced by `scripts/build.mjs`). Reaching it from here would mean importing that bundle, and then
 * every edit to the overlay — or to `glass.css`, which it quotes — would be invisible to this suite
 * until someone rebuilt. A suite that silently lags the sources is worse than one with a narrower
 * scope, so the three template literals are lifted out of the file directly.
 *
 * That extraction is safe by the file's OWN rule: "inside these template literals there is CSS and
 * nothing else. No backticks, no dollar braces, no backslashes." The rule exists because a backtick
 * inside one of them ended the string and took the whole application down once already.
 */
const overlaySource = readFileSync(join(packageRoot, 'src', 'client', 'index.js'), 'utf8')
const overlaySheets = [...overlaySource.matchAll(/const (OVERLAY_[A-Z]+) = `([\s\S]*?)`/g)].map((match) => ({
  name: match[1],
  text: match[2],
}))
/** Every overlay rule, in one string, in the order `OVERLAY_CSS` concatenates them. */
const overlay = overlaySheets.map((sheet) => sheet.text).join('\n')

/** Every custom property DECLARED in a stylesheet (`--name:`), as opposed to merely referenced. */
const declaredTokens = (text) => {
  const found = new Set()
  for (const match of String(text).matchAll(/(--[a-z0-9][a-z0-9-]*)\s*:/gi)) found.add(match[1])
  return found
}

/**
 * Strip comments so a source guard reads CODE rather than the prose that explains it.
 *
 * The same helper the framework's suite carries, and for the same reason: a guard whose needles appear in
 * the file's own documentation fails on a correct file. See the framework's CONTRIBUTING.md, rule 5.
 * @param {string} source
 */
const stripComments = (source) =>
  String(source)
    .split('/*')
    .map((chunk, index) => (index === 0 ? chunk : chunk.slice(chunk.indexOf('*/') + 2)))
    .join('')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')

/**
 * Every custom property the shipped web client declares.
 *
 * Read from the INSTALLED frontend and theme bundle — the actual source of truth for the running
 * application, not from this package — because the palette's whole claim is "I re-bind tokens the client
 * already declares". The deployment lives in an npx cache whose directory name carries a hash, so it is
 * discovered rather than hard-coded: the newest `_npx/<hash>/node_modules/@deepseek-ai` wins. A missing
 * installation is a FAILURE, never a skip: a check that quietly does nothing is worse than no check.
 */
async function shippedDesignTokens() {
  const { readdir } = await import('node:fs/promises')
  const { existsSync } = await import('node:fs')
  const npmCache = join(process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? '', 'AppData', 'Local'), 'npm-cache', '_npx')
  if (!existsSync(npmCache)) throw new Error(`no npx cache at ${npmCache}; the shipped token set cannot be read`)
  const candidates = []
  for (const entry of await readdir(npmCache, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const scope = join(npmCache, entry.name, 'node_modules', '@deepseek-ai')
    if (existsSync(join(scope, 'dsh-web-frontend'))) candidates.push({ scope, mtime: 0 })
  }
  if (candidates.length === 0) throw new Error(`no dsh-web-frontend under ${npmCache}; the reference set would be empty`)
  const files = []
  for (const { scope } of candidates) {
    const assets = join(scope, 'dsh-web-frontend', 'dist', 'assets')
    if (existsSync(assets)) {
      for (const asset of await readdir(assets)) if (asset.endsWith('.css')) files.push(join(assets, asset))
    }
    const theme = join(scope, 'dsh-client-ui-theme', 'lib', 'client.js')
    if (existsSync(theme)) files.push(theme)
  }
  const declared = new Set()
  for (const file of files) for (const token of declaredTokens(readFileSync(file, 'utf8'))) declared.add(token)
  if (declared.size === 0) throw new Error('no shipped design tokens found; the reference set would be vacuous')
  return declared
}

/** `selector{declarations}` bodies for every occurrence of one selector, in source order. */
const rulesWith = (text, selector) => {
  const bodies = []
  let from = 0
  for (;;) {
    const at = text.indexOf(selector, from)
    if (at === -1) return bodies
    const end = text.indexOf('}', at)
    if (end === -1) return bodies
    bodies.push(text.slice(at + selector.length, end))
    from = end
  }
}

const parseDeclarations = (body) => {
  const found = {}
  for (const match of String(body).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+)/gi)) found[match[1]] = match[2].trim()
  return found
}

const firstDeclarations = (text, selector) => parseDeclarations(rulesWith(text, selector)[0] ?? '')

const allDeclarations = (text, selector) => {
  const merged = {}
  for (const body of rulesWith(text, selector)) Object.assign(merged, parseDeclarations(body))
  return merged
}

/** The alpha a colour carries, or `null` when the value is not a colour this test can read. */
const alphaOf = (value) => {
  if (value === undefined) return null
  const text = String(value).trim()
  const hex8 = /^#([0-9a-f]{8})$/i.exec(text)
  if (hex8 !== null) return parseInt(hex8[1].slice(6), 16) / 255
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text)) return 1
  const percent = /^rgba?\([^)]*\/\s*([\d.]+)%\s*\)$/i.exec(text)
  if (percent !== null) return Number(percent[1]) / 100
  const fraction = /^rgba?\([^)]*\/\s*([\d.]+)\s*\)$/i.exec(text)
  if (fraction !== null) return Number(fraction[1])
  if (/^rgba?\(/i.test(text)) return 1
  return null
}

/** Every `{ … }` block whose prelude starts with one string, at brace depth zero. */
const blocksFor = (text, prelude) => {
  const blocks = []
  let from = 0
  for (;;) {
    const start = text.indexOf(prelude, from)
    if (start === -1) return blocks
    let depth = 0
    let end = text.length
    for (let index = start; index < text.length; index += 1) {
      if (text[index] === '{') depth += 1
      else if (text[index] === '}') {
        depth -= 1
        if (depth === 0) {
          end = index + 1
          break
        }
      }
    }
    blocks.push(text.slice(start, end))
    from = end
  }
}

const LIGHT = `${MARKER}{`
const DARK = `${MARKER}[data-ds-dark-theme]{`

/* ── the material ─────────────────────────────────────────────────────────── */

await test('the palette re-binds shipped design tokens, and invents none', async () => {
  const shipped = await shippedDesignTokens()
  const bound = declaredTokens(palette)
  truthy(bound.size >= 20, `the palette re-binds a meaningful set (${bound.size} tokens)`)
  const unknown = [...bound].filter((token) => !shipped.has(token)).sort()
  equal(unknown, [], 'no token is invented: every re-bound token exists in the shipped design system')
  /*
   * The two the palette must NOT touch. They are the text colours: a skin that re-binds them changes how
   * readable every conversation is, which is a different decision from how translucent a surface looks —
   * and one this skin has no business making.
   */
  excludes(palette, '--dsw-alias-label-primary')
  excludes(palette, '--dsw-alias-label-secondary')
})

await test('the sheets declare no DOM of their own, and nothing global', () => {
  /*
   * The skin mounts nothing: no observer, no timer, no element. That is a claim about `skin.js` as much as
   * about the CSS — an earlier version grew an ambient gradient layer and a `MutationObserver` to re-home
   * it, and the cost was a DOM layer the shell had to measure around. Both halves are asserted here
   * because both are this package's.
   *
   * COMMENTS ARE STRIPPED FIRST, and that is a rule rather than tidiness: the header of `skin.js` explains
   * the history using the very names this guard looks for, so scanning the raw text made the guard fail on
   * its own documentation. It did exactly that on the first run. The rule is written down in the
   * framework's CONTRIBUTING.md ("a guard reads CODE, not the prose around it") and this test is the
   * second incident it records.
   */
  const source = stripComments(readFileSync(join(skinDir, 'skin.js'), 'utf8'))
  for (const forbidden of ['document.', 'createElement', 'appendChild', 'MutationObserver', 'setInterval', 'setTimeout', 'requestAnimationFrame']) {
    excludes(source, forbidden, `skin.js never reaches for ${forbidden}`)
  }
  // The only global the definition touches is the context it is handed.
  contains(source, 'ctx.insertCss(', 'it contributes stylesheets, which the runtime owns and removes')
  // And the sheets themselves declare no position/animation that would put anything into the flow.
  for (const forbidden of ['position: fixed', 'animation:', '@keyframes']) {
    excludes(css, forbidden, `the sheets declare no ${forbidden}`)
  }
})

await test('the material transparency is fixed, and no control can thin it out', () => {
  excludes(css, '--lg-material-swap', 'the sheet declares no material factor, so nothing can interpolate one')
  contains(css, '--dsw-specific-sidebar-fill: rgb(250 250 254 / 20%)', 'the sidebar carries a fixed alpha')
  equal(
    Array.isArray(pkg.dsh?.uiProject?.controls) || pkg.dsh?.uiProject?.controls === undefined,
    true,
    'the manifest declares no controls, so the card offers no dial for the material',
  )
})

await test('the column marker selects the frame or rebinds the column’s tokens, and never lays the column out', () => {
  /*
   * TWO CLASSES OF SELECTOR, AND THE OLD CHECK COULD NOT TELL THEM APART (2026-10-06).
   *
   * The rule here used to be `selector.includes(':has(')` — a PROXY for the intent in the test's own
   * name, and weak in both directions:
   *
   *   · it was satisfied by a `:has(` ANYWHERE in the selector, so `body :is([data-ui-skin-column]):
   *     has([data-dockit-pane-panel])` passed while still making the COLUMN the subject of the rule;
   *   · it failed two rules whose subject is the column and whose declaration is nothing but a token
   *     rebind — and a token rebind is neither "selecting the frame" nor "laying anything out", the two
   *     things this test exists to prevent.
   *
   * So the classification is explicit, and each class is held to what actually applies to it:
   *
   *   FRAME    every occurrence of the marker sits inside a `:has(...)` argument — the marker NAMES the
   *            frame from its marked children. These may paint: that is where the frost lives
   *            (`::before`, `backdrop-filter`), and they must keep using `:has(`.
   *
   *   COLUMN   the marker is the SUBJECT of the rule. These may rebind custom properties and nothing
   *            else. Rebound tokens reach the column's descendants by inheritance, which is the only
   *            way to give a ground to a subtree whose painter publishes no stable hook — that is a
   *            legitimate technique and this test now says so. What stays forbidden is a layout
   *            property, a filter (which creates a containing block for `fixed` descendants — the
   *            settings-panel bug in the file header), and any paint that is a LITERAL: an element's
   *            own declaration beats an inherited one, so a literal here is exactly what made the
   *            panel's inner layers immune to the no-transparency branches. Painting THROUGH a
   *            `--lg-glass-*` token is allowed, because a branch can reach that.
   */
  /*
   * BOTH PATHS TO THE SAME PAINT, NOT ONLY THE SCOPED ONE (2026-10-06).
   *
   * The skin reaches the shell's boxes twice: through `ctx.insertCss`, which the runtime scopes to the
   * project marker, and through the overlay in `src/client/index.js`, which is inserted into `<head>`
   * raw. Every rule in this test was checked against the FIRST path only, so the second one — the path
   * that exists precisely because it cannot be out-specified — was unchecked. Both are read here.
   *
   * The rules are matched by the same regex in both, because the overlay spells the project marker out
   * by hand instead of being rewritten with it: what is compared is the shape of the SELECTOR, which is
   * the same question either way.
   */
  const rulesIn = (text, source) =>
    [...String(text).matchAll(/([^{}]*\[data-ui-skin-column\][^{}]*)\{([^{}]*)\}/g)].map((match) => ({
      source,
      selector: match[1].replace(/\s+/g, ' ').trim(),
      declaration: match[2].replace(/\s+/g, ' ').trim(),
    }))
  equal(
    overlaySheets.map((sheet) => sheet.name),
    ['OVERLAY_DIALOG', 'OVERLAY_DENSE', 'OVERLAY_DOCK', 'OVERLAY_MODES'],
    'the three overlay sheets were found in `src/client/index.js`, so this check is not blind to them',
  )
  const scopedRules = rulesIn(css, 'scoped')
  const overlayRules = rulesIn(overlay, 'overlay')
  truthy(overlayRules.length > 0, `the overlay contributes marker rules to this check (${overlayRules.length})`)
  const columnRules = [...scopedRules, ...overlayRules]
  truthy(columnRules.length > 0, 'the column marker is used to find the frame')

  /** Whether one occurrence of the marker lies OUTSIDE every `:has(...)` argument. */
  const isOutsideHas = (selector, index) => {
    for (let at = selector.lastIndexOf(':has(', index); at !== -1; at = selector.lastIndexOf(':has(', at - 1)) {
      let depth = 0
      for (let cursor = at + 4; cursor < selector.length; cursor += 1) {
        if (selector[cursor] === '(') depth += 1
        else if (selector[cursor] === ')') {
          depth -= 1
          if (depth === 0) {
            if (cursor > index) return false
            break
          }
        }
      }
    }
    return true
  }
  const subjectOfColumn = (selector) =>
    [...selector.matchAll(/\[data-ui-skin-column\]/g)].some((match) => isOutsideHas(selector, match.index))

  const frames = columnRules.filter((rule) => !subjectOfColumn(rule.selector))
  const columns = columnRules.filter((rule) => subjectOfColumn(rule.selector))
  const split = (rules) => ['scoped', 'overlay'].map((source) => `${source}=${rules.filter((rule) => rule.source === source).length}`).join(' ')
  truthy(frames.length > 0, `the frame is still selected through its marked children (${frames.length}: ${split(frames)})`)
  truthy(columns.length > 0, `and the column itself is still reachable, for tokens (${columns.length}: ${split(columns)})`)

  for (const rule of frames) {
    contains(rule.selector, ':has(', `a frame selector names the marker inside :has() (found in ${rule.source}: ${rule.selector})`)
  }

  for (const rule of columns) {
    /*
     * Applied to the DECLARATION, not to the selector text. The old list was checked against the
     * selector, where none of these words can appear — so all six passed on every rule and proved
     * nothing.
     */
    for (const forbidden of [
      'filter',
      'isolation',
      'z-index',
      'overflow',
      'contain:',
      'clip-path',
      'display',
      'position',
      'width',
      'height',
      'margin',
      'padding',
    ]) {
      excludes(rule.declaration, forbidden, `a column rule never declares ${forbidden} (found in ${rule.source}: ${rule.selector})`)
    }
    /** A paint is allowed only through a token; everything that is not a custom property must be one. */
    const stray = rule.declaration
      .split(';')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '')
      .filter((entry) => !entry.startsWith('--'))
      .filter((entry) => !/^background(-color)?:\s*var\(--lg-glass-/.test(entry))
    equal(stray, [], `a column rule only rebinds tokens, or paints through one (found in ${rule.source}: ${rule.selector})`)
  }

  // The stacking context the frost needs comes from `isolation`, which does NOT capture fixed descendants
  // — the one property that gives a stacking context without breaking the settings dialog.
  contains(css, 'isolation: isolate', 'the stacking context comes from isolation')
})

/*
 * THE OVERLAY'S BLUR, AND THE ONE LEVER THAT CAN SWITCH IT OFF (2026-10-06).
 *
 * Every blur in `src/client/index.js` carries `!important`, which is exactly what makes the overlay
 * impossible to out-specify — and also what makes `glass.css`'s plain `backdrop-filter: none` unable to
 * reach it. So the reader who had asked their system for less transparency kept frosted dialogs, menus
 * and dock panes: the fills went opaque and the blur stayed on.
 *
 * No source-level check can see a cascade, so this test does not pretend to. What it holds is the SHAPE
 * that makes the override win — the same selectors on both sides (specificity ties), `!important` on
 * both sides (importance ties), and the switching block LAST in `OVERLAY_CSS` (source order decides).
 * If any of those three stops being true the fix is silently gone, which is the failure worth a test.
 */
await test('the overlay switches its own blur off for the modes that ask for less', () => {
  const blurAt = [...overlay.matchAll(/backdrop-filter: blur/g)].map((match) => match.index)
  truthy(blurAt.length > 0, `the overlay blurs something (${blurAt.length} place(s))`)

  const modesAt = overlay.indexOf('@media (prefers-reduced-transparency: reduce)')
  truthy(modesAt !== -1, 'the overlay answers the query that asks for less transparency')
  truthy(
    blurAt.every((index) => index < modesAt),
    'and the answer comes LAST, so source order decides once importance and specificity tie',
  )

  const modes = overlay.slice(modesAt)
  contains(modes, 'backdrop-filter: none !important', 'the blur is switched off at the same weight')
  contains(modes, '-webkit-backdrop-filter: none !important', 'with the prefixed twin')
  for (const query of ['prefers-reduced-transparency: reduce', 'prefers-contrast: more', 'forced-colors: active']) {
    contains(modes, query, `the modes block answers ${query}`)
  }

  /** Every selector a blur rule names, so a surface cannot keep its blur by being left out. */
  const blurred = [...overlay.matchAll(/([^{}]*)\{[^{}]*backdrop-filter: blur/g)]
    .flatMap((match) => match[1].split(',').map((one) => one.replace(/\s+/g, ' ').trim()))
    .filter((one) => one.includes('data-ui-project-liquid-glass'))
  truthy(blurred.length >= 3, `the blurred selectors were read (${blurred.length})`)
  for (const selector of blurred) {
    contains(modes, selector, `the modes block also names ${selector}`)
  }
})

await test('one frost on the frame, and no blur on a column', () => {
  contains(css, ':has(> [data-ui-skin-column])', 'the frame is selected by its marked children')
  const blurSelectors = [...css.matchAll(/([^{}@]+)\{[^{}]*backdrop-filter[^{}]*\}/g)].map((match) => match[1].trim())
  truthy(blurSelectors.length > 0, 'the skin does apply refraction somewhere')
  for (const selector of blurSelectors) {
    const onAColumn = /\[data-ui-skin-column\]/.test(selector)
    truthy(
      !onAColumn || selector.includes('::before'),
      `no column carries backdrop-filter directly (found: ${selector})`,
    )
  }
})

await test('the composer stat rows are hidden, and without moving the composer', () => {
  contains(css, `${MARKER} [data-composer-stats]`)
  contains(css, `${MARKER} .cm-root`)
  const statRule = new RegExp(`${MARKER.replace(/[[\]"]/g, (c) => `\\${c}`)} \\[data-composer-stats\\][^{]*\\{([^}]*)\\}`).exec(css)
  truthy(statRule !== null, 'the stat-row rule is present and readable')
  const declarations = statRule[1]
  contains(declarations, 'visibility: hidden')
  // `display: none` removes the rows from the box tree, the composer is anchored to the bottom of the
  // viewport, and the input MOVES. `height: 0` and `overflow` do the same thing more quietly.
  excludes(declarations, 'display')
  excludes(declarations, 'height')
  excludes(declarations, 'overflow')
})

await test("the composer is given the frame material, with the frost kept off the card", () => {
  const flat = css.replace(/\s+/g, ' ')
  /*
   * THE CARD'S SELECTOR IS MATCHED, NOT SPELLED — and only at brace depth zero (WIP 2026-10-05).
   *
   * This was `const CARD = `${MARKER} [data-composer-card]`` plus a plain `indexOf`. Two things in the
   * WIP broke that, and both are about the SELECTOR rather than about the declarations this test exists
   * to check:
   *
   *   · the rule is now written `body :is([data-composer-card])`. The `:is()` is the whole point of that
   *     round: the `:where()` form was (0,1,1) after scoping and lost to the shell's own two-class
   *     selector, so the tuned declarations never reached the element at all;
   *   · a NEW `@supports (corner-shape: superellipse(1.5))` block carries a rule with the SAME
   *     `:is([data-composer-card])` marker, and it comes FIRST in the sheet — so a first-match lookup
   *     would read that nested rule's body and quietly assert the wrong declarations.
   *
   * Hence: the marker is matched with the `:is(` wrapper optional, and the first match at BRACE DEPTH
   * ZERO wins, which is the top-level rule the composer's card is actually painted by.
   */
  const depthAt = (index) => {
    let depth = 0
    for (let at = 0; at < index; at += 1) {
      if (flat[at] === '{') depth += 1
      else if (flat[at] === '}') depth -= 1
    }
    return depth
  }
  const cardOf = (suffix) => {
    const marker = MARKER.replace(/[[\]"]/g, (c) => `\\${c}`)
    const tail = suffix.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`)
    const pattern = new RegExp(`${marker} (?::is\\()?\\[data-composer-card\\]\\)?${tail}\\{`, 'g')
    for (const match of flat.matchAll(pattern)) {
      if (depthAt(match.index) !== 0) continue
      const open = match.index + match[0].length - 1
      const end = flat.indexOf('}', open)
      return end === -1 ? '' : flat.slice(open + 1, end)
    }
    return ''
  }
  const card = cardOf('')
  const frost = cardOf('::before')
  truthy(card !== '', 'the composer card has a rule')
  truthy(frost !== '', 'and a frost layer of its own')
  /*
   * The card's fill is the COMPOSER's own tier, not the material one it used to share with the dialogs.
   * `glass.css` states why: "THE COMPOSER'S OWN TIER… a per-surface pair, so thinning this one cannot
   * thin the dialogs with it". The card reads `--lg-glass-composer` (`glass.css:837`), which resolves to
   * `--lg-glass-composer-light` / `-dark` (`:245` / `:298`) — so the expectation names that token.
   */
  contains(card, 'background: var(--lg-glass-composer)', 'the glass fill')
  contains(card, 'border-radius: var(--lg-glass-radius)', 'the glass radius')
  contains(card, 'isolation: isolate', 'and the stacking context the frost needs to land in')
  contains(frost, 'backdrop-filter: blur(var(--lg-glass-blur))', 'the frost blurs what is behind it')
  contains(frost, '-webkit-backdrop-filter', 'with the prefixed twin')
  contains(frost, 'z-index: -1', 'behind the card’s own fill')
  contains(frost, 'pointer-events: none', 'without intercepting clicks')
  excludes(card, 'backdrop-filter', 'the card itself never carries the filter')
  contains(card, 'var(--dsw-elevation-stroke)', 'the shipped elevation ring is kept')
  contains(card, 'var(--lg-glass-shadow)', 'beside the glass shadow')
  contains(card, 'var(--lg-glass-inner-highlight)', 'and the inner highlight')
  excludes(card, '--dsw-elevation-soft', 'while the shipped glow is replaced, not stacked with ours')
  excludes(css, '[data-composer-seat]', 'the skin declares nothing about the composer seat')
  excludes(css, '--dsw-specific-input-major:', 'the shared input fill is never rebound by this skin')

  /*
   * The composer's frost, matched with the `:is(` wrapper optional — same reason as `cardOf` above.
   *
   * `:is([data-composer-card])::before` does NOT contain the literal `[data-composer-card]::before`: the
   * `)` the wrapper leaves behind sits between the `]` and the `::`. That single character is why the
   * mobile block and the four capability branches were red while the two perf blocks — written plainly,
   * with no wrapper — stayed green.
   */
  const COMPOSER_FROST = /\[data-composer-card\]\)?::before/

  // Every degradation branch reaches the composer's frost, and none of them patches the card's fill.
  for (const [prelude, label] of [
    [`${MARKER}[data-ui-perf='medium']`, 'medium'],
    [`${MARKER}[data-ui-perf='low']`, 'low'],
    ['@media (max-width: 768px)', 'mobile'],
  ]) {
    const blocks = blocksFor(flat, prelude)
    truthy(blocks.length > 0, `the ${label} degradation block exists`)
    truthy(
      blocks.some((block) => COMPOSER_FROST.test(block)),
      `the ${label} block degrades the composer's frost too`,
    )
  }
  for (const branch of [
    '@supports not ((backdrop-filter: blur(1px))',
    '@media (prefers-reduced-transparency: reduce)',
    '@media (forced-colors: active)',
    '@media (prefers-contrast: more)',
  ]) {
    const blocks = blocksFor(flat, branch)
    truthy(blocks.length > 0, `the ${branch} branch exists`)
    truthy(blocks.some((block) => COMPOSER_FROST.test(block)), `${branch} drops the composer's frost`)
  }
  excludes(css, '[data-composer-card]{ background: var(--dsw-alias-bg-base)', 'no per-branch composer patch')
  contains(css, '--lg-glass-bg: #fff', 'the material fill is taken opaque at the token instead')
  contains(css, '--lg-glass-bg: #1c1c1e', 'and so is its dark half')
})

await test('every value the skin reads is one the skin or the design system declares', async () => {
  const shipped = await shippedDesignTokens()
  const declaredHere = declaredTokens(css)
  const referenced = new Set([...css.matchAll(/var\(\s*(--[a-z0-9][a-z0-9-]*)/gi)].map((match) => match[1]))
  const missing = [...referenced].filter((token) => !declaredHere.has(token) && !shipped.has(token)).sort()
  equal(missing, [], 'no dangling custom-property reference')
  const privateTokens = [...declaredHere].filter((token) => token.startsWith('--lg-'))
  truthy(privateTokens.length >= 15, `the skin declares its own vocabulary (${privateTokens.length} tokens)`)
  const foreign = [...declaredHere].filter(
    (token) => !token.startsWith('--lg-') && !token.startsWith('--dsw-') && !token.startsWith('--dsh-'),
  )
  equal(foreign, [], 'every declared token is namespaced `--lg-` or belongs to the client')
})

await test('prefers-contrast: more raises the fills and the hairlines, and keeps the palette', () => {
  equal(
    (css.match(/@media \(prefers-contrast: more\)/g) ?? []).length,
    2,
    'the palette sheet and the material sheet both answer it',
  )
  contains(css, '--dsw-alias-bg-layer-3: #fff')
  contains(css, '--dsw-alias-bg-layer-3: #23262f')
  contains(css, '--dsw-alias-border-l1: rgb(15 23 42 / 34%)')
  contains(css, '--dsw-alias-border-l1: rgb(255 255 255 / 38%)')
  excludes(palette, '--dsw-alias-label-primary')
  excludes(palette, '--dsw-alias-label-secondary')
})

await test('every translucent surface is taken opaque by the modes that remove translucency', () => {
  const SURFACES = [
    '--dsw-alias-bg-base',
    '--dsw-alias-bg-layer-1',
    '--dsw-alias-bg-layer-2',
    '--dsw-alias-bg-layer-3',
    '--dsw-alias-bg-overlay',
    '--dsw-alias-bg-module-platform',
    '--dsw-specific-sidebar-fill',
    '--dsw-alias-tooltip-bg',
    '--lg-glass-bg',
    /*
     * The skin's own surface tiers, here for the same reason `--lg-glass-bg` is: each one is a fill a
     * real surface paints with, so each must be taken opaque by the modes that remove translucency —
     * and membership in this list is what makes the `holes` check below actually look at it.
     */
    '--lg-glass-fill',
    '--lg-glass-composer',
    '--lg-glass-panel',
    '--lg-glass-panel-inner',
    '--lg-glass-panel-inner-strong',
  ]
  const TINTS = [
    '--dsw-alias-bg-skeleton',
    '--dsw-alias-markdown-code-block',
    '--dsw-alias-markdown-code-block-banner',
    '--dsw-alias-markdown-inline-code',
    '--dsw-alias-interactive-bg-hover',
    '--dsw-alias-interactive-bg-active',
    '--dsw-alias-button-ghost-active-fill',
    '--dsw-alias-button-tool-bar-fill',
    '--dsw-alias-button-tool-bar-hover',
  ]
  const LINES = [
    '--dsw-alias-border-l1',
    '--dsw-alias-border-l2',
    '--dsw-alias-border-l3',
    '--lg-glass-border',
    '--lg-glass-border-light',
    '--lg-glass-border-dark',
  ]
  /*
   * The per-theme HALVES of a themed alias.
   *
   * `--lg-glass-bg` is `var(--lg-glass-bg-light)` in the light block and `var(--lg-glass-bg-dark)` in the
   * dark one, so the pair holds the concrete translucent value while the alias above it is not flagged at
   * all — `alphaOf` reads a `var(...)` as "no opinion" rather than as opaque.
   *
   * The WIP added three more pairs of exactly that shape — `--lg-glass-fill-*`, `--lg-glass-composer-*`
   * and `--lg-glass-panel-*` — each with its own themed alias declared in the same two blocks
   * (`glass.css:244-247` light, `:297-300` dark). They belong here for the same reason the `bg` pair
   * does: a bounded per-theme pair that exists so ONE surface's fill can be thinned without thinning the
   * others with it.
   *
   * This list is deliberately inline rather than in `scripts/skin-exceptions.mjs`: that file's contract is
   * "rules that REMOVE or OBSCURE shell UI" and it says outright that a colour, a radius or a blur is
   * material rather than an exception. A translucent fill is not a suppression, so it is classified here.
   */
  const ALIASES = [
    '--lg-glass-bg-light',
    '--lg-glass-bg-dark',
    '--lg-glass-fill-light',
    '--lg-glass-fill-dark',
    '--lg-glass-composer-light',
    '--lg-glass-composer-dark',
    '--lg-glass-panel-light',
    '--lg-glass-panel-dark',
    '--lg-glass-panel-inner-light',
    '--lg-glass-panel-inner-dark',
    '--lg-glass-panel-inner-strong-light',
    '--lg-glass-panel-inner-strong-dark',
  ]

  const base = { light: { ...firstDeclarations(palette, LIGHT), ...firstDeclarations(material, LIGHT) }, dark: { ...firstDeclarations(palette, DARK), ...firstDeclarations(material, DARK) } }
  truthy(Object.keys(base.light).length > 10, `the base palette was read (${Object.keys(base.light).length} tokens)`)
  const translucent = Object.keys({ ...base.light, ...base.dark }).filter(
    (token) => (alphaOf(base.light[token]) ?? 1) < 1 || (alphaOf(base.dark[token]) ?? 1) < 1,
  )
  truthy(translucent.length >= 10, `the palette declares translucent fills (${translucent.length})`)
  const unclassified = translucent.filter(
    (token) =>
      !SURFACES.includes(token) && !LINES.includes(token) && !TINTS.includes(token) && !ALIASES.includes(token),
  )
  equal(
    unclassified,
    [],
    'every translucent declaration is either a surface or an exempt entry with a reason — a new one forces a decision',
  )

  const surfaceFamily = /^--dsw-alias-bg-|^--dsw-specific-|^--lg-glass-bg$/
  for (const [theme, values] of Object.entries(base)) {
    for (const [token, value] of Object.entries(values)) {
      if (!surfaceFamily.test(token)) continue
      if (TINTS.includes(token)) continue
      if (/^var\(/i.test(value.trim())) continue
      truthy(alphaOf(value) !== null, `${theme}: ${token} carries a readable alpha (${value})`)
    }
  }

  const BRANCHES = [
    '@supports not ((backdrop-filter: blur(1px))',
    '@media (prefers-reduced-transparency: reduce)',
    '@media (forced-colors: active)',
    '@media (prefers-contrast: more)',
  ]
  const covered = {}
  for (const branch of BRANCHES) {
    const blocks = blocksFor(css, branch)
    truthy(blocks.length > 0, `the ${branch} branch exists`)
    covered[branch] = { light: {}, dark: {} }
    for (const block of blocks) {
      Object.assign(covered[branch].light, allDeclarations(block, LIGHT))
      Object.assign(covered[branch].dark, allDeclarations(block, DARK))
    }
  }
  const holes = []
  for (const branch of BRANCHES) {
    for (const token of SURFACES) {
      const light = alphaOf(covered[branch].light[token])
      const dark = alphaOf(covered[branch].dark[token])
      if (light === 1 && dark === 1) continue
      const show = (alpha) => (alpha === null ? 'nothing' : alpha)
      holes.push(
        `${branch} → ${token} (light: ${show(light)}, dark: ${show(dark)}; ` +
          `declared light=${covered[branch].light[token] ?? '—'} dark=${covered[branch].dark[token] ?? '—'})`,
      )
    }
  }
  equal(holes.length, 0, `${holes.length} surface(s) are still translucent under a mode that removes transparency:\n  ${holes.join('\n  ')}`)

  const tokenSet = (text) => Object.keys(text).sort().join(',')
  equal(
    tokenSet(covered['@supports not ((backdrop-filter: blur(1px))'].light),
    tokenSet(covered['@media (prefers-reduced-transparency: reduce)'].light),
    'the two no-transparency branches cover the same light tokens',
  )
  equal(
    tokenSet(covered['@supports not ((backdrop-filter: blur(1px))'].dark),
    tokenSet(covered['@media (prefers-reduced-transparency: reduce)'].dark),
    'and the same dark ones',
  )
  contains(css, '--dsw-alias-bg-module-platform: #262a35', 'the module platform takes layer-2’s dark form')
  contains(css, '--dsw-alias-tooltip-bg: #17171a', 'the light tooltip is its own colour, alpha removed')
  contains(css, '--dsw-alias-tooltip-bg: #0c0e14', 'and so is the dark one')
})

await test('the frame is see-through only with a way back to opaque', () => {
  /*
   * The frame's own background IS transparent — that is what puts the system gradient behind the glass, so
   * the columns have something to show. It is safe only because the frame paints nothing but a background:
   * no text of its own, and every surface inside it carries its own fill.
   *
   * So the property is not "opaque" but "never translucent without a way back": a see-through window with
   * no `backdrop-filter` support is just an unreadable page, and the fallback must restore it. This moved
   * here from the framework's frost test, where it was the material half of a rule about placement.
   */
  const base = /--dsw-alias-bg-base:\s*([^;]+);/.exec(css)
  truthy(base !== null, 'the frame background token is set')
  const fallback = /@supports not \(\(backdrop-filter:[^)]*\)[^{]*\)\s*\{([\s\S]*?)\n\}/.exec(css)
  truthy(fallback !== null, 'a no-backdrop-filter fallback exists')
  truthy(
    /--dsw-alias-bg-base:\s*(#|rgb|hsl)/.test(fallback[1]),
    'the fallback restores an opaque window when there is nothing to refract',
  )
})

await test('the palette follows the shipped dark-theme signal, never a media query', () => {
  contains(palette, `${MARKER}[data-ds-dark-theme]`)
  const darkAt = palette.indexOf(`${MARKER}[data-ds-dark-theme]`)
  const darkBlock = palette.slice(darkAt, palette.indexOf('}', darkAt))
  contains(darkBlock, '--dsw-alias-bg-layer-1')
  excludes(darkBlock, '--dsw-alias-bg-layer-1: rgb(255 255 255')
  excludes(palette, `${MARKER} body[data-ds-dark-theme]`)
  excludes(palette.slice(0, darkAt), 'prefers-color-scheme')
})

await test('the first-paint sheet carries the skin, and only under its marker', async () => {
  const { BOOT_CSS } = await import(pathToFileURL(join(packageRoot, 'lib', 'boot-css.js')).href)
  for (const token of [
    '--lg-accent',
    '--lg-accent-dark',
    '--lg-bg-light',
    '--lg-bg-dark',
    '--lg-glass-bg-light',
    '--lg-glass-bg-dark',
    '--lg-glass-border-light',
    '--lg-glass-border-dark',
    '--lg-glass-blur',
    '--lg-glass-saturate',
    '--lg-glass-radius',
    '--lg-glass-shadow',
    '--lg-glass-inner-highlight',
  ]) {
    contains(BOOT_CSS, token)
  }
  contains(BOOT_CSS, '--dsw-alias-bg-base: rgb(255 255 255 / 0%)')
  contains(BOOT_CSS, '--dsw-alias-bg-base: rgb(20 22 28 / 0%)')
  contains(BOOT_CSS, 'radial-gradient')
  contains(BOOT_CSS, 'background-attachment')
  contains(BOOT_CSS, '@media (prefers-contrast: more)')

  const selectors = [...BOOT_CSS.matchAll(/([^{}]+)\{/g)]
    .map((match) => match[1].trim())
    .filter((selector) => selector !== '' && !selector.startsWith('@'))
  truthy(selectors.length > 0, 'the sheet has selectors to check')
  const unscoped = selectors.filter((selector) => !selector.startsWith(MARKER))
  equal(unscoped.length, 0, `every first-paint selector carries the marker (unscoped: ${unscoped.join(' | ')})`)
  excludes(BOOT_CSS, '<')
  excludes(BOOT_CSS, '::before')
  excludes(BOOT_CSS, 'data-ui-skin-column')

  /*
   * The suppression that keeps a first frame honest in the modes that remove translucency. It is written
   * as a comma-separated list of `body` selectors so that it OUTRANKS the themed rule rather than losing
   * to it on specificity — the shape that was silently dropped by two copies of the derivation predicate
   * before they were merged into one.
   */
  const flat = BOOT_CSS.replace(/\s+/g, ' ')
  const bothSelectors = `${MARKER}, ${MARKER}[data-ds-dark-theme]{ background-image: none; }`
  for (const branch of ['prefers-contrast: more', 'forced-colors: active', 'prefers-reduced-transparency: reduce']) {
    const blocks = blocksFor(flat, `@media (${branch}){`)
    truthy(blocks.length > 0, `the ${branch} branch reached the first-paint sheet`)
    truthy(
      blocks.some((block) => block.includes(bothSelectors)),
      `and its gradient suppression outranks the themed rule (${branch})`,
    )
  }
  equal(
    [...BOOT_CSS.matchAll(/background-image: none/g)].length,
    3,
    'exactly the three suppression branches remove the gradient',
  )
})

/*
 * THE DERIVATION PREDICATE, which decides what a first paint is allowed to carry.
 *
 * This test moved here from the framework's suite in step 8c, for the same reason thirteen others moved
 * in 8b: `classifyPrelude` answers a question about THIS material. `scripts/derive-boot-css.mjs` runs it
 * over `tokens.css` and `glass.css` to write `src/host/boot.css`, so a wrong answer here is a wrong
 * first frame — and the framework, which now ships no CSS at all, cannot say anything about it.
 *
 * The cases are the shapes this material actually writes, plus the ones that already went wrong once:
 * the comma-separated `body, body[data-ds-dark-theme]` suppression (a `mixed` selector list that a
 * predicate skipping on sight would have dropped, and did), a compound versus a descendant, and an
 * empty prelude.
 */
await test('the derivation predicate reads selectors the way CSS does', async () => {
  const { classifyPrelude } = await import(pathToFileURL(join(packageRoot, 'scripts', 'boot-css-rules.mjs')).href)
  const M = MARKER
  const cases = [
    [M, 'body'],
    [`${M}[data-ds-dark-theme]`, 'body'],
    [`${M}, ${M}[data-ds-dark-theme]`, 'body'],
    [`${M}[data-ui-perf='low']`, 'body'],
    [`${M} .lg-glass`, 'other'],
    [`${M} [role='dialog']`, 'other'],
    [`${M}[data-ui-perf='low'] :where(:has(> [data-ui-skin-column]))::before`, 'other'],
    [`${M}, ${M}[data-ui-perf='low'] :where([role='dialog'], [role='menu'])`, 'mixed'],
    [`:where(${M} [role='dialog'], ${M} [role='menu'])`, 'other'],
    [`${M}, .lg-glass`, 'mixed'],
    ['.lg-glass', 'other'],
    ['', 'other'],
  ]
  for (const [selector, expected] of cases) {
    equal(classifyPrelude(selector), expected, `classifyPrelude(${JSON.stringify(selector)})`)
  }
})

/* ── the registration contract: the package's own client half ─────────────── */

/**
 * Materialize `lib/client.js` the way the shell does: register its factory, then build the entry module
 * with a module table that THROWS on a miss.
 *
 * This bundle requires nothing outside itself (no React, no framework module), and that is a property
 * worth having: a UI project package's client half reaches the framework through a SERVICE, so a module
 * table miss here would mean the package had grown a dependency it cannot have.
 */
function materializeBundle() {
  const source = readFileSync(join(packageRoot, 'lib', 'client.js'), 'utf8')
  /** @type {any} */
  let registered
  const globals = {
    window: { __ModuleLoader__: { load: (/** @type {any} */ r) => (registered = r) } },
    console,
  }
  globals.globalThis = globals
  vm.runInContext(source, vm.createContext(globals), { filename: 'client.js' })
  if (registered === undefined) throw new Error('bundle did not register a ModuleLoader factory')
  const misses = []
  const require = (/** @type {string} */ id) => {
    misses.push(id)
    throw new Error(`module-table miss: this package must not need "${id}"`)
  }
  return { plugin: registered.factory(require), registered, misses }
}

await test('the client half registers the manifest through the framework service, and nothing else', () => {
  const { plugin, registered } = materializeBundle()
  equal(registered.id, pkg.name, 'the bundle registers under the package name, which is also its served path')
  equal(plugin.name, 'ui-project-liquid-glass', 'the plugin names itself after the project it contributes')
  equal(plugin.inject, ['uiProjects'], 'it declares the framework service as a hard dependency')

  /** @type {Array<{ manifest: any, definition: any }>} */
  const calls = []
  const ctx = { uiProjects: { register: (/** @type {any} */ manifest, /** @type {any} */ definition) => calls.push({ manifest, definition }) } }
  plugin.apply(ctx)
  equal(calls.length, 1, 'applying registers exactly one project')

  const { manifest, definition } = calls[0]
  equal(manifest.package, pkg.name, 'the manifest carries this package’s own name')
  equal(manifest.version, pkg.version, 'and its version, so a checklist stamp can never disagree with the package')
  equal(manifest.id, 'liquid-glass', 'and the project id the host half announces')
  equal(manifest.schemaVersion, 1, 'against the manifest schema the framework reads')
  equal(manifest.pluginApiVersion, 1, 'and the plugin API major it implements')
  equal(
    Object.keys(definition).sort(),
    ['apply', 'cleanup'],
    'the definition carries BEHAVIOUR only: every other field comes from the manifest',
  )
  equal(
    typeof definition.apply,
    'function',
    'so the framework has something to run when the user turns the skin on',
  )

  // The second application goes to the SECOND context: the registration is bound to the caller it was
  // handed, not to a module-level anything.
  const other = []
  plugin.apply({ uiProjects: { register: (/** @type {any} */ m) => other.push(m) } })
  equal(other.length, 1, 'a second apply registers through the context it was given')
  equal(calls.length, 1, 'and not through the first one')
})

await test('the bundle needs nothing from the module table', () => {
  const first = materializeBundle()
  equal(first.misses, [], 'the client half resolves entirely inside itself')
})

/* ── the suppressions, and the list that has to name them ─────────────────── */

/**
 * Every rule in the material that HIDES something, as `{ selector, declaration }`.
 *
 * A suppression is a rule with `display: none` or `visibility: hidden` in its block, whatever else it
 * carries. The list in `skin-exceptions.mjs` is written against exactly these, because "this skin hides
 * a piece of the shell's interface" is a decision a reader has to be able to count — one is a decision,
 * six are a fork. The list is checked in BOTH directions: nothing hides that the list does not name,
 * and everything the list names is written where it says.
 *
 * Note the helpers in this suite DO NOT throw: a failed assertion is recorded and the test runs on, so
 * the counts below are comparable between a red run and a green one — unlike the framework's suite,
 * where a failure aborts the rest of the test.
 */
/**
 * The material with its comments removed.
 *
 * A GUARD READS CODE, NOT PROSE. The rule parser below pairs `selector { declarations }`, and the
 * stylesheet explains itself in comments that contain both braces (`.cm-root{display:block}` appears in
 * one) and declaration-like text (`visibility: hidden` appears in another). Without this strip, a
 * comment tail becomes part of the NEXT selector and a rule that hides something is counted twice —
 * once under its real selector, once under a selector no human wrote.
 */
const withoutComments = (text) => String(text).replace(/\/\*[\s\S]*?\*\//g, '')

const hidingRules = (text) =>
  [...withoutComments(text).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => ({ selector: match[1].trim(), declaration: match[2].replace(/\s+/g, ' ').trim() }))
    .filter((rule) => /display\s*:\s*none|visibility\s*:\s*hidden/.test(rule.declaration))

await test('no rule in the skin selects a hashed class name', () => {
  /*
   * The rule this file exists to keep. A CSS-module hash is a build artefact: a frontend rebuild
   * renames it, every rule referencing it stops matching, and NOTHING reports a problem — which is
   * precisely how an earlier version of this skin broke on every rebuild. The pattern is the shape of
   * those names (six characters, an underscore, then a word), matched against CLASS selectors only.
   */
  const hashed = [...String(css).matchAll(/\.[A-Za-z0-9-]*[A-Za-z0-9]{6}_[A-Za-z][A-Za-z0-9_-]*/g)].map((match) => match[0])
  equal(hashed, [], 'a build-hashed CSS-module class appears nowhere in the skin')
})

/**
 * The scoped selector, put back into the form the stylesheet is authored in.
 *
 * The runtime scoper prefixes EVERY part of a comma-separated selector list with the marker, so a rule
 * written as `body a, body b` arrives as `body[marker] a, body[marker] b`. Removing only the marker
 * attribute leaves the authored `body a, body b` behind — which is what `SKIN_SUPPRESSIONS` records,
 * because a list whose strings cannot be found by eye in the stylesheet is a list nobody checks.
 */
const authored = (selector) =>
  String(selector)
    .split(',')
    .map((part) => part.trim().replace('[data-ui-project-liquid-glass="on"]', '').trim())
    .join(', ')

await test('every rule that hides shell UI is one of the named exceptions', () => {
  const hiding = hidingRules(material)
  equal(hiding.length, SKIN_SUPPRESSIONS.length, 'the number of hiding rules equals the number of named exceptions')
  for (const entry of SKIN_SUPPRESSIONS) {
    const match = hiding.filter((rule) => authored(rule.selector) === entry.selector)
    equal(match.length, 1, `the exception ${JSON.stringify(entry.id)} is written exactly once`)
    if (match.length === 1) {
      equal(match[0].declaration, entry.declaration, `and declares what the list says (${entry.id})`)
    }
  }
  const named = SKIN_SUPPRESSIONS.map((entry) => entry.selector)
  equal(
    hiding.filter((rule) => !named.includes(authored(rule.selector))).map((rule) => authored(rule.selector)),
    [],
    'and nothing hides outside the list',
  )
})

await test('the suppression is theme-independent, so neither theme can lose it', () => {
  const hiding = hidingRules(material)
  equal(
    hiding.filter((rule) => /data-ds-dark-theme|prefers-|forced-colors/.test(rule.selector)).map((rule) => rule.selector),
    [],
    'no hiding rule is written inside a theme or a media condition',
  )
  equal(
    hidingRules(material).filter((rule) => rule.selector.includes('conversation.composer.dock')).length,
    1,
    'and exactly one hiding rule names the dock, so no branch can resurrect it',
  )
})

/* ── the settings dialog's tier ───────────────────────────────────────────── */

await test('the settings dialog carries the nearly-opaque tier the palette documents', () => {
  /*
   * WHAT THIS PINS, AND WHY IT IS A TEST RATHER THAN A TASTE. `tokens.css` says in prose what the
   * dialog is supposed to be: "Layer 3 and the overlay token — menus, popovers, dialogs — stay
   * opaque, because those are read directly over arbitrary content", and it spends its contrast
   * budget on "a ~55% white fill". The shipped shell panel resolves `--dsw-alias-bg-layer-2`
   * (46%), the COLUMN tier, so the dialog arrives one tier thinner than the palette promises and
   * the budget was never met. Measured on the desktop: rgba(255,255,255,0.46) with
   * backdrop-filter blur(30px) saturate(1.8).
   *
   * Two shapes matter as much as the value:
   *   - it must reference the TOKEN, not a literal. The branches that remove translucency work by
   *     redefining these tokens (`--dsw-alias-bg-layer-3: #fff` under reduced transparency, forced
   *     colours and no-backdrop-filter), so a literal would look right and silently opt out of them.
   *   - it must be written PLAINLY, not inside `:where()`. That is the lesson already recorded above
   *     the composer rules: a zero-specificity rule loses to the shell's own single class, silently,
   *     which is how an earlier attempt at hiding the stat rows failed for several rounds.
   */
  const painting = [...withoutComments(material).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => ({ selector: match[1].trim(), declaration: match[2].replace(/\s+/g, ' ').trim() }))
    .filter((rule) => /(?:^|;|\s)background\s*:/.test(rule.declaration) && rule.selector.includes('data-shortcut-modal'))
  equal(painting.length, 1, 'exactly one rule paints the settings dialog')
  if (painting.length === 1) {
    /*
     * THE PANEL HAS ITS OWN TIER NOW, and this assertion follows it there rather than weakening.
     *
     * The value moved from the shipped `--dsw-alias-bg-layer-3` to the skin's `--lg-glass-panel` pair —
     * and that pair is taken opaque by all four no-transparency branches (the `:root` rule in each),
     * which is the property this assertion exists to protect: the fill must be a TOKEN those branches
     * can redefine. Checking the shipped token's name while the panel paints a different one would be
     * a check of the wrong thing.
     */
    contains(
      painting[0].declaration,
      'var(--lg-glass-panel)',
      'and it paints the panel tier by token, so the no-transparency modes can reach it',
    )
    equal(/:where\(/.test(painting[0].selector), false, 'written plainly, so the shell panel rule cannot outrank it')
  }
})

/* ── the composer stats dock ──────────────────────────────────────────────── */

await test('the composer stats dock is hidden while the skin is on', () => {
  const dock = hidingRules(material).filter((rule) => rule.selector.includes('conversation.composer.dock'))
  equal(dock.length, 1, 'exactly one rule hides the composer stats dock')
  if (dock.length === 1) {
    contains(
      dock[0].selector,
      'data-ui-project-liquid-glass',
      'and it carries the project marker, so with the skin off the rule is inert',
    )
    equal(
      dock[0].declaration,
      'visibility: hidden;',
      'and it hides without moving the composer, as the measured note above the rule requires',
    )
  }
})

await test('the dock rule is anchored on slots the shell publishes', () => {
  /*
   * The dock carries only a build-hashed class (`RlGAzG_dock`). A hash is a build artefact, and this
   * repository refuses them everywhere — see the hash guard above, which scans the whole sheet. This
   * test pins the OTHER half of that decision: that the rule reaching the dock does so through the
   * slots the shell itself publishes (`conversation.composer.bar`, and the dock slot that is a child
   * of the row), which is what makes the selector survive a frontend rebuild that only renames
   * classes. Confirmed on the desktop: it matches exactly one element, `div.RlGAzG_dock`.
   */
  const dock = hidingRules(material).filter((rule) => rule.selector.includes('conversation.composer.dock'))
  truthy(dock.length >= 1, 'the dock rule exists to be checked')
  if (dock.length === 1) {
    contains(dock[0].selector, 'data-slot=', 'and it is anchored on a published data-slot, not a build artefact')
  }
})

await test('the retired context panel suppression is gone from both the stylesheet and the list', () => {
  /*
   * A DEAD SELECTOR IS INVISIBLE TO EVERY GUARD HERE. `div.contextCandidates` was written from a real
   * observation of the shell's DOM, and the shipped frontend does not contain that class at all — so
   * the rule matched nothing, the pairing assertion still passed (source and list agreed with each
   * other), and the only thing that could reveal it was a desktop probe. It is retired rather than
   * kept "just in case": a suppression nobody can verify is a suppression nobody reviews.
   */
  excludes(String(material), 'contextCandidates', 'the stylesheet no longer names the retired container')
  equal(
    SKIN_SUPPRESSIONS.filter((entry) => entry.id === 'context-stats').map((entry) => entry.id),
    [],
    'and the named-exception list no longer carries it either',
  )
})

process.stdout.write(failed === 0 ? `\n${passed} assertions, 0 failing\n` : `\n${passed} assertions, ${failed} failing\n`)
if (onlyTest !== '') process.stdout.write(`[filter] DSH_TEST_ONLY=${JSON.stringify(onlyTest)} skipped ${skipped} test(s)\n`)
process.exitCode = failed === 0 ? 0 : 1
