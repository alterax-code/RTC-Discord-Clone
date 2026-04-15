# RTC Strikes Back

Application de Chat en Temps Réel — clone Discord.
Messagerie instantanée avec serveurs, channels, WebSocket, et app desktop.

## Équipe

| Membre | Rôle                  | Responsabilité                                  |
|--------|-----------------------|-------------------------------------------------|
| Zakary | Database & Auth       | PostgreSQL, Argon2, JWT, middleware             |
| Lucas  | API Core              | CRUD endpoints, permissions, tests, CI/CD       |
| Ladji  | WebSocket & Messages  | WS broadcast, MongoDB persistence               |
| Noémie | Frontend & Desktop    | Next.js, composants UI, Electron, i18n          |

## Stack technique

| Couche      | Technologie                                  |
|-------------|----------------------------------------------|
| Backend     | Rust 1.75+ · Axum 0.8 · Tokio                |
| Frontend    | Next.js 16 · React 19 · Tailwind CSS v4      |
| Desktop     | Electron 41                                  |
| BDD         | PostgreSQL 15 (users/servers/channels) · MongoDB 6 (messages) |
| Auth        | JWT (jsonwebtoken) · Argon2                  |
| Temps réel  | WebSocket natif Axum                         |
| i18n        | next-intl 4.8 (EN / FR)                      |
| GIFs        | Tenor v2 API                                 |

## Prérequis

- Rust ≥ 1.75 — https://rustup.rs
- Node.js ≥ 20
- PostgreSQL ≥ 15 (service local, port 5432)
- MongoDB ≥ 6 (service local, port 27017)
- Une clé API Tenor (gratuite) — https://developers.google.com/tenor

## Installation

### 1. Base de données

```bash
psql -U postgres -c "CREATE DATABASE rtc;"
# MongoDB : aucune config nécessaire, la DB est créée automatiquement
```

### 2. Backend

```bash
cd server
cp .env.example .env   # puis éditer .env
cargo run
# Serveur disponible sur http://localhost:3001
```

### 3. Frontend

```bash
cd client
npm install
npm run dev
# App disponible sur http://localhost:3000
```

### 4. Desktop (Electron)

```bash
# Prérequis : le frontend doit tourner sur :3000
cd client
npm run electron
# Pour builder l'installateur :
npm run electron:build
```

## Variables d'environnement

Créer `server/.env` depuis `server/.env.example` :

```env
DATABASE_URL=postgres://postgres:password@localhost/rtc
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB=rtc
JWT_SECRET=change_this_secret
SERVER_PORT=3001
TENOR_API_KEY=your_tenor_api_key
```

## Tests

```bash
# Backend — intégration (serveur doit tourner sur :3001)
cd server
cargo test -- --test-threads=1

# Coverage avec tarpaulin
cargo install cargo-tarpaulin
cargo tarpaulin --out Html

# Frontend
cd client
npm test
```

## Architecture

```
T-DEV-600-PAR_24/
├── server/                        # Backend Rust/Axum
│   ├── Cargo.toml
│   ├── migrations/
│   │   ├── 001_users.sql          # Schéma PostgreSQL initial
│   │   └── 002_v2.sql             # Ajouts v2 (ban, edit, etc.)
│   ├── src/
│   │   ├── main.rs                # Entry point + routes
│   │   ├── auth.rs                # JWT + Argon2
│   │   ├── db.rs                  # Pool PostgreSQL
│   │   ├── mongo.rs               # MongoDB messages
│   │   ├── middleware.rs          # Auth middleware
│   │   ├── models.rs              # Structs/types
│   │   ├── websocket.rs           # WebSocket broadcast
│   │   └── handlers/
│   │       ├── mod.rs
│   │       ├── servers.rs         # CRUD serveurs
│   │       ├── channels.rs        # CRUD channels
│   │       ├── messages.rs        # CRUD messages
│   │       ├── members.rs         # Kick/ban/rôles
│   │       ├── invitations.rs     # Codes d'invitation
│   │       ├── gifs.rs            # Proxy Tenor
│   │       └── health.rs          # GET /health
│   └── tests/
│       └── api_tests.rs           # Tests d'intégration (~27 tests)
│
├── client/                        # Frontend Next.js
│   ├── src/
│   │   ├── app/[locale]/          # App Router (EN/FR)
│   │   │   ├── login/             # Authentification
│   │   │   ├── servers/           # Liste des serveurs
│   │   │   └── chat/[id]/         # Page chat principale
│   │   ├── components/            # Composants React
│   │   ├── lib/                   # API, auth, WebSocket
│   │   └── locales/               # Traductions EN/FR
│   └── package.json
│
├── electron/                      # App desktop
│   ├── main.js                    # Process principal Electron
│   └── preload.js                 # Bridge IPC renderer
│
└── .github/workflows/
    └── ci.yml                     # CI (lint+build+test) + Release
```

