/**
 * Build @xjl-resources/dsh-plugin-liquid-glass.
 *
 * The bundle rules live in `dsh-ui-projects/scripts/bundle-client.mjs` — one copy of the ESM→CJS rewrite
 * and the module-registry wrapper, shared by every UI project package (see the framework's
 * CONTRIBUTING.md). What is specific to this package is three lines: which files are in the graph, what
 * the shell's module loader calls the bundle, and where the generated files go.
 *
 *   src/client/**\/*.js  →  lib/client.js   (one lazy-CJS bundle)
 *   src/host/**\/*.js    →  lib/**\/*.js    (plain ESM, copied verbatim)
 *   src/host/boot.css    →  lib/boot-css.js (the first-paint payload, generated from that file)
 *
 * THE FIRST PAINT IS DERIVED ELSEWHERE AND CHECKED HERE. `src/host/boot.css` is the body-level subset of
 * this package's own stylesheets, produced by `derive-boot-css.mjs --package <this dir>`. This build does
 * not write it — it asserts, by RUNNING that tool in `--check` mode, that the file on disk is still what
 * the stylesheets imply. Re-implementing the predicate here was the first attempt and it was wrong within
 * the hour: a copy that splits top-level segments cannot see a body-level rule inside `@supports`, so it
 * reported eight "undeclared" rules that the tool had derived correctly. One implementation, invoked.
 *
 * The derivation tool lives beside this build, in this package's `scripts/`: it belongs to the package whose
 * CSS it derives, and it arrived here in step 56h-5 from the workspace's `tools/` directory.
 */
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { renderBundle } from '../../../.dev/dsh-ui-projects/scripts/bundle-client.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const clientRoot = join(packageRoot, 'src', 'client')
const hostRoot = join(packageRoot, 'src', 'host')
const outClient = join(packageRoot, 'lib', 'client.js')
const outBootCss = join(packageRoot, 'lib', 'boot-css.js')
const bootCssSource = join(packageRoot, 'src', 'host', 'boot.css')

/** The shell's module loader keys this bundle by the package name, which is also its URL. */
const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))

/** Every file under `src/client` that must appear in the bundle, entry last. */
const MODULE_ORDER = [
  'projects/liquid-glass/skin.js',
  'projects/liquid-glass/tokens.css',
  'projects/liquid-glass/glass.css',
  'manifest.generated.js',
  'index.js',
]

/**
 * The project id the host half announces, read out of its source.
 *
 * Checked rather than imported: the host half is ESM for Node and cannot be loaded by this build's own
 * module graph, and a check is what is wanted here anyway — an equality assertion against the manifest,
 * not a second source of the value.
 */
async function readAnnouncedProjectId() {
  const source = await readFile(join(hostRoot, 'index.js'), 'utf8')
  const match = source.match(/^const PROJECT_ID = ['"]([^'"]+)['"]/m)
  if (match === null) throw new Error('[build] src/host/index.js declares no PROJECT_ID')
  return match[1]
}

/**
 * The derivation tool, which lives beside this build.
 *
 * It is not SEARCHED for. Before it moved here the lookup had two places to try — a package-local copy, then
 * the workspace's `tools/` — because the file it wanted was in the second one and the first was where it was
 * going. It exists in exactly one place now, so a missing tool is a broken checkout, and naming the path is
 * more useful than a fallback that would find someone else's copy.
 * @returns {string}
 */
function findDeriveTool() {
  const tool = join(here, 'derive-boot-css.mjs')
  if (!existsSync(tool)) {
    throw new Error(`[build] missing ${tool} — it derives src/host/boot.css and lives beside this build`)
  }
  return tool
}

/**
 * Run the derivation tool in check mode and turn a stale sheet into a build failure.
 *
 * `stdio: 'inherit'` rather than a pipe, deliberately: this project's tooling runs under a sandbox that
 * forbids piped children, and a check that only works outside the sandbox is not a check. The tool's own
 * line (`boot.css is up to date — …`) is what the build prints, so nothing has to be captured.
 */
