# Corresponding source for the embedded TobiiFree WASM

Packaging/provenance note added by LINKa on 2026-11-03. Runtime SDK and binary
contents have not been changed by this recovery.

## Upstream and license

Source: [Aetherall/tobiifree at 713af3760650254947b5999785a1199d0dd38129](https://github.com/Aetherall/tobiifree/tree/713af3760650254947b5999785a1199d0dd38129),
commit `all-data`, 2026-04-07, authored by Elies Lou. The original upstream
README and full LICENSE are included here unchanged; upstream identifies
GPL-3.0. Existing authors retain their rights. This is not a new or broader
license grant by LINKa and does not cover proprietary Tobii DLLs.

The exact original `sdk/src/wasm-bundle.ts` Git blob is
`c6e95a781ea60718b2c1f6e4c5824473bda06b14`, equal to the complete local embedding
file, not merely a version label or API match. The embedded WASM is 644600 bytes,
SHA-256 `1e9984cea6b5a142b48a0d2b8867d7418903252b1d3c95201247af1503ffaaa0`.
It was present at the integration repository's initial import
`90fd210d63233ef981f8f59ab5bd0f5db9232024` on 2026-06-08 and has not changed since.

`PROVENANCE.json` records the upstream revision and verified Git blob/SHA-256
hashes for every recovered source file. The driver and build scripts are from
the same upstream revision as the exact embedding. This does not assert that
every local TypeScript wrapper is an unmodified upstream copy; the current
preferred TypeScript sources remain in the SDK's existing `src/` directory.

## Included source and build instructions

This directory accompanies the object code in the npm/release archive. It
contains the complete upstream `driver/` source tree, its `build.zig`, original
embedding script, upstream LICENSE/README, and original `justfile`, `flake.nix`
and `flake.lock` build/environment definitions. No external source download or
written source offer is required to obtain these included files.

To build the driver, from this directory, with Zig installed:

```sh
cd driver
zig build -Doptimize=ReleaseSmall
```

This is the command specified by the original upstream `justfile` and Nix
build. It produces `driver/zig-out/bin/tobiifree_core.wasm`. The distributed
binary contains a Zig 0.15.2 compiler-library path; the original pinned Nix
environment is included, but exact compiler/toolchain reproduction has not
been independently verified. No WASM rebuild was performed during recovery.

Optionally regenerate an embedding in this isolated source directory (not the
installed runtime SDK), after the driver build:

```sh
mkdir -p sdk/src
node scripts/bundle-wasm.mjs
```

The original script writes `sdk/src/wasm-bundle.ts` relative to this directory.
Do not replace the shipped binary based solely on these instructions: the
unchanged binary is covered by the package's hash regression test, and any
functional change requires separate review and hardware qualification.
