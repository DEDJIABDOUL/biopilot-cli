# BioPilot CLI — Cahier des charges technique

| | |
|---|---|
| **Version du document** | 1.0 — 6 novembre 2026 |
| **Statut** | Proposition à valider |
| **Base technique** | Fork léger de Microsoft Inshellisense (licence MIT) |
| **Cible** | Bioinformaticiens et biologistes computationnels, en local |

---

## 1. Objectif

BioPilot CLI est une autocomplétion de terminal spécialisée en bioinformatique. Pendant la saisie, il propose les bonnes options, les bons fichiers et les bonnes valeurs pour des outils comme fastp, Porechop, samtools ou bwa. Il tient compte de la version installée et du projet en cours.

Trois exigences guident toutes les décisions :

1. **Léger :** peu de dépendances, une petite base SQLite et aucun service en arrière-plan.
2. **Performant :** les suggestions apparaissent sans délai perceptible pendant la frappe.
3. **Rapide à installer :** une seule ligne de commande, sans droits administrateur.

L'outil doit être utile dès l'installation, sans compte, sans réseau et sans LLM.

---

## 2. Périmètre

### 2.1 Inclus en version 1

- Autocomplétion des commandes, sous-commandes, options et valeurs des outils bio de la liste en annexe A.
- Base de connaissances SQLite locale, fournie pré-remplie.
- Import automatique d'un outil absent de la base à partir de son `--help`.
- Détection de l'environnement actif : conda, mamba, micromamba et virtualenv.
- Détection de la version réelle de chaque outil.
- Suggestions de fichiers selon le format attendu (FASTQ, BAM, FASTA, etc.), avec appariement R1/R2.
- Classement selon le contexte et les habitudes de l'utilisateur.
- Conservation de l'autocomplétion générale d'Inshellisense (git, cd, ls…), les outils bio passant en priorité.
- Shells pris en charge : bash, zsh et fish.
- Systèmes pris en charge : Linux (x64, arm64), macOS (arm64, x64) et Windows via WSL.

### 2.2 Exclus de la version 1

| Exclu | Raison | Échéance |
|---|---|---|
| Clusters HPC, Lmod, SLURM | Hors besoin actuel | Plus tard |
| Conteneurs (Docker, Apptainer) | Complexité de résolution des binaires | Plus tard |
| Windows natif (PowerShell, cmd) | Public cible sous Linux, macOS ou WSL | Non prévu |
| Couche LLM | Facultative par principe | Version 2 |
| Indexation de documentation externe | Non nécessaire à l'autocomplétion | Version 2 |
| Lecture du contenu des fichiers de données | Confidentialité et performance | Option envisageable plus tard |

---

## 3. Principes de conception

| Principe | Règle concrète |
|---|---|
| **Fork minimal** | Le moteur et le rendu d'Inshellisense restent intacts. Le code BioPilot vit dans un dossier séparé, appelé depuis quelques points d'ancrage identifiés (section 5). |
| **Local-first** | Aucune requête réseau à l'exécution. Pas de télémétrie. |
| **La vérité vient du binaire** | Les options affichées sont celles de la version installée. La base apporte le classement, les types et les règles. |
| **Échec silencieux** | Une erreur de BioPilot ne bloque jamais le terminal. Le moteur retombe sur le comportement d'Inshellisense. |
| **Rien à chaque frappe qui coûte** | Pas de processus *bloquant*, pas d'accès réseau, pas de parcours disque complet pendant la frappe. Seule exception : le calcul détaché d'un profil inconnu (section 6.5). Tout ce qui est coûteux est mis en cache. |
| **AI-optional** | Toute fonctionnalité de la version 1 marche sans LLM. |

---

## 4. Architecture

```text
Utilisateur
   │  bash · zsh · fish
   ▼
┌──────────────────────────────────────────────────────────┐
│ Moteur Inshellisense (forké, patchs minimaux)            │
│   terminal (pty) · parseur · rendu des suggestions       │
└──────────────┬───────────────────────────────────────────┘
               │ points d'ancrage (section 5)
               ▼
┌──────────────────────────────────────────────────────────┐
│ Noyau BioPilot  (src/biopilot/)                          │
│                                                          │
│  Session ──► Résolveur ──► Base SQLite ──► Classement    │
│  (env shell)  (binaire,     (knowledge.db   (contexte,   │
│               version,       + user.db)      usage)      │
│               --help)                                    │
│                         Contexte projet                  │
│                         (fichiers, formats, R1/R2)       │
└──────────────────────────────────────────────────────────┘
```

### 4.1 Modules

| Module | Responsabilité |
|---|---|
| `session` | Recevoir l'environnement du shell : PATH, environnement conda actif, dossier courant. |
| `resolver` | Trouver le binaire actif, sa version et ses options réelles. |
| `knowledge` | Lire la base SQLite et appliquer les mises à jour de la base utilisateur. |
| `context` | Détecter la racine du projet, les formats de fichiers présents et l'appariement des reads. |
| `ranking` | Calculer la priorité de chaque suggestion. |
| `learn` | Importer un outil depuis son `--help`. |
| `cli` | Commandes `biopilot …` (section 9). |

