// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The Catalog as the engine side of BioPilot sees it: opened once per session, `null` when unavailable
// (the engine then falls back to Fig), and the project around a folder, read through it.

import { openCatalog, type Catalog } from "../knowledge/catalog.js";
import { detectProject, type Project } from "../project/detect.js";

let catalog: Catalog | null | undefined;

export const getCatalog = (): Catalog | null => {
  if (catalog === undefined) {
    const opened = openCatalog();
    catalog = opened.available ? opened.catalog : null;
  }
  return catalog;
};

/** The project around `cwd`, or nothing without a Catalog (formats are read through it). Never throws. */
export const projectAt = (cwd: string | undefined): Project | undefined => {
  const current = cwd ? getCatalog() : null;
  if (!current || !cwd) return;
  try {
    return detectProject(cwd, current);
  } catch {
    return;
  }
};
