# Changelog — @xjl-resources/dsh-plugin-liquid-glass

A record of what changed, how it was verified, and what the outcome was. The rules are the framework's,
because this package was extracted from it: every entry states its verification, and negative results are
recorded too — a change that did not fix the problem is worth more than one that was never tried.

---

## 1.0.1 — this package is FROZEN, and the skin now also ships inside the framework (2026-10-06)

**Status: documentation only. No source, no build output and no `lib/` artefact changed in this entry, and
nothing was published. `node scripts/check.mjs` 26 / 0 and `node scripts/verify.mjs` 340 / 0, unchanged.**

`dsh-ui-projects` now carries a **built-in copy of this skin**, registered as the project `glass`, and long
term that framework package is the only one that ships updates. This package —
`@fn-x/dsh-plugin-liquid-glass` and its `@fn-x/dsh-plugin-skin` meta — stays published and installable, and
**no new version will be released from it.**

What that means, concretely:

- **The material has one owner again, and it is not here.** The built-in's `tokens.css`, `glass.css` and
  `boot.css` are byte-identical to this package's today, and `dsh-ui-projects`'s
  `scripts/check-builtin.test.mjs` compares them (raw for the two stylesheets, marker-normalized for the
  boot sheet and the overlay). **A change made here alone now reaches nobody**: the framework's copy is
  what a reader has.
- **Both can be installed at once, and that is why the ids differ.** The built-in is `glass` and this
  package is `liquid-glass`, so they never collide; the one-skin policy makes them mutually exclusive, so a
  reader sees two cards and picks one. A reader who had THIS package enabled keeps it — the id did not
  change — and the built-in arrives off beside it.
- **`peerDependencies: dsh-ui-projects` widened to `^0.1.0 || ^0.2.0`** in both manifests, for anyone
  installing from the repository rather than from npm. It changes nothing for an already-published version.

---

## 1.0.0 — the material round: the overlay, the tiered vocabulary, and the modes that ask for less (no version bump: this entry records the change, and the release that would carry it is a separate decision)

**Status: done. `node scripts/verify.mjs` 340 / 0, `node scripts/check.mjs` 26 / 0,
`node scripts/emitted-css.mjs` exits 0, `npm run build` green, and
`node scripts/derive-boot-css.mjs --package . --check` green at 13 blocks / 14092 bytes. All three
artefacts under `lib/`: `client.js` 115824, `boot-css.js` 13239, `index.js` 1999. The round was picked up
with the working tree at 258 assertions and 21 failing. No browser run: the three visual consequences
below were put to the reader, who accepted them as they stand, so none of them was changed to make a
screenshot agree. `install.ps1` was not executed and nothing was published.**

### The overlay, and why it is a second path to the same paint

- **`src/client/index.js` (+204 lines)**: a sheet inserted into `<head>` from `apply`, carrying dialogs,
  menus/listboxes/the add-source dropdown, the IDE dock, and the tool-call/diff grounds. It exists because
  the scoped path lost the specificity contest — the shell styles its own dialogs with a two-class
  selector, and a `:where()` rule is (0,1,1) after scoping, so the tuned declarations never reached the
  element. The file header already stated both reasons; this round is the code catching up with them.
- **`OVERLAY_MODES`, a fourth sheet, LAST in `OVERLAY_CSS`**: every blur in the overlay is `!important`,
  and an `!important` declaration beats a normal one whatever the specificity — so `glass.css`'s plain
  `backdrop-filter: none` could not reach it, and a reader who had asked their system for less
  transparency kept frosted dialogs, menus, the add-source dropdown and the dock panes. The modes sheet
  answers the three queries with the SAME selectors and the same `!important`, which leaves source order
  to decide. `@supports not (backdrop-filter: …)` is deliberately absent: a browser without the property
  already drops every blur in the file, which is that mode's outcome.

### The material became a vocabulary

- **Three per-surface pairs** — `--lg-glass-fill-*` (surfaces a reader works through),
  `--lg-glass-composer-*` (the thinnest fill, with its own halo), `--lg-glass-panel-*` — plus
  `--lg-glass-panel-inner*` for the fills the panel's own children paint with. Rules left `:where()` where
  they had been losing, which is why earlier rounds of tuning were invisible on screen.
