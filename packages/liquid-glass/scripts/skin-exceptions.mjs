/*
 * What this skin SUPPRESSES in the shell's own interface, in one place.
 *
 * ## Why a list exists at all
 *
 * `glass.css` states its own contract at the top of the file: appearance only, no `display`, and no
 * geometry on any element this plugin did not create. That contract was written after paying for it —
 * an earlier version forced the settings dialog's geometry from outside through dsh's build-hashed
 * CSS-module classes and 39 `!important` declarations, and broke on every frontend rebuild.
 *
 * A skin that hides something the shell drew is therefore an EXCEPTION, and an exception nobody can
 * count is how a material turns back into a patch: one suppression is a decision, six are a fork. So
 * each one is named here, with the selector it is written as and the declaration it makes, and
 * `scripts/verify.mjs` holds the two in step — the CSS may hide exactly what this list names, and
 * nothing else.
 *
 * ## What belongs here
 *
 * Only rules that REMOVE or OBSCURE shell UI (`display: none`, `visibility: hidden`). A colour, a
 * radius or a blur is material, which is what the skin is for. A rule that makes something disappear
 * is a decision about the shell's interface, and that is what this list is for.
 *
 * The selector is recorded in the PLAIN form the stylesheet is authored in. The runtime scoper adds
 * the project marker (`body[data-ui-project-liquid-glass="on"]`) at load, so every entry here is inert
 * with the skin off — which is also why none of them needs a theme branch.
 */

/**
 * @typedef {object} SkinSuppression
 * @property {string} id A stable name, so a report and a review can refer to one entry.
 * @property {string} selector The plain selector exactly as `glass.css` writes it.
 * @property {string} declaration The declarations that do the hiding, whitespace-collapsed.
 * @property {string} why Why the shell's own interface is being changed from inside a skin.
 */

/** @type {SkinSuppression[]} */
export const SKIN_SUPPRESSIONS = [
  {
    id: 'composer-stats',
    selector: 'body [data-composer-stats], body .cm-root',
    declaration: 'visibility: hidden;',
    why:
      'dsh\'s own composer statistics row, and dsh-cost-meter\'s session cost line beside it. The rule was ' +
      'written before this list existed; it is REGISTERED here rather than removed, because it is live ' +
      'behaviour a reader would otherwise have to find by reading the stylesheet — and the suite did find ' +
      'it exactly that way, when the pairing assertion went red on an unlisted hiding rule. Written with ' +
      '`visibility` on purpose: `display: none` was measured to move the composer (see the note above the ' +
      'rule in glass.css).',
  },
  {
    id: 'composer-dock',
    selector: "body [data-slot='conversation.composer.bar'] div:has(> [data-slot='conversation.composer.dock'])",
    declaration: 'visibility: hidden;',
    why:
      'The composer\'s stats dock — the token counts and the context ring under the input. The dock itself ' +
      'carries only a build-hashed class, and a hash stops matching on the next frontend rebuild without ' +
      'reporting anything, so the rule is anchored on the two slots the shell itself publishes: the bar, ' +
      'and the empty dock slot that is a CHILD of the row being hidden. Verified on the desktop: the ' +
      'selector matches exactly ONE element, div.RlGAzG_dock, and never the composer card beside it. ' +
      '`visibility`, not `display`, for the same measured reason as the entry above — the dock is the last ' +
      'row of the bottom-anchored composer band, and removing it from the box tree moves the input box. ' +
      'It REPLACES an earlier entry aimed at `div.contextCandidates`, a container that does not exist in ' +
      'the shipped frontend at all: a dead selector, which no source-level guard in this repository can ' +
      'see.',
  },
]
