# @fn-x/dsh-plugin-liquid-glass

Liquid Glass as a **UI project package** for `dsh-ui-projects`: an iOS-style translucent material —
frosted layers, hairline highlights, large radii, depth built from real translucency — declared through
`dsh.uiProject` and run by the framework.

It exists because a skin does not belong inside the framework that runs it. Until step 8 this material was
compiled into `dsh-ui-projects`; the framework now ships no project at all, and this package is what a
person installs to get the look.

## What a UI project package must declare

| In `package.json` | Why |
| --- | --- |
| `dsh.bundle.patch: ./cordis.patch.yml` | Without it the loader never admits the package: it reconciles `dsh.profile.bundles` against installed packages, and only a package declaring `dsh.bundle` joins the layer stack. |
| `dsh.client.platform: web` | This is what makes the client-modules node half serve the browser bundle. |
| `dsh.compatibility.dsh` | The dsh version the package was written against. |
| `dsh.uiProject` | The manifest: identity, copy, the tier, the checklist, the preview. It is also what makes the package a *UI project* package rather than an ordinary plugin. |
| `peerDependencies: { "dsh-ui-projects": "^0.1.0" }` | The framework this package registers through. It is a peer rather than a dependency because the coupling is a Cordis SERVICE (`uiProjects` on the client, `uiProjectsHost` on the host) — nothing imports the framework's code — and because the installer can then verify it is there. |
| `cordis.patch.yml` | One host row, whose `name` is the scoped package name. |

## The two halves

`src/host/index.js` — the whole host-side contract, three statements long: inject `uiProjectsHost`, listen
for `webserver/index-inject`, push the rows the service builds — `bootRows(PROJECT_ID, BOOT_CSS)`. It runs
in Node, before any browser code, which is why the first frame can already be glass.

`src/client/index.js` — an ordinary Cordis client plugin that injects `uiProjects` and calls
`register(manifest, definition)`. The **manifest** is generated from `package.json`
(`scripts/derive-manifest.mjs`); the **definition** is behaviour only (`apply`, `cleanup`). Nothing is
written twice, so nothing can drift, and the calling plugin's own context is what the registration's
lifetime is bound to: unload the package and its project is withdrawn.

## The first paint has its own source

`src/host/boot.css` is a DERIVED subset of this package's own `tokens.css` and `glass.css` — the
body-level rules that decide the colours and the background of the very first frame, before any client
bundle has been fetched. It is authored already-scoped
(`body[data-ui-project-liquid-glass="on"]…`) because the host half inlines it verbatim and has no scoper to
run.

It is produced, never hand-edited:

```sh
node scripts/derive-boot-css.mjs --package .        # rewrite src/host/boot.css
node scripts/derive-boot-css.mjs --package . --check
```

and `npm run build` **runs that check** before it writes `lib/boot-css.js`: a stale sheet fails the build
instead of shipping. The tool lives in this package's `scripts/` (step 56h-5, when it left the workspace's
`tools/`): `--package <dir>` points it at another package that has CSS, and with no flag at all it derives
this one. Step 8c had already deleted the framework's copy of `scripts/boot-css-rules.mjs`, so this
package's copy is the only one and `--check` run against the framework exits 1 instead of agreeing with a
file that describes nothing.

## Working on it

```sh
node scripts/build.mjs                                     # src/** → lib/**
node ../dsh-ui-projects/scripts/derive-manifest.mjs --package . --check   # package.json → manifest.generated.js
node scripts/check.mjs                                     # this package against its own declarations
node scripts/verify.mjs                                    # the material
node scripts/emitted-css.mjs                               # what the browser receives, as text
node ../dsh-ui-projects/scripts/load-check.mjs             # this package mounted by the real framework
```

`npm run build && npm run manifest && npm run check && npm test` is the same sequence.

### What each check is for, and what it is not

- **`scripts/check.mjs`** — the package's own declarations: the two halves exist and were built, the host
  half announces the declared project, the patch file is shaped right, the peer is declared.