## Endpoints API

### Authentification

| Méthode | Endpoint       | Auth | Description          |
|---------|----------------|------|----------------------|
| POST    | `/auth/signup` | Non  | Inscription          |
| POST    | `/auth/login`  | Non  | Connexion → JWT      |
| POST    | `/auth/logout` | Oui  | Déconnexion          |
| GET     | `/me`          | Oui  | Profil courant       |

### Serveurs

| Méthode | Endpoint                           | Description                  |
|---------|------------------------------------|------------------------------|
| POST    | `/servers`                         | Créer un serveur             |
| GET     | `/servers`                         | Mes serveurs                 |
| GET     | `/servers/:id`                     | Détails                      |
| PUT     | `/servers/:id`                     | Modifier                     |
| DELETE  | `/servers/:id`                     | Supprimer                    |
| POST    | `/servers/:id/join`                | Rejoindre                    |
| POST    | `/servers/join-by-code`            | Rejoindre par code invite    |
| DELETE  | `/servers/:id/leave`               | Quitter                      |
| POST    | `/servers/:id/invitations`         | Générer un code d'invitation |

### Membres

| Méthode | Endpoint                                  | Description         |
|---------|-------------------------------------------|---------------------|
| GET     | `/servers/:id/members`                    | Lister les membres  |
| PUT     | `/servers/:id/members/:userId`            | Changer le rôle     |
| DELETE  | `/servers/:id/members/:userId/kick`       | Kick                |
| POST    | `/servers/:id/members/:userId/ban`        | Ban                 |
| GET     | `/servers/:id/bans`                       | Liste des bans      |
| DELETE  | `/servers/:id/bans/:userId`               | Unban               |

### Channels

| Méthode | Endpoint                    | Description         |
|---------|-----------------------------|---------------------|
| POST    | `/servers/:id/channels`     | Créer un channel    |
| GET     | `/servers/:id/channels`     | Lister              |
| GET     | `/channels/:id`             | Détails             |
| PUT     | `/channels/:id`             | Renommer            |
| DELETE  | `/channels/:id`             | Supprimer           |

### Messages

| Méthode | Endpoint                    | Description            |
|---------|-----------------------------|------------------------|
| POST    | `/channels/:id/messages`    | Envoyer un message     |
| GET     | `/channels/:id/messages`    | Historique (paginé 50) |
| DELETE  | `/messages/:id`             | Supprimer              |
| PUT     | `/messages/:id`             | Modifier               |

### GIFs

| Méthode | Endpoint              | Auth | Description          |
|---------|-----------------------|------|----------------------|
| GET     | `/gif/search?q=...`   | Non  | Recherche Tenor v2   |

### WebSocket

```
WS /ws?token=<JWT>
```

Voir [WEBSOCKET.md](./WEBSOCKET.md) pour la spec complète des événements.

## Rôles et permissions

| Action                   | Member | Admin | Owner |
|--------------------------|:------:|:-----:|:-----:|
| Écrire / lire messages   | ✅     | ✅    | ✅    |
| Supprimer son message    | ✅     | ✅    | ✅    |
| Modifier son message     | ✅     | ✅    | ✅    |
| Créer un channel         | ❌     | ✅    | ✅    |
| Supprimer msg d'un autre | ❌     | ✅    | ✅    |
| Créer une invitation     | ❌     | ✅    | ✅    |
| Kick un membre           | ❌     | ✅    | ✅    |
| Ban un membre            | ❌     | ✅    | ✅    |
| Gérer les rôles          | ❌     | ❌    | ✅    |
| Transférer la propriété  | ❌     | ❌    | ✅    |
| Quitter le serveur       | ✅     | ✅    | ❌    |

## Lancement rapide

```bash
# Terminal 1 — Backend
cd server && cargo run

# Terminal 2 — Frontend
cd client && npm run dev

# Terminal 3 (optionnel) — Desktop
cd client && npm run electron
```
