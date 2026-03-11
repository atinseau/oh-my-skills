# Commands

Les commandes shell distribuées par `oh-my-skills` vivent dans ce dossier.

## Structure

Deux structures sont supportées :

```
commands/
├── command-name.sh              # Structure plate
├── command-name/
│   ├── command-name.sh          # Structure en dossier
│   └── command-name.test.ts     # Test co-localisé
```

- Chaque fichier `*.sh` est sourcé automatiquement dans le shell utilisateur
- Les sous-dossiers sont autorisés et sont sourcés récursivement
- Seuls les fichiers `*.sh` sont copiés dans `~/.oh-my-skills/commands/` pendant l'installation (les tests et autres fichiers sont ignorés)

## Tests

Les tests unitaires des commandes vivent dans le dossier de la commande elle-même (co-location).
Ils sont exécutés avec `bun test` et utilisent `testcontainers` pour l'isolation Docker.