---

## 5. Modifications du moteur Inshellisense

La liste est fermée. Toute modification supplémentaire doit être justifiée dans le dépôt, sinon la récupération des correctifs de l'original devient trop coûteuse.

| # | Modification | Fichiers concernés | Motif |
|---|---|---|---|
| M1 | Renommage : commande `biopilot`, variable de session `BIOPILOT`, config `~/.config/biopilot/`, données `~/.local/share/biopilot/` | `package.json`, `utils/constants.ts`, `utils/config.ts`, scripts `shell/` | Cohabiter avec un Inshellisense installé. Ne pas utiliser la marque d'origine. |
| M2 | Remontée de l'environnement du shell au moteur, via une séquence d'échappement émise au prompt par l'intégration shell existante | `shell/shellIntegration.*`, `isterm/` | Sans cela, `conda activate` reste invisible pour le moteur, qui tourne dans le processus parent. Supprime le besoin d'un hook à installer. |
| M3 | Point d'ancrage avant le chargement d'une spec : le noyau BioPilot fournit la spec des outils bio | `runtime/runtime.ts` | Brancher la base SQLite. |
| M4 | Respect de la priorité des options, y compris avant toute saisie | `runtime/suggestion.ts` | Le moteur d'origine force les options à une priorité fixe tant que rien n'est tapé. |
| M5 | Une option inconnue n'interrompt plus l'analyse de la ligne | `runtime/runtime.ts` | Le moteur d'origine cesse de suggérer après une option absente de la spec. |
| M6 | Commandes bio prioritaires dans la complétion du nom de commande, avec un bonus fixe si la plateforme de l'outil figure dans celles du projet | `runtime/runtime.ts` | `sam` doit proposer samtools en premier ; `mini` dans un projet nanopore, minimap2. |
| M7 | Ligne d'état facultative sous la liste : environnement, version de l'outil, alerte éventuelle | `ui/` | Rendre visible ce que BioPilot a détecté. Désactivable. |
| M8 | Correction de `complete` : chargement de la configuration, sortie vide sans plantage | `commands/complete.ts` | Permettre des tests automatisés sans terminal. |
| M9 | Enregistrement des commandes BioPilot (`info`, puis les suivantes) et contrôle du catalogue dans `doctor` ; le code vit dans `src/biopilot/cli/`, chargé à la demande | `index.ts`, `ui/ui-doctor.ts` | Exposer les commandes de la section 9 sans toucher au démarrage de session. |

Chaque modification est isolée dans un commit distinct et marquée `BIOPILOT:` dans le code.

---

## 6. Base de connaissances SQLite

### 6.1 Deux fichiers séparés

| Fichier | Contenu | Écrit par |
|---|---|---|
| `knowledge.db` | Connaissance fournie : outils, options, règles | La compilation de chaque version de BioPilot. En lecture seule chez l'utilisateur. |
| `user.db` | Outils importés depuis `--help`, profils de versions, statistiques d'usage | BioPilot, sur la machine de l'utilisateur |

Une mise à jour de BioPilot remplace `knowledge.db` sans toucher à `user.db`.

### 6.2 Schéma de `knowledge.db`

