# Installation

One command downloads the program, checks its signature and checksum, and installs it as `~/.local/bin/biopilot`. Then one line in your shell's startup file starts BioPilot in every new terminal.

=== "Linux"

    **1. Download and install**

    ```shell
    curl -fsSL https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | sh
    ```

    If `curl` is not installed, use `wget`:

    ```shell
    wget -qO- https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | sh
    ```

    **2. Start BioPilot in every new terminal.** With bash, the default shell on Ubuntu:

    ```shell
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
    ~/.local/bin/biopilot init bash | tail -n 1 >> ~/.bashrc
    ```

    The first line makes the `biopilot` command available; skip it if `~/.local/bin` is already on your `PATH`. The second line adds the BioPilot start line at the end of `~/.bashrc`.

    With zsh, use `~/.zshrc` and `init zsh` instead. With fish:

    ```shell
    fish_add_path ~/.local/bin
    ~/.local/bin/biopilot init fish | tail -n 1 >> ~/.config/fish/config.fish
    ```

    **3. Close the terminal and open a new one.**

=== "macOS"

    **1. Download and install.** Open the Terminal application and run:

    ```shell
    curl -fsSL https://raw.githubusercontent.com/DEDJIABDOUL/biopilot-cli/main/install.sh | sh
    ```

    **2. Start BioPilot in every new terminal.** With zsh, the default shell on macOS:

    ```shell
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
    ~/.local/bin/biopilot init zsh | tail -n 1 >> ~/.zshrc
    ```

    If you use bash, write to `~/.bashrc` with `init bash`; for fish, see the Linux tab.

    **3. Close the terminal window and open a new one.**

=== "Windows (WSL)"

    BioPilot runs in the Windows Subsystem for Linux (WSL), which provides a real Linux environment on Windows. It does not run in PowerShell or the Command Prompt.

    **1. Install WSL** if it is not installed yet. Open PowerShell as administrator and run:

    ```powershell
    wsl --install
    ```

    This installs WSL 2 with Ubuntu. Restart Windows when asked, then open "Ubuntu" from the Start menu and choose a user name and password.

    **2. Install BioPilot inside Ubuntu.** In the Ubuntu terminal, follow the Linux tab. Install BioPilot inside WSL, in the same Linux environment as your bioinformatics tools.

    **3. Close the Ubuntu terminal and open it again.**

    Windows Terminal, from the Microsoft Store, gives the best display of the suggestions.

=== "From source"

    To work on BioPilot from the source code, with conda:

    ```shell
    git clone https://github.com/DEDJIABDOUL/biopilot-cli.git
    cd biopilot-cli
    conda create -n biopilot-dev -c conda-forge nodejs=22 zsh fish
    conda activate biopilot-dev
    npm ci
    npm run build:db
    npm run build
    npm test
    node build/index.js
    ```

    `npm test` runs the unit tests and `npm run test:e2e` the end-to-end tests in real bash, zsh and fish sessions. `biopilot init bash` (or `zsh`, `fish`) then prints the line to add.

!!! warning "Keep the start line last"
    The BioPilot start line must stay the **last line** of your shell's startup file.

Continue with the [first steps](first-steps.md).

## What the install script does

- Downloads the standalone program for your system from the latest [GitHub Release](https://github.com/DEDJIABDOUL/biopilot-cli/releases). Node.js is embedded: nothing to compile.
- Checks that the release's checksums are signed by the BioPilot release key (with `openssl`), and that the program matches its SHA-256 checksum. It refuses to install anything that fails these checks.
- Installs the program as `~/.local/bin/biopilot` and its resources, the Catalog included, in `~/.local/share/biopilot/`.
- Never uses `sudo` and never changes your files.

## Install script variables

Set them before `sh`, for example `curl … | BIOPILOT_VERSION=1.1.4 sh`.

| Variable | Effect |
|---|---|
| `BIOPILOT_VERSION=1.1.4` | install that version instead of the latest |
| `BIOPILOT_INSTALL_DIR=~/bin` | install the program there instead of `~/.local/bin` |
| `BIOPILOT_DOWNLOAD_URL=…` | download from a mirror (a folder holding the release files) |

If the script warns that `~/.local/bin` is not on your `PATH`, add `export PATH="$HOME/.local/bin:$PATH"` to your shell's startup file first.
