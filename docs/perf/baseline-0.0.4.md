# Performance baseline: the unmodified original engine, 0.0.4

Reference point for the performance targets in section 11 of the spec (notably "installed binary no more than 10% larger than the original"). Measured on the upstream tag `0.0.4`, before any BioPilot change.

- **Date:** 2026-11-06
- **Machine:** AMD Ryzen 7 5700U (16 threads), 14 GB RAM, Linux x64
- **Node:** 22.23.4 (conda-forge, env `biopilot-dev`); packaged binary embeds Node 22.21.1
- **Shell for session benchmark:** bash

## `npm run perf` (20 iterations, milliseconds)

| Benchmark | First | Median | p95 |
|---|---|---|---|
| startup.version | 328.2 | 243.1 | 322.5 |
| startup.check | 168.2 | 172.6 | 177.3 |
| suggestions.static | 25.5 | 0.053 | 6.0 |
| suggestions.filesystem | 3.4 | 0.124 | 0.227 |
| suggestions.root-prefix | 0.22 | 0.009 | 0.035 |

Process: CPU user 136.6 ms, system 117.6 ms; heap used 11.2 MB; RSS 97.2 MB.

## `npm run perf:session` (one real bash session in a pty)

| Measure | Value |
|---|---|
| Session startup | 818 ms |
| First suggestion | 28.5 ms |
| Input echo | 12.9 ms |
| Peak heap used | 14.9 MB |
| Peak RSS | 86.2 MB |

## `npm run package` (standalone SEA binary, linux-x64)

| Artifact | Size |
|---|---|
| Binary (linux-x64) | 137,956,544 bytes (131.6 MiB) |
| Release tarball `.tgz` | 43,994,166 bytes (42.0 MiB) |
| JS bundle `index.cjs` | 1,221,616 bytes |

**10% ceiling for BioPilot (section 11):** binary ≤ 151,752,198 bytes; tarball ≤ 48,393,583 bytes.

## How to reproduce

```shell
conda activate biopilot-dev
git checkout 0.0.4 && npm ci
ISTERM_PERF_ITERATIONS=20 npm run perf   # BIOPILOT_PERF_ITERATIONS after M1
npm run perf:session
npm run package
```

Single run on a laptop: treat differences under ~15% in timing figures as noise. Sizes are deterministic.

## After M1 (rename), same machine and method

| Measure | 0.0.4 | After M1 | Change |
|---|---|---|---|
| startup.version (median) | 243.1 ms | 166.3 ms | noise |
| startup.check (median) | 172.6 ms | 168.5 ms | −2% |
| suggestions.static (median) | 0.053 ms | 0.048 ms | noise |
| Session startup | 818 ms | 754 ms | −8% |
| First suggestion | 28.5 ms | 27.8 ms | −2% |
| Peak RSS (session) | 86.2 MB | 87.7 MB | +2% |
| Binary `biopilot-linux-x64` | 137,956,544 B | 137,956,544 B | 0% |
| Release tarball | 43,994,166 B | 43,994,247 B | +0.0002% |

The rename costs nothing measurable. Perf env variables are now `BIOPILOT_PERF*` (ex-`ISTERM_PERF*`).
