# Security Model

Install-by-URL for a WASM plugin still runs arbitrary code you didn't write - the same real-world
risk as running any downloaded `.exe`. Concourse doesn't pretend the WASM sandbox alone solves
that; this page is what it actually does about it, and what it doesn't.

## The wasmtime sandbox itself

Every WASM plugin runs inside a [wasmtime](https://wasmtime.dev/) Component Model instance with
no ambient access to anything - no filesystem, no network, no process spawning, nothing, unless
a specific `host` function grants it. This is the baseline: a plugin can only ever do what the
`host` interface exposes (see [WIT Interface](./wit-interface)), never anything beyond it, no
matter what the plugin's own code tries.

## Path scoping

`plugin-dir()` (`<app data>/wasm-plugins/<kind>/<plugin-id>/`) is always implicitly
readable/writable - every plugin gets a private sandbox directory for free. Anything beyond
that needs one of:

- **A declared static scope** - a fixed registry hive+key prefix or filesystem path prefix a
  plugin genuinely needs at a known location (e.g. a platform's fixed vendor registry keys, or a
  fixed manifests directory). Declared once, checked by the host on every file/registry call.
- **A runtime-requested scope** (`request-read-scope`) - for a directory only discoverable at
  runtime (wherever the user's Steam install actually put its library folders). The host only
  grants this if it recognizes the plugin id *and* the requested path passes a real structural
  check for that vendor (e.g. requiring a `steamapps` subdirectory) - an unrecognized plugin id
  is rejected outright, never silently trusted.

Either way, a plugin's manifest-declared (or install-confirmation-surfaced) scopes are shown to
the user before they install it, so "what can this actually touch on my disk" is visible
up front, not just enforced silently.

## Process spawning gate

`spawn-process`/`run-and-wait` are gated behind an explicit `"run-programs"` capability grant -
a plugin declaring this in its manifest's `capabilities` field triggers a real "this plugin runs
other programs on your system" prompt in the install-confirmation UI, which the user has to
affirmatively accept. The host enforces the gate regardless of what the manifest declares (a
plugin can't just omit the field to skip the prompt and still call the function) - the
`capabilities` field only controls whether the UI asks for the grant at all.

## Network scoping

`http-get`/`http-request`/`download-bytes` are allowlisted/rate-limited per plugin, not a blanket
"can reach the whole internet" grant.

## What this *doesn't* solve: trust, not just sandboxing

Path/process/network scoping limits *what* a plugin can reach, but says nothing about whether
the code itself does something malicious within that scope (a source plugin genuinely needs
`spawn-process` to launch games - that's not something a sandbox can distinguish from launching
something else). Two more layers address that:

### Code signing (advisory)

Published plugin releases can carry a [Sigstore](https://www.sigstore.dev/) attestation -
verifiable proof of which CI build produced a given `.wasm` binary and from which source
commit. This is **advisory, not a hard install-time gate** - Concourse doesn't refuse to install
an unsigned plugin, since that would just as easily block a plugin author who hasn't set up
signing yet. Advisory review shows up in the install-confirmation UI, and *is* enforced hard for
the curated registry below.

### Curated registry (hard-gated)

[`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry) is a
reviewed, hash-pinned list of plugins - each entry pins a plugin's manifest/WASM to an exact
commit SHA and content hash. Installing through the registry (rather than a freeform pasted URL)
**hard-rejects on hash mismatch** - if what's actually served no longer matches what was
reviewed, installation fails outright rather than warning and continuing. Pulling an entry from
the registry *is* the revocation mechanism (install-time only - it doesn't reach back into
already-installed copies).

**In short**: registry-installed plugins get real, enforced integrity guarantees. Freeform
URL-installed plugins get sandboxing and visible declared scopes, but the actual trust decision
is still yours - see [Publishing](./publishing) if you want your own plugin to reach the
stronger, reviewed tier.