- **The four no-transparency modes now cover every tier**, and that is now proved rather than asserted:
  the tiers are members of the suite's `SURFACES` list, so a tier the branches miss fails the suite.

### A defect found on the way, and the negative result worth keeping

- The panel-inner pair's dark half was `rgb(255 255 255 / 46%)` — a copy of the LIGHT half — so the
  panel's inner layers would have been white in a dark theme. It was never visible: the overlay declared
  the same four tokens as literals with higher specificity and won, which made the values here dead code.
  They now carry the overlay's own dark values (`rgb(30 33 42 / 50%)` and `rgb(30 33 42 / 54%)`), which is
  what those layers have always actually rendered — **no rendered value changed**, and the branches can
  reach them now.
- The same SHAPE of defect is **accepted as it stands** for the overlay's 14 remaining literal token values
  (module-platform 92%, the portal preview 72 / 76%, the column-hover 92%): they have no tier, and whether
  those surfaces should go opaque in the no-transparency modes is a design question rather than a bug.
  Recorded here so the next reader does not have to rediscover it as a defect.

### `scripts/verify.mjs`

- **The column-marker constraint was a proxy for its own name.** It required the substring `:has(`
  anywhere in the selector, which `body :is([data-ui-skin-column]):has(…)` satisfied while still making
  the column the subject of the rule — and it failed two rules whose whole declaration is a token rebind,
  which is neither selecting the frame nor laying anything out. It now separates FRAME (every occurrence
  of the marker inside a `:has(…)` argument) from COLUMN (the marker is the subject), and holds a column
  rule to: no layout property, no filter, and nothing but custom properties — except a paint that goes
  through a `--lg-glass-*` token, which is how the dock column already worked.
- That property list used to be checked against the SELECTOR text, where `isolation`, `z-index` and
  `contain:` cannot appear: 72 assertions that passed on every rule and proved nothing. They are checked
  against the DECLARATION now.
- **The overlay is read as well**, from its SOURCE (`src/client/index.js`) rather than from
  `__overlay.OVERLAY_CSS` — that export is a snapshot of a value the package only serves as a built
  bundle, so reading it here would make the suite lag the sources until someone rebuilt. 18 marker
  selectors are checked now (12 scoped + 6 overlay) instead of 12.
- **A new test holds the shape** that makes the modes sheet win (same selectors, `!important` on both
  sides, the block last), because no source-level check can see a cascade.
- `manifest.generated.js` regenerated: it declared 1.0.0 while `package.json` declared 1.0.1.

### Not done, on purpose

- No version bump and no publish.
- `index.broken.js.bak` — an untracked earlier iteration of the overlay — was removed rather than kept.

---

## 1.0.0 — Round 56h: the derivation tool moves into the package that owns the CSS (no version bump: no shipped declaration changed, and no file in `lib/` changed at all)

**Status: done. `node scripts/check.mjs` 26 / 0 (unchanged), `node scripts/verify.mjs` 237 / 0 (unchanged),
`npm run build` green twice in a row with byte-identical output, and `node scripts/derive-boot-css.mjs
--package . --check` reporting 13 blocks / 10517 bytes (was 10484). All three artefacts under `lib/` are
byte-identical to a `-Snapshot` of this package taken 32 hours earlier (`boot-css.js` `59fa596f9009`,
`client.js` `425444fe2bf2`, `index.js` `994a14ff6f16`), so the round changed no shipped statement. No browser
run: there was nothing new for a running instance to show. `install.ps1` was not executed.**

### What arrived, and the one semantic change

- **`scripts/derive-boot-css.mjs` (new here)**: the tool the workspace's `tools/` used to hold, with three
  changes. The scoper import becomes `../../dsh-ui-projects/src/client/scope-css.js` — the path this
  package's other scripts already use. The default package becomes THIS one, because `root` is now this
  package's root. And the command it prints when the sheet is stale is built with
  `relative(process.cwd(), toolPath)`, so it is right from whatever directory the reader is standing in.