function checkBootCss() {
  const tool = findDeriveTool()
  try {
    execFileSync(process.execPath, [tool, '--package', packageRoot, '--check'], { stdio: 'inherit' })
  } catch {
    throw new Error(
      `[build] src/host/boot.css is not what this package's stylesheets imply (the tool's report is above).\n` +
        `[build] Re-derive it: node scripts/derive-boot-css.mjs --package ${packageRoot}`,
    )
  }
}

if (!existsSync(clientRoot)) throw new Error(`[build] missing ${clientRoot}`)
if (!existsSync(hostRoot)) throw new Error(`[build] missing ${hostRoot}`)
if (!existsSync(bootCssSource)) {
  throw new Error(`[build] missing ${bootCssSource}; derive it: node scripts/derive-boot-css.mjs --package ${packageRoot}`)
}

const declared = pkg.dsh?.uiProject
if (declared === undefined) {
  throw new Error(`[build] ${pkg.name} declares no dsh.uiProject; it is not a UI project package`)
}
for (const required of ['bundle', 'client']) {
  if (pkg.dsh?.[required] === undefined) {
    throw new Error(
      `[build] ${pkg.name} declares dsh.uiProject but no dsh.${required}; the loader would never ` +
        `admit it (dsh.bundle) or never deliver the browser half (dsh.client)`,
    )
  }
}

const announced = await readAnnouncedProjectId()
if (announced !== declared.id) {
  throw new Error(
    `[build] the host half announces project "${announced}" but package.json declares ` +
      `"${declared.id}" — the first-paint rows and the registration would describe two projects`,
  )
}

const check = checkBootCss()
void check

const { code, ordered, externals, undeclared } = await renderBundle({  packageRoot,
  clientRoot,
  moduleOrder: MODULE_ORDER,
  loaderId: pkg.name,
  loaderName: declared.id,
  generator: 'scripts/build.mjs',
})
if (undeclared.length > 0) {
  throw new Error(`[build] ${undeclared.join(', ')} under src/client is not in MODULE_ORDER and would not ship`)
}

await mkdir(dirname(outClient), { recursive: true })
await writeFile(outClient, code, 'utf8')

/** The host half, verbatim, structure preserved. */
const hostFiles = []
for (const entry of await readdir(hostRoot, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.js')) hostFiles.push(join(hostRoot, entry.name))
}
if (hostFiles.some((file) => file.endsWith('boot-css.js'))) {
  throw new Error(
    '[build] src/host/boot-css.js would be overwritten by the generated lib/boot-css.js; the first-paint ' +
      'payload belongs in src/host/boot.css, not in a module of its own',
  )
}
for (const file of hostFiles) {
  const rel = relative(hostRoot, file).split(sep).join('/')
  await mkdir(dirname(join(packageRoot, 'lib', rel)), { recursive: true })
  await writeFile(join(packageRoot, 'lib', rel), await readFile(file, 'utf8'), 'utf8')
}

/*
 * The generated module is a byte-for-byte copy of the payload, with comments removed — the same rule the
 * framework's build applies, for the same reason: the sheet is inlined into every rendered index, and the
 * header is prose for whoever opens the source file. The page gets the declarations only.
 */
const payload = (await readFile(bootCssSource, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').trim()
const bootModule = `/**
 * GENERATED by scripts/build.mjs — do not edit.
 *
 * The first-paint subset of the Liquid Glass stylesheet, sourced from src/host/boot.css. That file is
 * derived from this package's own tokens.css and glass.css, and this build RUNS the derivation tool in
 * check mode before writing this module — so a stale sheet fails the build instead of shipping.
 */
export const BOOT_CSS = ${JSON.stringify(payload)}
`
await writeFile(outBootCss, bootModule, 'utf8')

const digest = createHash('sha256').update(code).digest('hex').slice(0, 12)
process.stdout.write(
  `[build] lib/client.js ← ${ordered.length} modules, ${Buffer.byteLength(code, 'utf8')} bytes, sha256:${digest}\n` +
    `[build] lib/ ← ${hostFiles.length} host file(s) + boot-css.js (${Buffer.byteLength(payload, 'utf8')} bytes)\n` +
    `[build] first paint: the derivation tool reported the sheet is up to date\n` +
    `[build] project "${declared.id}" from ${pkg.name}@${pkg.version}; externals: ${externals.sort().join(', ') || '(none)'}\n`,
)
