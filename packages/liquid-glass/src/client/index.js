/**
 * @xjl-resources/dsh-plugin-liquid-glass — browser half.
 *
 * A UI project package's client entry is an ordinary Cordis client plugin, and this one is deliberately
 * as thin as the contract allows:
 *
 *   - `inject: ['uiProjects']` is a HARD dependency. The service is provided by `dsh-ui-projects`'s
 *     client half; declaring it parks this plugin until that service exists, which is what makes
 *     "register during `apply`" safe regardless of composition order — the framework may load before or
 *     after this package, and neither order needs a retry.
 *   - `register(manifest, definition)` passes the manifest EXPLICITLY. Caller identity in Cordis stops at
 *     the fiber — `Fiber.name` is a display name and carries no package identity or version — so this
 *     package's own manifest is the authority for what the project is and who owns it. The manifest is
 *     generated from `package.json` (`scripts/derive-manifest.mjs`), never hand-written.
 *   - `definition` carries behaviour and nothing else: `apply` and `cleanup` from
 *     `./projects/liquid-glass/skin.js`. Every other field — id, name, description, version, tier,
 *     checklist, preview — comes from the manifest, so there is no second copy of anything that could
 *     drift from the installed package.
 *
 * Nothing here may `require` React or another plugin at module scope: that is the load-time contract
 * every client half in this system keeps, and the framework's suite asserts it for the framework's own
 * entry.
 */
const { createLiquidGlass } = require('./projects/liquid-glass/skin.js')
const manifest = require('./manifest.generated.js')

module.exports = {
  name: `ui-project-${manifest.id}`,
  inject: ['uiProjects'],
  apply(ctx) {
    ctx.uiProjects.register(manifest, createLiquidGlass())
  },
}
