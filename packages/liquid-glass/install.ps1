<#
.SYNOPSIS
    Maintain @fn-x/dsh-plugin-liquid-glass through the framework's install.ps1.

.DESCRIPTION
    The card's maintenance commands are printed as `install.ps1 -Snapshot`, `-Update`,
    `-Rollback -To <name>` and meant to be run IN THIS DIRECTORY. This wrapper is what makes that
    sentence true: it finds `dsh-ui-projects`'s install.ps1 -- which owns every rule, every refusal and
    every verification -- and calls it with `-SourceDir` pointed at this package.

    WHY A WRAPPER AND NOT A SECOND COPY. The script is 2000 lines of checks whose whole value is that
    there is exactly one of each: two copies would drift, and the drift would be in the refusal rules
    nobody exercises until the day they matter. The framework's script takes `-Package`, so it can
    maintain any UI project package; this file says WHICH one and WHERE it is, and nothing else.

    EVERY PARAMETER THE FRAMEWORK ACCEPTS IS DECLARED HERE TOO, and that is not decoration. This file
    used to forward a positional remainder (`$Rest`) instead, and that shape does not fail loudly:
    PowerShell hands a switch over as the STRING '-Snapshot', splatting the array lands that string on
    the first positional parameter, and the framework script -- which selects its mode with
    `if ($Uninstall) ... elseif ($Update) ... else { 'INSTALL' }` -- finds no verb at all and runs an
    INSTALL. So `install.ps1 -Snapshot` in this directory installed instead of snapshotting, silently.
    The surface is therefore declared one for one, forwarded one by one, and
    `dsh-ui-projects/scripts/verify.mjs` asserts that the two surfaces are the same set of names with
    the same TYPES (a `[switch]` that became a `[string]` would accept `-Snapshot $false` and pass it on).

    THE DEFAULTS ARE DELIBERATELY ABSENT. `$PSBoundParameters` holds only what the caller actually
    passed, so declaring `[string]$Profile` rather than `[string]$Profile = 'web'` keeps the framework's
    own defaults as the single source. A copy of them here would be a second source, which is the whole
    family of bug this file just left.

    Resolution order, because the two packages can sit in three different places:
      1. `-FrameworkDir <path>`, when a caller knows better than this script does
      2. a sibling checkout (this repository's layout)
      3. the profile's node_modules, where a published install puts both packages

.PARAMETER FrameworkDir
    Directory holding `dsh-ui-projects`'s install.ps1. Skips the search below. This is the ONLY
    parameter this file adds; it is also the one parameter the framework has never heard of, so it is
    excluded from what gets forwarded.

.EXAMPLE
    powershell -File install.ps1 -Snapshot
    Record a restorable version of THIS package.

.EXAMPLE
    powershell -File install.ps1 -DryRun
    Show what the framework script would do, and change nothing.

.EXAMPLE
    powershell -File install.ps1 -Rollback -To 03-v1.0.0
    Roll this package back to a named snapshot.
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$Uninstall,
    [switch]$Update,
    [switch]$Snapshot,
    [switch]$ListVersions,
    [switch]$Rollback,
    [string]$To,
    [switch]$List,
    [switch]$Force,
    [string]$Name,
    [string]$Revision,
    [int]$Keep,
    [int]$Changes,
    [switch]$SkipLinkProbe,
    [string]$Profile,
    [string]$ProfileDir,
    [string]$Package,
    [string]$DshCommand,
    [string]$FrameworkDir = ''
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$dshHome = $env:DSH_HOME
if ([string]::IsNullOrWhiteSpace($dshHome)) { $dshHome = Join-Path $HOME '.dsh' }

$candidates = @(
    $FrameworkDir,
    (Join-Path $PSScriptRoot 'node_modules\dsh-ui-projects'),
    (Join-Path (Split-Path -Parent $PSScriptRoot) 'dsh-ui-projects'),
    (Join-Path $dshHome 'profiles\web\node_modules\dsh-ui-projects')
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

$framework = $null
foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $candidate 'install.ps1') -PathType Leaf) { $framework = $candidate; break }
}

if ($framework -eq $null) {
    Write-Host ''
    Write-Host '   ABORT  cannot find dsh-ui-projects''s install.ps1.'
    Write-Host '          It owns every check this wrapper would otherwise have to duplicate.'
    Write-Host '          Tried, in order:'
    foreach ($candidate in $candidates) { Write-Host "            $candidate" }
    Write-Host '          Pass -FrameworkDir <path> to say where it is.'
    Write-Host ''
    exit 1
}

<#
    Forward what was BOUND, by name. Wholesale `$PSBoundParameters` would include -FrameworkDir, which
    the framework script does not declare -- and an undeclared parameter is a refusal, not a no-op, so
    the exclusion is load-bearing rather than tidy.

    Passing the hashtable rather than the values keeps the framework's own defaults authoritative: a
    parameter this file never received is simply absent, and the framework resolves it as it always has.
#>
$forward = @{}
foreach ($key in $PSBoundParameters.Keys) {
    if ($key -eq 'FrameworkDir') { continue }
    $forward[$key] = $PSBoundParameters[$key]
}

# Set HERE rather than accepted: saying which package this is, is this file's whole job, and a
# caller-supplied -SourceDir could only point the framework at a different one. Passing it is refused
# as an unknown parameter, which is the honest answer to "maintain something else from here".
$forward['SourceDir'] = $PSScriptRoot

Write-Host "   using $framework\install.ps1"
& (Join-Path $framework 'install.ps1') @forward
exit $LASTEXITCODE
