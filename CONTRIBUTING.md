# Contributing

## Workflow Git

### Branches

```
main          — production stable, protection activée
feat/<name>   — nouvelle fonctionnalité
fix/<name>    — correction de bug
chore/<name>  — maintenance, dépendances, CI
refactor/<name>
```

Toujours partir de `main` à jour :

```bash
git checkout main && git pull
git checkout -b feat/ma-feature
```

### Commits — Conventional Commits

Format : `type(scope): description courte`

| Type       | Usage                                  |
|------------|----------------------------------------|
| `feat`     | Nouvelle fonctionnalité                |
| `fix`      | Correction de bug                      |
| `chore`    | Dépendances, config, CI                |
| `refactor` | Refacto sans changement de comportement|
| `test`     | Ajout / modification de tests          |
| `docs`     | Documentation uniquement               |

Exemples :
```
feat(auth): add JWT refresh token
fix(ws): prevent duplicate message broadcast
chore(ci): add tarpaulin coverage step
```

### Pull Requests

1. Branche à jour avec `main` avant d'ouvrir la PR
2. Titre = message de commit principal (Conventional Commits)
3. Description : ce qui change + comment tester
4. CI verte obligatoire avant merge
5. Au moins 1 review

---

## Configuration de l'environnement de dev

### Prérequis

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup component add rustfmt clippy

# Node.js 20 (via nvm ou direct)
node --version   # >= 20

# PostgreSQL + MongoDB démarrés localement
```

### Backend

```bash
cd server
cp .env.example .env
# Remplir DATABASE_URL, MONGODB_URL, JWT_SECRET, TENOR_API_KEY

cargo build          # vérifie que ça compile
cargo run            # démarre sur :3001
```

### Frontend

```bash
cd client
npm install
npm run dev          # démarre sur :3000
```

### Desktop

```bash
# Nécessite que le frontend tourne sur :3000
cd client
npm run electron
```

---

## Conventions de code

### Rust (backend)

- Formatter : `cargo fmt` avant chaque commit (vérifié par CI)
- Linter : `cargo clippy` — zéro warning toléré en PR
- Nommage : `snake_case` partout (variables, fonctions, modules)
- Handlers : un fichier par domaine dans `src/handlers/`
- Pas de `unwrap()` dans le code métier — utiliser `?` ou `match`
- Erreurs HTTP : retourner le bon status code (400/401/403/404/409)

### TypeScript / React (frontend)

- Formatter : Prettier (config dans `client/.eslintrc`)
- Nommage : `camelCase` fonctions, `PascalCase` composants, `kebab-case` fichiers
- Composants dans `src/components/`, pages dans `src/app/[locale]/`
- Traductions : toutes les strings UI dans `locales/fr.json` + `locales/en.json`
- Pas de string hardcodée en français dans les composants — toujours `t('clé')`
- Types explicites : pas de `any` sauf interop Electron (`window as any`)

### Général

- Pas de secrets dans le code (clés API, mots de passe, JWT secrets)
- Pas de `console.log` de debug laissé en PR
- Un composant / handler = une responsabilité
- Tester manuellement le golden path avant d'ouvrir une PR

---

## Tests

```bash
# Backend — intégration
# Le serveur doit tourner sur :3001 avec une BDD de test
cd server
cargo test -- --test-threads=1

# Coverage
cargo install cargo-tarpaulin
cargo tarpaulin --out Html
# Rapport généré dans tarpaulin-report.html

# Frontend
cd client
npm test
```

Les tests d'intégration (`tests/api_tests.rs`) testent les endpoints réels.
Ils nécessitent PostgreSQL + MongoDB actifs et le serveur lancé.
