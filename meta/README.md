# @xjl-resources/dsh-plugin-skin

Aggregate package for dsh UI skins.

**It registers nothing.** Installing this package installs every skin
listed in `dependencies/` — nothing more. The skins register themselves
when dsh loads them.

## For users

**Prerequisites**: install the framework first. The meta package carries no code; it only lists skins as dependencies.

    dsh plugin add dsh-ui-projects
    dsh plugin add @xjl-resources/dsh-plugin-skin

Or in one step:

    dsh plugin add dsh-ui-projects @xjl-resources/dsh-plugin-skin

To install a single skin instead:

    dsh plugin add dsh-ui-projects @xjl-resources/dsh-plugin-liquid-glass

## For maintainers

Add a new skin:

1. Publish it as `@xjl-resources/dsh-plugin-<name>`.
2. Add one line to `dependencies/`:

       "@xjl-resources/dsh-plugin-<name>": "<version>"

That is the whole change — this package stays empty otherwise.