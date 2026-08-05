# Publishing

## Freeform install-by-URL (always available)

Anyone can install your plugin today without being listed anywhere - Concourse's "Add Plugin"
dialog accepts a direct URL to a `plugin.json` manifest. Publish a GitHub release with your
compiled `.wasm` and manifest as release assets, share the manifest's release-asset URL, done.
This is a real, first-class install path, not a fallback - a plugin author doesn't need to be
in any registry to be installable.

For update-checking to work well against a freeform URL, publish releases the normal way
(tagged versions, e.g. `v0.2.0`) and point people at that tag's own asset URL rather than a
`.../releases/latest/...` link, so a specific install stays pinned to what it was actually
installed from.

### Code signing (recommended)

If your plugin repo's CI attests build provenance for its release artifacts (e.g.
[`actions/attest-build-provenance`](https://github.com/actions/attest-build-provenance)),
Concourse surfaces that as advisory verification in the install-confirmation UI - proof the
`.wasm` a user is about to install really came from your repo's own CI, not a tampered copy.
This isn't required, but it's the one thing a freeform URL install can't otherwise get that a
registry entry can (see [Security Model](./security-model)).

## The curated registry

[`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry) is a
hand-curated, hash-pinned list that gets hard content verification at install time (a mismatch
is rejected outright, not just flagged) - a meaningfully stronger guarantee than a freeform URL
install. Honestly, as of this writing it documents itself as reviewed-by-one-person
(`smh0505`, the same maintainer as Concourse itself) rather than an open community submission
process - "reviewed" means someone actually read that specific pinned version's source, which
doesn't scale to accepting arbitrary third-party pull requests without changing that policy
first. If you want your plugin considered for inclusion, open an issue on that repo rather than
assuming a PR adding your own entry will be accepted as-is.

### What a listing actually pins

```json
{
  "id": "your-plugin-id",
  "name": "Your Plugin",
  "kind": "source",
  "repo": "you/your-plugin-repo",
  "manifestUrl": "https://github.com/you/your-plugin-repo/releases/download/v0.2.0/plugin.json",
  "wasmSha256": "<sha256 of the pinned .wasm, computed by the reviewer>"
}
```

`manifestUrl` always points at one specific, immutable release asset - never `.../latest/...` -
since the whole point of a curated entry is that what gets installed today is exactly what was
reviewed, not whatever you publish next. `wasmSha256` is computed from your actual release
artifact by whoever reviews it, then checked against the real downloaded bytes on every install
through this registry.

### Keeping a listing current

If your plugin does get listed, the registry's own CI can auto-detect your new releases (via a
`repository_dispatch` your release workflow sends) and open a version-bump PR against the
registry automatically - re-fetching, re-hashing, and re-pinning your new release's asset for
review, rather than someone needing to notice you shipped an update. That PR still needs a human
merge, same review bar as an initial listing.
