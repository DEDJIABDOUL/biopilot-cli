// Copyright (c) BioPilot CLI contributors.
// Licensed under the MIT License.

// The shell environment of the session, as BioPilot sees it: the one the session started with, then what
// the shell reports at each prompt (M2). Only what BioPilot needs to find binaries is kept.

export type SessionEnvironment = { PATH: string | undefined; CONDA_PREFIX: string | undefined };

let current: SessionEnvironment = { PATH: process.env.PATH, CONDA_PREFIX: process.env.CONDA_PREFIX };

export const sessionEnvironment = (): SessionEnvironment => current;

/** Called with what the shell reported at its prompt; `undefined` fields are kept as they were. */
export const setSessionEnvironment = (update: Partial<SessionEnvironment>): void => {
  current = {
    PATH: update.PATH ?? current.PATH,
    CONDA_PREFIX: "CONDA_PREFIX" in update ? update.CONDA_PREFIX : current.CONDA_PREFIX,
  };
};