- **`scripts/verify.mjs`** — the MATERIAL: the palette, the frost, the dark half, the contrast and
  no-transparency branches, the composer, the first-paint sheet — and, since step 8c, the derivation
  PREDICATE, whose twelve cases moved here from the framework along with the file it tests. It reads
  `tokens.css` and `glass.css` through the framework's real scoper, so what is asserted is the CSS a
  browser receives.
  **It does not drive the framework's runtime** — that is the framework's contract, tested there with the
  framework's own fixture and, in `load-check.mjs`, with this package's real bundle. This suite proves the
  material and the declarations; the framework's suites prove that the framework runs them.
- **`npm run build`** — refuses a `boot.css` that is not exactly what the two stylesheets imply, in both
  directions.
- **`scripts/emitted-css.mjs`** and **`scripts/capture-skin.mjs`** — instruments, not checks: the first
  prints the scoped rules as text (every silent failure in this material was a rule that looked right in
  the source), the second drives a real Chrome over CDP against a running instance and reports measured
  facts plus screenshots. Both moved here from the framework in step 8c, because everything they describe
  is this package's.

## Installing it

Not by hand. A package reaches a profile through the loader (`dsh plugin --profile <profile> add <path>`),
which writes `$DSH_HOME`; the framework's `install.ps1` is the only thing in this project that does that,
and it is meant to be run by a person. This package ships a thin `install.ps1` of its own that finds that
script and points it here — so the maintenance commands printed on the card (`install.ps1 -Snapshot`,
`-Update`, `-Rollback -To <name>`) work when run in this directory.

## The material, in one paragraph

The palette re-binds the shipped design-system tokens to translucent fills rather than restyling
components, so every surface that already consumes them becomes glass without naming a single component.
`glass.css` adds what a token cannot express: the frost, which needs a selector, plus the `--lg-*`
vocabulary and the system background. The frost sits on `::before` layers and on the columns, never on a
container of surfaces — a blur on a container softens everything inside it at once, which is how an earlier
version made the conversation unreadable. `--lg-glass-bg` is the one fill a person sees through, and every
mode that removes translucency (no `backdrop-filter`, `prefers-reduced-transparency`,
`prefers-contrast: more`, `forced-colors`) takes it opaque.

## Why transparency is not adjustable

There used to be an opacity slider. It was removed deliberately, and the reason is worth keeping
next to the design:

The slider mapped 0–100 onto a multiplier with a floor, so that the bottom of the scale meant
"very translucent" rather than "invisible". The floor was set to `0.45` of the nominal fill — which
put a surface at roughly **15% alpha**: technically present, invisible in practice. A user found the
bottom of the slider and reasonably concluded the skin had stopped working. That single number
caused a whole round of misdiagnosis.

Two lessons, both now enforced by tests:

1. **A control that can express a value the design was never tuned for will eventually be used to
   express it.** The material has one look; there is no dial to break it.
2. **"Subtle" and "absent" are hard to tell apart on a white page.** Transparency values are
   asserted against rendered contrast, not chosen by eye.

## How Liquid Glass is built

The skin deliberately does **not** style components one by one. The shipped client paints
almost everything from its own alias tokens, so the skin re-binds those tokens
(`tokens.css`) and every component that already reads them — sidebar, cards, menus,
dialogs, inputs, buttons — becomes glass, without the skin knowing a single class name.
That is also what makes it robust: a component whose markup changes still reads the token.

A token cannot express refraction, because `backdrop-filter` needs a selector rather than a value —
and the selector is the hard part. So the skin's entire material is **one frost layer on the
application frame**:

```css
:where(:has(> [data-ui-skin-column])) { isolation: isolate }

:where(:has(> [data-ui-skin-column]))::before {
  content: ''; position: absolute; inset: 0; z-index: -1;
  backdrop-filter: blur(var(--lg-glass-blur)) saturate(var(--lg-glass-saturate));
}
```

`:has(> [data-ui-skin-column])` finds the frame because the runtime marks its columns, and the frame
is the only element whose *direct children* carry that marker — no build-hashed class named, and no
new marker invented for the purpose. Floating surfaces are reached by ARIA role instead,
`:where([role='dialog'], [role='menu'], [role='listbox'], [role='tooltip'])`, because a WAI-ARIA role
is a published interface rather than somebody's markup. Every selector sits in `:where()` at zero
specificity, so a component that wants its own material still wins.

Three constraints decide that shape, and each was measured rather than reasoned about — the probe
cases are named in `glass.css`:

