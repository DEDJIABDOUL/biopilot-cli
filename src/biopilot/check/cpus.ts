// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// How many CPUs a command may really use here: a SLURM job's allocation, else the cgroup's CPU quota
// (containers, systemd slices), else the CPUs the process may run on. Never throws.

import fs from "node:fs";
import os from "node:os";

export type AvailableCpus = { count: number; source: "SLURM_CPUS_PER_TASK" | "cgroup" | "machine" };

const positive = (text: string | undefined): number | undefined => {
  const n = Number(text?.trim());
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

const read = (file: string): string | undefined => {
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    return undefined;
  }
};

/** cgroup v2 `cpu.max` ("200000 100000", or "max 100000"), else v1 `cfs_quota_us` / `cfs_period_us`. */
const cgroupCpus = (root: string): number | undefined => {
  const v2 = read(`${root}/cpu.max`)?.trim().split(/\s+/);
  if (v2 && v2.length === 2 && v2[0] !== "max") {
    const quota = positive(v2[0]);
    const period = positive(v2[1]);
    if (quota && period) return Math.max(1, Math.ceil(quota / period));
  }
  const quota = positive(read(`${root}/cpu/cpu.cfs_quota_us`));
  const period = positive(read(`${root}/cpu/cpu.cfs_period_us`));
  return quota && period ? Math.max(1, Math.ceil(quota / period)) : undefined;
};

export const availableCpus = (env: NodeJS.ProcessEnv, cgroupRoot = "/sys/fs/cgroup", machine = os.availableParallelism()): AvailableCpus => {
  const slurm = positive(env.SLURM_CPUS_PER_TASK);
  if (slurm) return { count: slurm, source: "SLURM_CPUS_PER_TASK" };
  const cgroup = cgroupCpus(cgroupRoot);
  if (cgroup && cgroup < machine) return { count: cgroup, source: "cgroup" };
  return { count: machine, source: "machine" };
};