```sql
CREATE TABLE tools (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,      -- nom de l'exécutable : fastp
  package     TEXT,                      -- nom du paquet conda, s'il diffère
  description TEXT,
  platforms   TEXT NOT NULL DEFAULT '[]', -- JSON : ["illumina", "nanopore"] ; [] = generic
  version_args TEXT NOT NULL,            -- JSON : ["--version"]
  version_regex TEXT NOT NULL            -- 'fastp (\d[\w.]*)'
);

CREATE TABLE commands (                  -- racine et sous-commandes
  id        INTEGER PRIMARY KEY,
  tool_id   INTEGER NOT NULL REFERENCES tools(id),
  parent_id INTEGER REFERENCES commands(id),
  name      TEXT NOT NULL,               -- '' pour la racine, 'sort' pour samtools sort
  help_args TEXT,                        -- JSON : ["sort", "--help"]
  description TEXT
);

CREATE TABLE options (
  id          INTEGER PRIMARY KEY,
  command_id  INTEGER NOT NULL REFERENCES commands(id),
  names       TEXT NOT NULL,             -- JSON : ["-i", "--in1"] — alias sensibles à la casse
  canonical_name TEXT NOT NULL,          -- premier nom long, sinon premier nom : --in1 (décision 11)
  description TEXT,
  value_type  TEXT,                      -- NULL (drapeau) | int | float | string | file | dir | enum
  value_format TEXT,                     -- fastq | bam | fasta | ... si value_type = file
  read_role   INTEGER,                   -- 1 ou 2 pour les entrées appariées
  mate_of     INTEGER REFERENCES options(id), -- option du mate (annexe B : mate_of)
  derive      TEXT,                      -- JSON : {"from": "--in1", "suffix": ".trimmed"} (annexe B)
  value_optional INTEGER NOT NULL DEFAULT 0, -- --opt[=VAL]
  value_multiple INTEGER NOT NULL DEFAULT 0, -- plusieurs valeurs après l'option
  repeatable  INTEGER NOT NULL DEFAULT 0,
  hidden      INTEGER NOT NULL DEFAULT 0, -- connue (analyse de la ligne), jamais proposée
  deprecated  INTEGER NOT NULL DEFAULT 0,
  default_value TEXT,
  rank        INTEGER NOT NULL DEFAULT 50, -- barème en section 6.4
  since_version TEXT,                    -- facultatif, si connu
  until_version TEXT
);

CREATE TABLE option_values (             -- valeurs proposées ; fermées seulement si value_type = enum
  option_id   INTEGER NOT NULL REFERENCES options(id),
  value       TEXT NOT NULL,             -- BAM
  description TEXT
);

CREATE TABLE arguments (                 -- positionnels
  command_id  INTEGER NOT NULL REFERENCES commands(id),
  position    INTEGER NOT NULL,
  name        TEXT NOT NULL,
  value_format TEXT,
  read_role   INTEGER,
  variadic    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE rules (                     -- règles de contexte
  option_id   INTEGER NOT NULL REFERENCES options(id),
  condition   TEXT NOT NULL,             -- JSON : {"used": ["--in1"], "paired": true, "platform": "nanopore", "assay": "rna-seq"}
  boost       INTEGER NOT NULL           -- de -100 à +100
);

CREATE TABLE formats (
  name     TEXT PRIMARY KEY,             -- fastq | bwa-index | salmon-index
  kind     TEXT NOT NULL DEFAULT 'file', -- file | prefix (index : un préfixe + des suffixes) | dir (index : un dossier)
  pattern  TEXT,                         -- kind = file : '\.(fastq|fq)(\.gz|\.bz2)?$'
  suffixes TEXT,                         -- kind = prefix : JSON [".amb", ".ann", ".bwt", ".pac", ".sa"]
  marker   TEXT                          -- kind = dir : fichier présent dans le dossier, ex. versionInfo.json
);

CREATE TABLE metadata (                  -- version du schéma (entier) : le lecteur n'accepte que la sienne, à l'identique
  key   TEXT PRIMARY KEY,                -- schema_version | biopilot_version
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE options_fts USING fts5(names, description, content='options', content_rowid='id');
```

### 6.3 Schéma de `user.db`

```sql
CREATE TABLE profiles (                  -- options réelles d'une version d'une commande
  tool        TEXT NOT NULL,
  version     TEXT NOT NULL,             -- version détectée ; à défaut, 'fp:' + empreinte
  command     TEXT NOT NULL,             -- '' ou 'sort'
  options     TEXT NOT NULL,             -- JSON issu du --help
  fingerprint TEXT NOT NULL,             -- empreinte du binaire analysé : contrôle de fraîcheur, pas clé
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (tool, version, command)   -- partagé entre environnements conda
);

CREATE TABLE learned_tools (             -- outils absents du catalogue
  name        TEXT PRIMARY KEY,
  definition  TEXT NOT NULL              -- JSON : comment l'interroger (sous-commandes, version, aide),
                                         -- sans options : celles-ci viennent des profils
);

CREATE TABLE usage (
  tool        TEXT NOT NULL,
  command     TEXT NOT NULL,
  option_name TEXT NOT NULL,             -- nom canonique : premier nom long, sinon premier nom
  count       INTEGER NOT NULL DEFAULT 0,
  last_used   INTEGER NOT NULL,
  PRIMARY KEY (tool, command, option_name)
);
```

### 6.4 Alimentation

1. **Sources :** un fichier YAML par outil dans `knowledge/tools/`, versionné dans Git et relu comme du code (format en annexe B).
   - **Barème des rangs :** 90–100 entrées et sorties principales, référence ; 70–89 options réglées très souvent (threads, preset, format de sortie) ; 50 par défaut ; 30–49 réglages fins ; 10–29 options rares, de débogage ou obsolètes. Les rangs proposés sont relus par un expert du domaine avant fusion.
   - **Descriptions :** reformulées, jamais copiées du `--help` (licences GPL de certains outils).
   - **`--help` de référence :** enregistrés depuis un environnement conda dédié `biopilot-tools` (bioconda + conda-forge, linux-64), avec outil, version, commande et date, et une attribution par licence. Le catalogue est rédigé d'après la version la plus récente à l'enregistrement (fastp 1.4.0 au 6 novembre 2026). Les versions anciennes utiles aux scénarios de l'annexe C (fastp 0.23.4 et 0.20.1) sont enregistrées en plus, comme données de test seulement.
