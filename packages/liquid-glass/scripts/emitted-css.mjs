/**
 * Print the rules this package's stylesheets emit, as the browser receives them.
 *
 * Assertions test properties; this shows the actual text. Every silent failure in this material
 * was a rule that looked right in the source and did something else once scoped — a marker on a
 * descendant instead of the element itself, a branch of a selector list left unscoped, a
 * `:where()` wrapper quietly conceding a specificity fight. Reading the output settles those in
 * one glance.
 *
 * It moved here from the framework in step 8c, and it stopped holding any copy of its own
 * parameters on the way: the marker and the stylesheet list come from `./boot-css-rules.mjs`, the
 * same module `scripts/derive-boot-css.mjs` reads to write `src/host/boot.css`.
 *
 * Usage: node scripts/emitted-css.mjs [substring ...]
 */
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MARKER, SKIN_DIR, SKIN_STYLESHEETS } from './boot-css-rules.mjs'
import { scopeCss } from '../../../.dev/dsh-ui-projects/src/client/scope-css.js'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const filters = process.argv.slice(2)

for (const file of SKIN_STYLESHEETS) {
  const raw = await readFile(join(packageRoot, SKIN_DIR, file), 'utf8')
  const scoped = scopeCss(MARKER, raw)
  const blocks = scoped.split('\n').filter((line) => line.trim().length > 0)

  process.stdout.write(`\n══ ${file} ══\n`)
  for (const line of blocks) {
    if (line.trimStart().startsWith('/*') || line.trimStart().startsWith('*')) continue
    if (filters.length > 0 && !filters.some((needle) => line.includes(needle))) continue
    process.stdout.write(`${line}\n`)
  }
}
