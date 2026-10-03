# @fn-x/dsh-plugin-skin

Aggregate package for dsh UI skins.

**It registers nothing.** Installing this package installs every skin
listed in `dependencies` — nothing more. The skins register themselves
when dsh loads them.

This package is the monorepo's aggregate exit: the skins themselves live in
`packages/<name>/`, and the root README's Layout section describes the two
workspaces. This package does exactly one thing — it brings the skins along
through `dependencies`.

## For users

**Prerequisites**: install the framework first. The meta package carries no
code; it only lists skins as dependencies.

    dsh plugin add dsh-ui-projects
    dsh plugin add @fn-x/dsh-plugin-skin

Or in one step:

    dsh plugin add dsh-ui-projects @fn-x/dsh-plugin-skin

To install a single skin instead:

    dsh plugin add dsh-ui-projects @fn-x/dsh-plugin-liquid-glass

**How the dependency resolves.** A published skin is named in `dependencies`
with a caret range such as `^1.0.0`, and it is fetched from the npm registry.
At development time the framework package is reached through the
`.dev/dsh-ui-projects` junction, which is ignored by git and never published.
While a skin is being developed, this package can point at a local checkout
with a `link:` specifier instead of a version range.

## For maintainers

Add a new skin:

1. Publish it as `@fn-x/dsh-plugin-<name>`.
2. Add one line to `dependencies`:

       "@fn-x/dsh-plugin-<name>": "<version>"

That is the whole change — this package stays empty otherwise.

## Compatibility

    dsh    >= 0.1.5-rc.1
    Node   >= 20

The dsh requirement is the one this package declares as
`dsh.compatibility.dsh`; the Node requirement is the version the tooling is
developed and tested against.

## License

MIT. See `LICENSE` in this repository.
