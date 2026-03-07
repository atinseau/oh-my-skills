# oh-my-skills

`oh-my-skills` est un registre communautaire de skills LLM (Claude/Copilot) et de commandes shell.  
L’installation clone le repo dans `~/.oh-my-skills`, copie les skills vers les dossiers de chaque CLI détecté, copie les commandes dans `~/.oh-my-skills/commands`, puis injecte une seule ligne `source` dans ton shell (`.bashrc`/`.zshrc`).

À chaque ouverture d’un shell interactif, `oh-my-skills` vérifie s’il existe une nouvelle release.  
Si une mise à jour est disponible, une confirmation explicite est demandée avant toute modification. Si tu refuses, tu peux lancer la mise à jour plus tard avec `oms update`.  
Après une mise à jour acceptée, `oh-my-skills` affiche le changelog déterministe basé sur les titres de commits depuis la release précédente.

## Installation

### 1) Installer une release (URL versionnée, sans `TAG=...`)

Chaque release a sa propre URL d’installer.  
Exemple:

```bash
curl -fsSL https://raw.githubusercontent.com/atinseau/oh-my-skills/v0.0.2/scripts/install.sh | bash
```

Cette commande installe la version de la release ciblée par l’URL.

### 2) Installer la canary depuis `master`

```bash
curl -fsSL https://raw.githubusercontent.com/atinseau/oh-my-skills/master/scripts/install.sh | bash
```

Cette commande suit la branche `master` (canary).

### 3) Installer une version spécifique depuis l’installer `master`

```bash
curl -fsSL https://raw.githubusercontent.com/atinseau/oh-my-skills/master/scripts/install.sh | TAG=v0.0.2 bash
```

`TAG` force explicitement la version/tag à cloner.

## Désinstallation

```bash
curl -fsSL https://raw.githubusercontent.com/atinseau/oh-my-skills/master/scripts/uninstall.sh | bash
```

## Mise à jour manuelle

```bash
oms update
```

Cette commande relance le vérificateur de release à la demande et demande confirmation avant d’installer la nouvelle version.

## Développement local

```bash
# Installer les dépendances
bun install

# Type-check
bun check-types

# Lint/format
bun run check

# Tests (Docker requis)
TESTCONTAINERS_RYUK_DISABLED=true bun test

# Un fichier de test
TESTCONTAINERS_RYUK_DISABLED=true bun test tests/install.test.ts
```