2. **Compilation :** `npm run build:db` valide chaque fichier YAML avec un schéma, puis produit `knowledge.db`. La CI refuse un YAML invalide.
3. **Import local :** `biopilot learn <outil>` lance le `--help`, l'analyse et enregistre le résultat dans `user.db`. Les sous-commandes listées dans l'aide racine sont découvertes automatiquement (`<outil> <sub> --help`), sur un seul niveau et au plus 50. La version est cherchée dans `conda-meta/`, sinon par les sondes `--version`, `-V` puis `version` (2,5 s, entrée standard fermée), sinon le profil est indexé par l'empreinte ; la méthode retenue est enregistrée dans `learned_tools`.
4. **Usage :** chaque option acceptée par l'utilisateur incrémente `usage`, sous son nom canonique (`-i` et `--in1` comptent pour `--in1`). L'usage est global à la machine, pas par projet. Ces données ne quittent jamais la machine.

### 6.5 Fusion à l'exécution

| Situation | Options affichées | Classement |
|---|---|---|
| Outil installé, profil connu | Celles du profil (`--help` réel) | Règles de `knowledge.db` + usage |
| Outil installé, profil inconnu | Celles de `knowledge.db`, puis profil calculé par un processus détaché (une fois par empreinte, 2,5 s au plus, jamais attendu par la frappe) | Idem |
| Outil absent de la machine | Celles de `knowledge.db` | Règles seules |
| Outil appris (absent de `knowledge.db`) | Celles de son profil, obtenu comme ci-dessus à partir de `learned_tools` | Usage seul |

### 6.6 Bibliothèque SQLite — décision

**`better-sqlite3`** (voir [ADR-0001](./docs/adr/0001-better-sqlite3.md)).

| Option | Avantage | Point vérifié |
|---|---|---|
| `node:sqlite` intégré à Node | Aucune dépendance | Rejeté : encore au stade *Release Candidate* (pas stable) même en Node 26, et API modifiée récemment (renommage dans la 26.11). *(Corrigé le 6 novembre 2026 : l'argument « exige Node 22+ » ne le distingue pas de `better-sqlite3`, qui l'exige aussi.)* |
| **`better-sqlite3`** ✅ | Rapide, mûr, synchrone | Retenu : depuis la v13, les binaires précompilés (Node-API) sont embarqués dans le paquet npm lui-même pour les six cibles (linux/darwin/win32 × x64/arm64, plus linux musl) — aucune compilation chez l'utilisateur. Exige Node 22+ (la v12 exigeait déjà Node 20+ ; aucune version ne prend en charge Node 18). Module natif : pour le binaire autonome (SEA), devra être extrait sur disque puis chargé au runtime, exactement comme le moteur Inshellisense le fait déjà pour `node-pty`. |
| `sql.js` (WebAssembly) | Portable, sans module natif | Rejeté : `user.db` deviendrait purement en mémoire, imposant de sérialiser/réécrire le fichier à chaque mutation (statistiques d'usage, outils appris) — coût d'ingénierie pour un gain de simplicité marginal, et binaire WASM d'environ 1,5 Mo ajouté. |

Critères de décision : temps d'ouverture, taille ajoutée, absence de compilation chez l'utilisateur.

---

## 7. Environnement et version

### 7.1 Résolution du binaire actif

1. Chercher l'exécutable dans le PATH du shell transmis par M2.
2. Ignorer les entrées relatives du PATH, pour que le dossier courant ne décide pas de ce qui est exécuté.
3. Calculer l'empreinte du binaire à partir de son chemin réel, de sa taille et de sa date de modification.

### 7.2 Version

1. Lire `conda-meta/<paquet>-<version>-<build>.json` dans le préfixe de l'environnement. Aucun processus n'est lancé.
2. Sinon, lancer la commande de version déclarée, avec un délai maximal de 2,5 s et l'entrée standard fermée.
3. Mettre le résultat en cache selon l'empreinte.

### 7.3 Analyse du `--help`

- Formats reconnus au minimum : style fastp (cmdline), argparse (FastQC), htslib (samtools), et aide écrite à la main (bwa).
- Détection des alias, des options à valeur, des descriptions sur la ligne suivante et des formes `--region[s]-file`.
- Une ligne non reconnue est ignorée : l'analyseur n'invente jamais d'option.
- Chaque format est couvert par des tests sur de vraies sorties `--help`, enregistrées dans le dépôt.

---

## 8. Contexte projet et classement

### 8.1 Détection du projet

- **Racine :** premier dossier parent contenant `.git`, `environment.yml`, `Snakefile`, `nextflow.config` ou `.biopilot.toml`.
- **Parcours :** profondeur 3, au plus 2 000 entrées, sans dossiers cachés, `node_modules`, `work/` ni `.snakemake/`.
- **Lecture :** seuls les noms de fichiers sont lus, plus `environment.yml` (64 Ko au plus).
- **Résultat :** deux champs détectés indépendamment, plus la présence de reads appariés et les formats présents :
  - `platform` : **ensemble** de plateformes (`illumina`, `nanopore`), vide = `generic`. *nanopore* si `*.pod5`, `*.fast5`, `sequencing_summary*.txt` ou un dossier `fastq_pass/` ; *illumina* si des paires R1/R2 complètes ou les motifs `_L00N_` / `_SN_`. Les paquets d'`environment.yml` ne servent que d'indice secondaire.
  - `assay` (`rna-seq` | `variant-calling` | `unknown`), déduit des seuls formats : `.gtf`/`.gff`, index salmon ou `quant.sf` → `rna-seq` ; `.vcf`/`.bcf`, ou `.bam` avec une référence `.fa` indexée et sans annotation → `variant-calling` ; sinon `unknown`. Jamais déduit des outils de l'environnement.
  - `.biopilot.toml` a toujours le dernier mot.
- **Cache :** 10 s par racine.

### 8.2 Fichiers proposés

- Seuls les fichiers du format attendu sont proposés, du plus pertinent au moins pertinent.
- **Reads appariés :** schémas `_R1`, `_1`, `.R1` et `_R1_001`. Une paire n'est reconnue que si les deux mates existent, avec des noms identiques au marqueur près (`rep_1.fastq.gz` seul n'est pas apparié). Après une entrée R1, son mate R2 passe en tête.
- **Sorties :** nom dérivé de l'entrée, placé dans `results/` si ce dossier existe (`ctrl_R1.trimmed.fastq.gz`).
- **Index :** les fichiers d'un même index sont regroupés en un seul préfixe (`genome.fa` pour `genome.fa.bwt`, `.sa`…).

