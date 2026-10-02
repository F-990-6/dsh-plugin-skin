/**
 * @xjl-resources/dsh-plugin-liquid-glass — self-check.
 *
 * What a package can check about ITSELF, without a composition, a deployment or a browser:
 *
 *   the two halves exist and were built          `lib/index.js`, `lib/client.js`, `lib/boot-css.js`
 *   the host half announces the declared project  its PROJECT_ID against package.json
 *   the patch file the loader reads is shaped     exactly one row, naming this package
 *   the four declarations the loader needs        dsh.bundle / dsh.client / dsh.uiProject / compatibility
 *   the framework it is a peer of                 declared, and the service it registers through
 *   the first paint it pushes                     the three rows the host service formats
 *   the wrapper's forwarding surface              the framework's parameters, declared one for one
 *
 * Manifest freshness is NOT re-derived here: that is `derive-manifest.mjs --check`, wired as
 * `npm run manifest`, and re-implementing it would be a second copy of the rule. The MATERIAL is
 * `scripts/verify.mjs`'s job — this file is about the package's declarations and its built artefacts.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0
let failed = 0
const ok = (label) => {
  passed += 1
  process.stdout.write(`  ok   ${label}\n`)
}
const fail = (label) => {
  failed += 1
  process.stdout.write(`  FAIL ${label}\n`)
}
const check = (condition, label) => (condition ? ok(label) : fail(label))
const equal = (actual, expected, label) =>
  JSON.stringify(actual) === JSON.stringify(expected) ? ok(label) : fail(`${label} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`)

/**
 * Strip PowerShell's two comment forms so a text sentinel reads CODE rather than the prose explaining it.
 *
 * CONTRIBUTING rule 5, and this is its fourth outing: the wrapper's own header names the `$Rest` bug it
 * used to have, so a raw scan for `$Rest` fails on its own documentation (and a comment that happens to
 * contain the guarded text would pass for the code it is looking for).
 */
