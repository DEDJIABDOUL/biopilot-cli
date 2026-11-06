# Use better-sqlite3 for the knowledge and user databases

BioPilot needs a local SQLite engine that installs with zero compilation on the user's machine and works inside Inshellisense's Node SEA standalone binary. `node:sqlite` was rejected: it is still Release Candidate stability (not Stable) even on Node 26, and its API changed as recently as 26.11. `sql.js` (WASM) was rejected: it has no durable on-disk file backing, so `user.db` (usage stats, learned tools) would need to be serialized and rewritten whole on every mutation, for a packaging-simplicity gain that doesn't offset the added ~1.5MB and the rearchitecting cost.

We chose `better-sqlite3`: since v13 it ships precompiled Node-API binaries for all six target platform/arch combinations (plus linux musl) bundled inside the npm package itself, so the npm install path needs no compilation. For the standalone SEA binary, its native addon must be extracted to disk and loaded at runtime rather than embedded in the SEA blob directly — but this is not new risk: Inshellisense's own `node-pty` dependency already requires and solves exactly this pattern (per-platform optional npm packages, extracted and `dlopen`'d at runtime), so BioPilot reuses that existing, proven mechanism instead of inventing a new one.

## Consequences

`better-sqlite3` 13 requires Node 22+ (v12 already required Node 20+; no version supports Node 18). This floor applies to development and to running from source, capped below 23 by the Inshellisense engine. Users are unaffected: the standalone binary embeds Node 22, and the npm package is only a launcher for that binary.

In the standalone binary, the addon is loaded from its extracted path through `better-sqlite3`'s `nativeBinding` option, so the bundle needs no loader patch.

## Correction (2026-11-06)

The first version of this ADR also rejected `node:sqlite` because it "requires Node 22+, conflicting with the Node 18+ floor promised for the npm variant". That argument was wrong: `better-sqlite3` has the same requirement. The decision stands on the remaining reasons (stability, API churn); the Node 18 floor was dropped instead (spec decision 19).