### 8.3 Calcul de la priorité

```text
priorité = rang de base (knowledge.db)
         + bonus des règles dont la condition est vraie
           (conditions possibles : options utilisées, reads appariés, platform, assay)
         + bonus d'usage (plafonné à +15)
```

Les options déjà saisies disparaissent de la liste. En cas d'égalité, l'ordre du catalogue s'applique.

### 8.4 Configuration de projet (facultative)

```toml
# .biopilot.toml
assay = "rna-seq"
platform = ["illumina"]
reference = "ref/GRCh38.fa"
results_dir = "results"
threads = 8
```

---

## 9. Interface en ligne de commande

| Commande | Rôle |
|---|---|
| `biopilot` | Ouvre une session d'autocomplétion dans le shell courant |
| `biopilot init <shell>` | Affiche la ligne à ajouter au fichier de démarrage du shell |
| `biopilot reinit` | Remplace les ressources installées, dont le catalogue, après une mise à jour ; ne touche jamais aux données de l'utilisateur |
| `biopilot doctor` | Vérifie l'installation, la base, le shell et l'environnement |
| `biopilot status` | Affiche l'environnement, le projet et les versions détectés |
| `biopilot learn <outil>` | Importe un outil depuis son `--help` |
| `biopilot sync` | Calcule à l'avance les profils des outils de l'environnement actif |
| `biopilot search "<texte>"` | Recherche une option par sa description (FTS5) |
| `biopilot info [--json] [outil] [sous-commande…] [option]` | Affiche la fiche d'un outil, d'une sous-commande ou d'une option. Les options de BioPilot se placent avant le nom de l'outil ; tout ce qui suit est lu comme chemin de sous-commande et nom d'option (fastp a lui-même une option `--json`). |
| `biopilot reset-usage` | Efface les statistiques d'usage |
| `biopilot uninstall` | Supprime la configuration, les données et la ligne de démarrage |

Exigences communes :
- Code de sortie 0 en cas de succès, 1 en cas d'erreur.
- Sortie lisible dans un pipe, par exemple `biopilot status | head`.
- Option `--json` sur `status`, `info` et `search`.

---

## 10. Installation

### 10.1 Une seule ligne

```shell
curl -fsSL https://<domaine>/install.sh | sh
```

Le script :
1. détecte le système et l'architecture ;
2. télécharge le binaire autonome correspondant, avec Node embarqué, comme le fait déjà le paquet d'Inshellisense ;
3. vérifie sa somme SHA-256 ;
4. l'installe dans `~/.local/bin`, sans droits administrateur ;
5. place `knowledge.db` dans `~/.local/share/biopilot/` ;
6. affiche la ligne `biopilot init <shell>` à ajouter, sans modifier les fichiers du shell sans accord.

Variantes pour les utilisateurs qui préfèrent un gestionnaire de paquets :

```shell
npm install -g biopilot-cli
conda install -c conda-forge biopilot-cli   # cible à moyen terme, très utilisée par le public visé
```

### 10.2 Exigences