function stripComments(source) {
  return String(source)
    .replace(/<#[\s\S]*?#>/g, '')
    .split('\n')
    .map((line) => (line.includes('#') ? line.slice(0, line.indexOf('#')) : line))
    .join('\n')
}

const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
const declared = pkg.dsh?.uiProject

check(declared !== undefined, 'package.json declares dsh.uiProject, which is what makes this a UI project package')
for (const key of ['bundle', 'client', 'compatibility']) {
  check(pkg.dsh?.[key] !== undefined, `package.json declares dsh.${key}`)
}
check(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'dsh.bundle.patch points at the patch file the loader reads')

/*
 * THE PEER, which is the one declaration no other check can make: this package reaches the framework
 * through a SERVICE (`uiProjects` on the client, `uiProjectsHost` on the host), so nothing in Node would
 * ever fail to resolve without it — the row would simply wait forever. Declaring the peer is what makes
 * the dependency a fact an installer can verify, and what makes `bootRows` a contract rather than a hope.
 */
equal(pkg.peerDependencies?.['dsh-ui-projects'], '^0.1.0', 'the framework is declared as a peer, not left implicit')

const clientBundle = join(packageRoot, 'lib', 'client.js')
const hostHalf = join(packageRoot, 'lib', 'index.js')
const bootCss = join(packageRoot, 'lib', 'boot-css.js')
check(existsSync(clientBundle), 'lib/client.js exists (npm run build)')
check(existsSync(hostHalf), 'lib/index.js exists (npm run build)')
check(existsSync(bootCss), 'lib/boot-css.js exists (npm run build)')

if (existsSync(clientBundle)) {
  const bundle = readFileSync(clientBundle, 'utf8')
  check(bundle.includes(`id: '${pkg.name}'`), 'the bundle registers under the package name, which is also its served path')
  check(bundle.includes(`name: '${declared?.id}'`), 'the bundle reports the project id as its loader name')
  check(bundle.includes("inject: ['uiProjects']"), 'the client half declares the framework service it registers through')
}
if (existsSync(hostHalf)) {
  const source = readFileSync(hostHalf, 'utf8')
  const announced = source.match(/^const PROJECT_ID = ['"]([^'"]+)['"]/m)?.[1]
  check(
    announced === declared?.id,
    `the host half announces the declared project id (${JSON.stringify(announced)} vs ${JSON.stringify(declared?.id)})`,
  )
  check(source.includes("inject = ['uiProjectsHost']"), 'the host half injects the first-paint service instead of hoping it is there')
  check(source.includes('bootRows(PROJECT_ID, BOOT_CSS)'), 'and hands that service its own stylesheet, which is what makes the first paint this skin’s')
}
if (existsSync(bootCss)) {
  const module = readFileSync(bootCss, 'utf8')
  /*
   * The payload is a JSON string inside a generated module, so its quotes arrive escaped
   * (`body[data-ui-project-liquid-glass=\"on\"]`). Asserting the unescaped selector is how this check
   * failed its first run — the value was right and the needle was wrong.
   */
  check(
    module.includes('body[data-ui-project-liquid-glass=\\"on\\"]'),
    'the generated first-paint payload carries this project’s marker',
  )
  check(!module.includes('<'), 'and contains no "<", so it is safe to inline into an element')
}

const patchPath = join(packageRoot, 'cordis.patch.yml')
if (existsSync(patchPath)) {
  const text = readFileSync(patchPath, 'utf8')
  const rows = [...text.matchAll(/^\s*-\s*id:\s*(\S+)\s*$/gm)]
  check(rows.length === 1, 'the bundle patch inserts exactly one row')
  check(text.includes(`name: "${pkg.name}"`), 'the row resolves this package by name, quoted because the name is scoped')
} else {
  fail('cordis.patch.yml is missing, so the loader has nothing to admit')
}

const wrapper = join(packageRoot, 'install.ps1')
check(existsSync(wrapper), 'install.ps1 exists: the maintenance commands printed on a card are run from this directory')
if (existsSync(wrapper)) {
  const text = readFileSync(wrapper, 'utf8')
  /*
   * The last two are LOCAL SENTINELS: fast, and they need no PowerShell. The AUTHORITATIVE check is the
   * framework's `verify.mjs`, which reads both parameter blocks with PowerShell's own parser and asserts
   * the surfaces match name for name and type for type, then runs this wrapper against a fake framework
   * to prove the forwarding genuinely lands. These two exist so that a mistake shows up in this package's
   * own second-long check instead of only there — and the 8e-1 bug is why they are about `$Rest` rather
   * than about the copy.
   */
  const code = stripComments(text)
  check(text.includes('dsh-ui-projects'), 'the wrapper resolves the framework script rather than copying it')
  /*
   * This one used to look for the literal `-SourceDir $PSScriptRoot`, and it FAILED the moment the
   * forwarding changed shape (the command is now built into a hashtable). That is the right kind of
   * failure — a sentinel for a SPELLING rather than for the property — so it now names the property:
   * the wrapper tells the framework which directory to maintain, and it does not let a caller say
   * otherwise. The behavioural version of the same claim is in the framework's suite, which asserts the
   * `SourceDir` the fake framework actually received.
   */
  check(code.includes('$PSScriptRoot'), 'and points the framework at THIS package, by passing its own directory')
  check(!/^\s*\[string\]\$SourceDir\b/m.test(code), 'while refusing to let a caller name a different package from here')
  check(text.includes('exit 1'), 'and refuses loudly when the framework script cannot be found')
  check(!/\$Rest/.test(code), 'the wrapper forwards named parameters, not a positional remainder')
  check(/\[switch\]\$Snapshot/.test(code), 'and declares the framework’s switches itself, one for one')
}

process.stdout.write(failed === 0 ? `\n${passed} assertions, 0 failing\n` : `\n${passed} assertions, ${failed} failing\n`)
process.exitCode = failed === 0 ? 0 : 1