- **Never on a column**, for two independent reasons. `backdrop-filter` creates a containing block
  for `position: fixed` descendants, and dsh renders its settings dialog — `position: fixed;
  inset: 0` — *inside a layout column*: frosting a column captures that dialog and confines it to
  the column, and the reported symptom was the settings panel collapsing into a narrow strip on the
  left. The dialog was never the cause, and the skin cannot repair it from the outside. Separately,
  the shipped columns are `position: static` while the frame is `position: relative`, so an
  absolutely positioned child written inside a column resolves against the frame anyway — probe
  case 7 measured a frost on a static 169px column as a **351px** box, the frame's width. On the
  columns it would have been one frame-sized layer *per column*, stacked over the same area.
- **The stacking context comes from `isolation`, not from the blur.** `z-index: -1` needs a
  stacking context to land in, or the layer escapes to an outer one and can end up behind the page
  background. `isolation: isolate` supplies it — and, unlike `backdrop-filter`, `transform`,
  `filter`, `perspective` or `contain`, it does **not** create a containing block for
  `position: fixed` descendants. That is precisely what keeps the settings dialog attached to the
  viewport while the frame is frosted.
- **The layer paints between the frame's fill and the columns.** That is what a transparent
  `--dsw-alias-bg-base` is for, and it is why the text survives: `backdrop-filter` blurs what is
  behind a surface, never what is painted on it, so a see-through column keeps crisp type while the
  ambient gradient behind the frame is refracted.

If a browser lacks `:has()`, none of the above matches and the skin degrades to translucent fills
alone — nothing captured, nothing leaked.

**The composer is the one surface reached by a `data-` hook of its own.** It is not a floating surface
by role and it is not the frame, and it paints an opaque fill of its own
(`--dsw-specific-input-major` → `#fff` / `#2c2c2e`), so the frame's frost stopped at its edge. It gets
the material through `[data-composer-card]` — a hand-written attribute in `ui-conversation`, which the
shell's own layout code queries too — and its frost sits on `[data-composer-card]::before` with the
card carrying `isolation: isolate`. The blur is deliberately **not** on the card itself: the card is
already `position: relative` and has no `fixed` descendant today, so putting it there would work and
would also make the card a containing block for anything a future client renders inside it — the
failure this project has already paid for twice. The shared fill token is not rebound, because five
other surfaces paint with it.

The composer's frost is in **every** degradation list — both tiers, the mobile query, and all four
suppression branches — and under those four branches its fill goes opaque with every other one. That
completeness is the part that is easy to miss and impossible to see: a block that forgets the composer
leaves the one large card at full blur on the device or in the mode that asked for less.

**The seat around it is deliberately untouched.** The shipped rule on the seat ramps to
`var(--dsw-alias-bg-base)` over 36px and then holds that colour for the rest of the seat — invisible
only while the token matches the page around it, which is exactly what a translucent skin stops being
true. Restating it in glass terms was tried and seen in a screenshot of the running application: a
glass-tinted rectangle spanning the column below the card, with a hard edge where the seat ends. The
suite now asserts that the skin says nothing about the seat at all. A fade that dissolves content
instead of painting a fill is a `mask-image` on the scroller, which is a different change.

Two rules keep the result readable, and both are asserted by the suite:

- **Label tokens are never redefined.** Text keeps its shipped colour, so every
  foreground/background pair the design system validated still holds; only fills become
  translucent, and layer 3 / the overlay token stay essentially opaque for menus and
  dialogs, where dense text sits over arbitrary content.
- **Degradation is honest.** Without `backdrop-filter`, and under
  `prefers-reduced-transparency`, every fill returns to opaque and the blur is dropped:
  the layout, hierarchy and edges survive, the transparency does not.
- **A contrast request is answered, not resisted.** Under `prefers-contrast: more` the fills go
  opaque, the hairlines get real weight, and the decorative gradient and the now-redundant blur go
  with them. That is a different request from `forced-colors`, which hands the palette to the
  platform, and from `prefers-reduced-transparency`, which is about seeing through things. The text
  colours are never redefined in any of the three: the design system validated every pair it ships,
  so the background is the only lever that can raise the ratio without inventing a relationship.