| Exigence | Cible |
|---|---|
| Durée de l'installation | Moins de 30 s avec une connexion ordinaire |
| Étapes manuelles après le script | Une seule : ajouter la ligne d'initialisation du shell |
| Droits administrateur | Jamais |
| Compilation chez l'utilisateur | Jamais |
| Prérequis | Aucun pour le binaire autonome. Variante npm : un Node récent suffit, car le paquet ne fait que lancer le binaire autonome, qui embarque Node 22. Développement et installation depuis les sources : Node 22 (plancher imposé par `better-sqlite3`, plafond `<23` hérité d'Inshellisense) |
| Mise à jour | Relance du script (ou `npm`/`conda`), puis `biopilot reinit`, que la session réclame d'elle-même tant que les ressources sont d'une autre version |
| Désinstallation | `biopilot uninstall` laisse le système dans son état initial |

---

## 11. Performance

Ces valeurs sont des cibles à mesurer en continu. Le prototype actuel indique des temps de 0,15 ms (médiane) avec cache, et de 18 ms sans cache, pour le classement des options de fastp.

| Mesure | Cible |
|---|---|
| Ouverture de session ajoutée par BioPilot | < 100 ms |
| Suggestions d'un outil connu, cache chaud | < 10 ms côté BioPilot |
| Première suggestion d'un outil, cache froid | < 300 ms |
| Requête SQLite | < 2 ms |
| Parcours du projet | < 50 ms pour 2 000 entrées |
| Mémoire ajoutée | < 30 Mo |
| Coût du prompt (M2) | Aucun processus lancé |
| Taille de `knowledge.db` | < 5 Mo pour 50 outils |
| Taille du binaire installé | À mesurer en phase 0 ; ne pas dépasser l'original de plus de 10 % |

---

## 12. Sécurité et confidentialité

- Aucune connexion réseau à l'exécution, et aucune télémétrie.
- Seuls des outils présents dans la base ou explicitement importés sont exécutés, et uniquement avec `--help` ou la commande de version.
- Les chemins relatifs du PATH ne sont jamais utilisés pour trouver un binaire.
- Le contenu des fichiers de données n'est jamais lu en version 1.
- Les fichiers de session et `user.db` sont créés avec les droits `0600` ou `0700`.
- `biopilot reset-usage` et `biopilot uninstall` effacent toutes les données locales.

---

## 13. Couche LLM (version 2, facultative)

Prévue pour l'architecture, non développée en version 1.

- Fournisseurs : Claude, GPT, Grok, Gemini, et un modèle local via Ollama.
- Déclenchement explicite uniquement, par une commande comme `biopilot ask`, jamais à la frappe.
- Clés stockées dans le trousseau du système.
- Aperçu des informations envoyées avant chaque requête, avec masquage des chemins et des identifiants d'échantillons.
- Réponses accompagnées de la version de l'outil et de la source documentaire.

---

## 14. Qualité et tests

| Niveau | Contenu | Seuil |
|---|---|---|
| Unitaire | Analyse du `--help` sur de vraies sorties, appariement des reads, classement, requêtes SQLite | Tous verts, couverture > 80 % du noyau BioPilot |
| Base | Validation du schéma de chaque YAML, compilation reproductible | Bloquant en CI |
| Bout en bout | Vraies sessions dans un pseudo-terminal, rendu par le même émulateur que le moteur, avec de vrais environnements conda à deux versions d'un même outil | Tous verts sur Linux et macOS |
| Performance | Mesures de la section 11 | Échec si une cible est dépassée de plus de 20 % |
| Régression | Autocomplétion générale (git, cd) inchangée | Bloquant |
| Upstream | Rejeu des tests d'Inshellisense sur le fork | Bloquant |

---

## 15. Livrables et jalons

| Phase | Contenu | Critère de fin |
|---|---|---|
| 0. Fondations | Fork, renommage (M1), choix SQLite, mesures de référence | `biopilot` s'installe et fonctionne comme Inshellisense |
| 1. Base | Schéma, compilation YAML vers SQLite, 10 outils de l'annexe A | `biopilot info fastp` répond depuis la base |
| 2. Moteur | M2 à M6, branchement de la base | `fastp --` affiche les options classées |
| 3. Version réelle | Résolveur, analyse du `--help`, profils | `--dedup` apparaît avec fastp 0.23.4 et pas avec 0.20.1 |
| 4. Contexte | Projet, formats, R1/R2, sorties dérivées, usage | Scénarios de l'annexe C verts |
| 5. Distribution | Script d'installation, binaires, `doctor`, `uninstall` | Installation en moins de 30 s sur une machine vierge |
| 6. Version 1.0 | Documentation, M7, M8, durcissement | Toutes les cibles de la section 11 atteintes |

---

## 16. Risques

| Risque | Impact | Parade |
|---|---|---|
| Inshellisense reste pré-1.0 depuis l'origine (0.0.x sur 4 releases), maintenu par une petite équipe sans engagement public de support long terme | Fork plus difficile à maintenir si le rythme ralentit ou change | Patchs isolés et listés, tests upstream en CI, noyau BioPilot indépendant du moteur |
| `--help` dans un format non prévu | Options manquantes | Retour à `knowledge.db`, test ajouté pour chaque nouveau format |
| Outil lent à afficher son aide (Java) | Première suggestion lente | `biopilot sync`, calcul en arrière-plan |
| Module SQLite natif incompatible | Échec d'installation | Choix en phase 0, binaires précompilés, solution WebAssembly en secours |
| Base de connaissances incomplète ou fausse | Perte de confiance | Le binaire fait foi, relecture des YAML, `biopilot learn` |

---

## 17. Décisions

1. **Bibliothèque SQLite :** `better-sqlite3` — voir section 6.6 et [ADR-0001](./docs/adr/0001-better-sqlite3.md).
2. **Nom de paquet :** `biopilot-cli` (npm, dépôt GitHub, feedstock conda-forge). La commande shell reste `biopilot` (M1, section 5). Disponibilité vérifiée le 6 novembre 2026 sur les trois plateformes ; `biopilot` seul a été écarté car l'organisation GitHub de ce nom est déjà prise et qu'un produit commercial existant (bioréacteur pilote) porte ce nom dans le même secteur.
3. **Licence :** MIT, avec un fichier `NOTICE` préservant intégralement la licence et le copyright d'Inshellisense (`Copyright (c) Microsoft Corporation`).
4. **Hébergement :** GitHub Releases, dépôt [`DEDJIABDOUL/biopilot-cli`](https://github.com/DEDJIABDOUL/biopilot-cli) (privé pour l'instant — à rendre public avant la distribution en section 10).

5. **Langue :** ce document reste en français tant qu'il est une proposition. Le glossaire (`GLOSSARY.md`), le code, le README et la documentation publique (phase 6) sont en anglais.
6. **`assay` et `platform` :** deux champs indépendants (section 8.1). `platform` remplace `tools.data_type` et reprend son vocabulaire.
7. **Profils partagés :** un profil est indexé par `(tool, version, command)` et réutilisé d'un environnement conda à l'autre. L'empreinte ne sert qu'au contrôle de fraîcheur, ou de clé de repli si la version est inconnue (section 6.3).
8. **Vocabulaire :** la connaissance fournie s'appelle le *Catalog*, celle produite localement le *User store* (voir `GLOSSARY.md`).
9. **Calcul détaché d'un profil :** autorisé pendant la frappe, sans jamais la bloquer (sections 3 et 6.5). « Aucun service en arrière-plan » signifie aucun démon permanent. Voir [ADR-0002](./docs/adr/0002-detached-profile-computation.md).
10. **Outils appris :** `learned_tools` décrit seulement comment interroger l'outil. Ses options viennent de ses profils, comme pour un outil du catalogue.
11. **Usage :** compté par option, sous son nom canonique (section 6.4).

12. **Plateformes multiples :** `platform` est un ensemble (section 8.1).
13. **Détection de `platform` et `assay` :** à partir des seuls noms de fichiers ; `environment.yml` n'est qu'un indice secondaire pour `platform` et n'intervient jamais pour `assay` ; `.biopilot.toml` prime (section 8.1).
14. **Paires de reads :** reconnues seulement si les deux mates existent (section 8.2).
15. **Sous-commandes des outils appris :** découverte automatique, un niveau, 50 au plus (section 6.4).

16. **Classement par plateforme :** les règles peuvent porter sur `platform` et `assay` (sections 6.2 et 8.3), et M6 favorise les outils de la plateforme du projet.
17. **Usage global :** compté pour toute la machine, pas par projet (section 6.4).
18. **Version d'un outil appris :** `conda-meta/`, puis sondes `--version`, `-V`, `version`, puis empreinte (section 6.4).

19. **Plancher Node 22 pour le développement** (section 10.2) : `better-sqlite3` exige Node 22+ ; l'argument de l'ADR-0001 contre `node:sqlite` fondé sur Node 18 était faux et a été corrigé. *(Précisé le 6 novembre 2026 : la variante npm n'est qu'un lanceur du binaire autonome, qui embarque Node 22 ; le plancher ne concerne que le développement et l'installation depuis les sources.)*
20. **Schéma du catalogue aligné sur l'annexe B** (section 6.2) : ajout de `canonical_name`, `mate_of`, `derive` et d'une table `metadata` portant la version du schéma.

21. **JSON de `biopilot info` :** contrat versionné (`"format": 1`), champs nommés d'après le glossaire en snake_case, publié comme JSON Schema. Ajouter un champ ne casse rien ; retirer ou renommer un champ incrémente `format`.
22. **Emplacement du catalogue :** `BIOPILOT_CATALOG`, puis `knowledge.db` dans le dossier de données de BioPilot (`~/.local/share/biopilot/` par défaut, selon `XDG_DATA_HOME`), puis le catalogue compilé à côté du build ; sinon indisponible.
23. **`--help` de référence :** environnement `biopilot-tools`, linux-64, avec métadonnées. Le catalogue suit la version la plus récente de chaque outil ; fastp 0.23.4 et 0.20.1 sont enregistrés en plus comme données de test (section 6.4). *(Corrigé le 6 novembre 2026 : la première version faisait suivre au catalogue fastp 0.23.4.)*
24. **Barème des rangs** (section 6.4), relu par un expert du domaine.
25. **Index de référence :** formats de genre `prefix` (bwa) ou `dir` (salmon) ; `.mmi` et `.fai` restent des formats `file` (section 6.2).
26. **Formes d'options :** `optional`, `multiple`, `repeatable`, `hidden`, `deprecated` ; `--x` et `--no-x` sont deux options distinctes.
27. **Plateformes d'un outil :** ensemble `platforms` ; vide = `generic` (remplace `platform`).
28. **Valeurs suggérées :** `values` autorisé sur tout type ; seul `enum` est fermé.
29. **`boost` :** de −100 à +100.
30. **Version du schéma :** entier, accepté seulement à l'identique ; sinon catalogue indisponible, signalé par `biopilot doctor`.
31. **Licences :** descriptions reformulées ; `--help` bruts conservés comme données de test avec attribution (avis juridique à prendre avant de rendre le dépôt public).
32. **Syntaxe de `biopilot info` :** les options de BioPilot avant le nom de l'outil ; après, tout est chemin de sous-commande et nom d'option (section 9).
33. **Remplacement du catalogue :** la décompression des ressources écrase le catalogue (les autres ressources de l'amont ne sont copiées que si absentes) ; `biopilot reinit` le remplace sans toucher aux données de l'utilisateur. Il n'y a pas de commande `biopilot update` (section 10.2).
34. **Reconnaissance des index :** un index de genre `prefix` ou `dir` se reconnaît à partir de la liste des fichiers d'un dossier, pas d'un nom seul.
35. **Condition `platform` d'une règle :** vraie si les plateformes du projet contiennent la valeur donnée.

### Décisions encore ouvertes

Aucune. Session de "grilling" du 6 novembre 2026 (phase 1) close.

---

## Annexe A — Outils de la version 1

| Outil | Usage | Plateforme |
|---|---|---|
| fastp | Nettoyage des reads | Illumina |
| Porechop | Retrait des adaptateurs | Nanopore |
| FastQC | Contrôle qualité | Toutes |
| MultiQC | Synthèse des rapports | Toutes |
| bwa | Alignement de reads courts | Illumina |
| minimap2 | Alignement de reads longs | Nanopore |
| samtools | Manipulation de SAM, BAM et CRAM | Toutes |
| bcftools | Manipulation de variants | Toutes |
| salmon | Quantification RNA-seq | Illumina |
| blastn | Recherche par similarité | Toutes |

Les options de chaque outil sont importées depuis son `--help` officiel, puis complétées à la main pour les rangs, les formats et les règles.

## Annexe B — Format YAML d'un outil

```yaml
name: fastp
package: fastp
description: All-in-one FASTQ preprocessor
platforms: [illumina]
version: { args: ["--version"], regex: 'fastp (\d[\w.]*)' }
help: ["--help"]
options:
  - names: ["-i", "--in1"]
    description: read1 input file name
    value: { type: file, format: fastq, read_role: 1 }
    rank: 95
  - names: ["-I", "--in2"]
    description: read2 input file name
    value: { type: file, format: fastq, read_role: 2, mate_of: ["-i", "--in1"] }
    rank: 60
    rules:
      - when: { used: ["-i", "--in1"], paired: true }
        boost: 35
  - names: ["-o", "--out1"]
    description: read1 output file name
    value: { type: file, derive: { from: ["-i", "--in1"], suffix: ".trimmed" } }
    rank: 65
    rules:
      - when: { used: ["-i", "--in1"] }
        boost: 20
  - names: ["-w", "--thread"]
    description: worker thread number
    value: { type: int }
    rank: 50
```

## Annexe C — Scénarios d'acceptation

Projet de test : `data/ctrl_R1.fastq.gz`, `data/ctrl_R2.fastq.gz`, `data/treat_R1.fastq.gz`, `data/treat_R2.fastq.gz`, un dossier `results/` et `ref/genome.fa` indexé par bwa.

| # | Saisie | Résultat attendu en tête de liste |
|---|---|---|
| 1 | `fastp ` | `--in1` |
| 2 | `fastp --in1 ` | `data/ctrl_R1.fastq.gz`, puis `data/treat_R1.fastq.gz` |
| 3 | `fastp --in1 data/treat_R1.fastq.gz --in2 ` | `data/treat_R2.fastq.gz` |
| 4 | `fastp -i data/treat_R1.fastq.gz --` | `--in2`, et `--in1` absent |
| 5 | `fastp --in1 data/ctrl_R1.fastq.gz --out1 ` | `results/ctrl_R1.trimmed.fastq.gz` |
| 6 | `fastp --de` dans un environnement avec fastp 0.23.4 | `--dedup` présent |
| 7 | `fastp --de` après bascule vers fastp 0.20.1, même session | `--dedup` absent |
| 8 | `bwa mem ` | `ref/genome.fa` |
| 9 | `samtools sort ` | Fichiers BAM et SAM d'abord |
| 10 | `git ch` | `checkout` présent (pas de régression) |
| 11 | `sam` | `samtools` en premier |
| 12 | Machine sans réseau | Comportement identique aux scénarios 1 à 11 |