- **The flag-less `--check` means something else now, on purpose.** It used to name the framework — which has
  no `scripts/boot-css-rules.mjs` and no CSS, so that default could only ever exit 1. It now derives the
  package the tool lives in. Pointed at the framework it still exits 1, and it says what it wanted:
  `cannot read the first-paint rules of …\dsh-ui-projects`, `expected …\scripts\boot-css-rules.mjs`. The
  change is stated in the tool's own header ("WHY IT LIVES HERE"), in this README, and in the framework's.
- **`scripts/build.mjs`**: `findDeriveTool()` lost its workspace fallback — it was a search with two places
  to look for a file that now exists in exactly one, so it became a lookup that names the missing path. The
  two messages that told a reader to run `node tools/…` now say
  `node scripts/derive-boot-css.mjs --package <dir>`, which is the form that works under `npm run build`
  (its cwd is this package's root).
- **`src/host/boot.css` regenerated**: 10484 → 10517 bytes, and **all 33 of them are inside the header
  comment**. `build.mjs` strips comments before generating `lib/boot-css.js`, so the module is unchanged
  (`59fa596f9009` before and after) and the 13 blocks are identical. The prediction that the module would
  change was wrong and is corrected here rather than in a private note: 10517 = 1644 bytes of comment +
  8873 bytes of payload, and the payload inside the generated module equals the payload derived from the
  sheet.

### The follow-up commit, and why it was needed

The first commit moved the tool, simplified the build and regenerated the sheet, but left five lines still
pointing at `tools/`: this README's two commands and the paragraph around them, and two comments
(`scripts/verify.mjs`, `scripts/emitted-css.mjs`). The README's were commands a reader would type and watch
fail. The follow-up rewrites the paths and deletes the paragraph that said folding the tool into a package
"is separate work: a tool that derives ANY package's sheet should not end up inside one of its callers by
accident" — this round is that work, and the sentence had become the opposite of the truth.

### Process deviations, disclosed

- **A hash check that printed nothing, twice.** The first attempt passed a script with embedded double
  quotes to `node -e` through PowerShell, which ate them (`createHash(sha256)`, `digest(hex)`); both runs
  failed and the "before" column was empty. The script went through stdin instead. The pre-change state was
  then recovered from the profile's own `-Snapshot` (`1.0.0-20260928T061642Z`) rather than from a
  measurement taken before the build — which is the stronger evidence anyway, and is what the Status block
  above cites.

## 1.0.0 — Step 8c: the framework ships no project (no version bump: no shipped declaration changed)

**Status: done, still not installed anywhere. `node scripts/check.mjs` 23 / 0 (unchanged),
`node scripts/verify.mjs` **237** / 0 (225 → 237, +12), `npm run build` green with `lib/client.js` at
`sha256:425444fe2bf2` — UNCHANGED, because this round edited no statement in the bundle's sources — and
`node tools/derive-boot-css.mjs --package . --check` reporting 13 blocks / 10484 bytes. The framework's
suites are green against this package (its `load-check.mjs` mounts this bundle: 85 / 0). No browser run:
this package is still not in a profile. `install.ps1` was not executed.**

The framework deleted its built-in copy in this round, so this package is now the only source of the
material — but nothing has been installed yet, which means **the workspace is in a state nobody should
run**: restart `dsh web` between 8c and 8d and the card and the material are both gone. The two rounds
must be adjacent.

### What arrived

- **The derivation predicate's own test, twelve assertions.** `classifyPrelude` decides which rules a first
  paint may carry, and `tools/derive-boot-css.mjs` runs it over THIS package's stylesheets — so a wrong
  answer here is a wrong first frame, and the framework, which now ships no CSS at all, cannot say anything
  about it. The cases are the shapes this material writes, plus the ones that already went wrong: the
  comma-separated `body, body[data-ds-dark-theme]` suppression (a `mixed` list that a predicate skipping on
  sight drops, and did), a compound versus a descendant, and an empty prelude.
- **`scripts/emitted-css.mjs`**, moved from the framework, and it stopped carrying copies of its own
  parameters on the way: the marker and the sheet list now come from `./boot-css-rules.mjs`, the same module
  the derivation tool reads. A tool that prints "the CSS the browser receives" should not be able to
  disagree with the sheet it is printing.
- **`scripts/capture-skin.mjs`**, moved byte-identically. It held no framework path — everything it asserts
  is about this material (`--dsw-specific-sidebar-fill`, the `[data-ui-skin-column]` markers, the
  `liquid-glass` id it writes into the enable record) — so the move changed no statement in it.
- **`scripts/boot-css-rules.mjs`** is byte-identical to the copy the framework used to hold, and it is now
  the only one. It moved rather than being copied in 8b; the framework's copy was deleted in 8c, which is
  why `derive-boot-css --check` run in the framework's directory now exits 1 instead of agreeing with this
  package by accident.

### What this package still does not do

Drive the framework's runtime. That boundary did not move: the framework's `verify.mjs` proves that a
registration applies, is owned by its package and is withdrawn, using its own fixture; this suite proves
the material and this package's own declarations.

---

## 1.0.0 — Step 8b: the skin becomes a package

**Status: done, not yet installed anywhere. `npm run build`, `npm run manifest`,
`node scripts/check.mjs` (23 assertions / 0 failing) and `node scripts/verify.mjs` (225 assertions / 0
failing) are green, and the framework's `load-check.mjs` mounts this package's REAL built bundle through
the real Cordis (85 assertions / 0 failing, five of them about this package). No browser run: this round
installs nothing, and the framework still ships its own copy of the material, so the running page is
unchanged.**

### What moved here

The material — `tokens.css`, `glass.css`, the definition — and thirteen tests that were always about the
material rather than about the framework: the palette's re-bindings, the frost's placement, the composer's
material, the dark-theme signal, the contrast and no-transparency branches, the component-flow rules, and
the first-paint sheet. They read the stylesheets through the framework's REAL scoper, so what they assert
is the CSS a browser receives rather than the CSS a person wrote.

The definition lost everything that is not behaviour. Identity, copy, tier, checklist and preview now come
from `package.json` → `dsh.uiProject`, generated into `manifest.generated.js`. There is no second copy of
any of it, so there is nothing to drift.

### One consequence a person will notice: the checklist reads `stale` once

The framework registers a project's version as the PACKAGE's version — a stamp that could disagree with the
installed package would make a stale checklist unreadable — so the first release under this name stamps a
new number where the framework-era skin stamped `3.0.0`. Anyone who had confirmed the three-item checklist
will find the card saying `stale` once, and re-confirming it takes three clicks.

The alternative — publishing this package as version `3.0.0` to keep the stamp stable — was rejected:
a package version that exists to make a stamp match is a version that lies about what changed.

### What this package checks about itself

`scripts/check.mjs` asserts the declarations (both halves built, the host half announcing the declared
project, the patch row, the peer). `scripts/verify.mjs` asserts the material and the registration contract
of this package's own client half, which it loads out of `lib/client.js` in a sandbox with a fake
`uiProjects` service — so the definition's shape (`apply` and `cleanup`, and nothing else) is pinned where
it is written.

**What it deliberately does not do: drive the framework's runtime.** That is the framework's contract, and
it is tested there — with the framework's own fixture, and with this package's real bundle by
`dsh-ui-projects/scripts/load-check.mjs`, which mounts it through the real Cordis and asserts that
unloading it withdraws the project.

### The first paint

`src/host/boot.css` is derived from this package's stylesheets by
`tools/derive-boot-css.mjs --package .`, and `npm run build` runs that tool in check mode before writing
`lib/boot-css.js` — so a sheet that no longer matches the CSS fails the build. The derivation predicate is
NOT re-implemented here: the first attempt at that split top-level CSS segments and could not see a
body-level rule inside `@supports`, so it reported eight correctly-derived rules as undeclared. One
implementation, invoked.

### A guard that failed on its own documentation

`scripts/verify.mjs` asserts that `skin.js` reaches for no DOM API — no `document`, no
`MutationObserver`, no timer — because this skin mounts nothing and that is a property worth keeping. Its
first run FAILED: the needles appear in `skin.js`'s own header, which explains the ambient-gradient layer
an earlier version grew and removed. The comment is stripped before scanning now. The rule is written down
in the framework's `CONTRIBUTING.md` ("a guard reads CODE, not the prose around it"), and this was its
second incident — the first happened to the same kind of guard one round earlier.
