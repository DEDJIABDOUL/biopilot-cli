# Security policy

BioPilot runs inside your shell, runs the help and version commands of installed tools, and shows file names and helps in your terminal. Problems in any of these are taken seriously.

## Supported versions

| Version | Security fixes |
|---|---|
| latest minor release (currently 1.1.x) | yes |
| older releases | no: update with the install command |

## Report a vulnerability

**Do not open a public issue.** Report it privately through GitHub: go to the repository's **Security** tab and choose **Report a vulnerability** ([direct link](https://github.com/DEDJIABDOUL/biopilot-cli/security/advisories/new)).

Please include the BioPilot version (`biopilot --version`), your system and shell, and the steps to reproduce.

What to expect:

- an acknowledgement within 7 days;
- an assessment and a planned fix date within 14 days;
- a patch release as soon as the fix is ready, outside the usual release cadence, with credit to you in the release notes unless you prefer otherwise.

## In scope

- the install script (`install.sh`), release signatures and checksums;
- anything that makes BioPilot run a command the user did not ask for;
- terminal escape sequences reaching the terminal through file names, helps or suggestions;
- the shell integration and its environment report;
- permissions of the User store and of BioPilot's data directory.

Vulnerabilities in the bioinformatics tools BioPilot completes should be reported to those tools' authors.
