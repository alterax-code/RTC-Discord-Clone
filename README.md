# RTC - Real Time Chat

Application de Chat en Temps Réel — clone Discord.

## Stack technique

- **Backend** : Rust + Axum
- **Frontend** : Next.js + React + Tailwind CSS
- **Base de données** : PostgreSQL (users, servers, channels) + MongoDB (messages)
- **Temps réel** : WebSocket natif (Axum)

## Équipe

| Membre | Rôle | Responsabilité |
|--------|------|----------------|
| Zakary | Database & Auth | PostgreSQL, Argon2, JWT, middleware |
| Lucas  | API Core        | CRUD endpoints, permissions, tests  |
| Ladji  | WebSocket & Messages | WS broadcast, MongoDB persistence |
| Noémie | Frontend        | Next.js, composants UI              |

## Prérequis

- Rust (≥ 1.75)
- Node.js (≥ 18)
- PostgreSQL (≥ 15)
- MongoDB (≥ 6)

## Installation

### Backend

```bash
cd server
cp .env.example .env
# Éditer .env avec vos paramètres de connexion

# Créer la base de données PostgreSQL
psql -U postgres -c "CREATE DATABASE rtc;"

# Lancer le serveur (port 3001)
cargo run
```

Le serveur démarre sur **http://localhost:3001**.

### Frontend

```bash
cd client
npm install
npm run dev
```

Le client démarre sur **http://localhost:3000**.

## Variables d'environnement (server/.env)

```env
DATABASE_URL=postgres://postgres:password@localhost/rtc
MONGODB_URL=mongodb://localhost:27017
JWT_SECRET=your_secret_key
PORT=3001
```

## API Endpoints

### Authentification

| Méthode | Endpoint        | Description              |
|---------|-----------------|--------------------------|
| POST    | `/auth/signup`  | Inscription              |
| POST    | `/auth/login`   | Connexion                |
| POST    | `/auth/logout`  | Déconnexion              |
| GET     | `/me`           | Profil utilisateur       |

### Serveurs

| Méthode | Endpoint                        | Description           |
|---------|---------------------------------|-----------------------|
| POST    | `/servers`                      | Créer un serveur      |
| GET     | `/servers`                      | Lister mes serveurs   |
| GET     | `/servers/:id`                  | Détails d'un serveur  |
| PUT     | `/servers/:id`                  | Modifier un serveur   |
| DELETE  | `/servers/:id`                  | Supprimer un serveur  |
| POST    | `/servers/:id/join`             | Rejoindre (invite)    |
| DELETE  | `/servers/:id/leave`            | Quitter un serveur    |
| GET     | `/servers/:id/members`          | Lister les membres    |
| PUT     | `/servers/:id/members/:userId`  | Changer le rôle       |

### Channels

| Méthode | Endpoint                        | Description           |
|---------|---------------------------------|-----------------------|
| POST    | `/servers/:id/channels`         | Créer un channel      |
| GET     | `/servers/:id/channels`         | Lister les channels   |
| GET     | `/channels/:id`                 | Détails d'un channel  |
| PUT     | `/channels/:id`                 | Renommer un channel   |
| DELETE  | `/channels/:id`                 | Supprimer un channel  |

### Messages

| Méthode | Endpoint                      | Description           |
|---------|-------------------------------|-----------------------|
| POST    | `/channels/:id/messages`      | Envoyer un message    |
| GET     | `/channels/:id/messages`      | Historique (paginé 50)|
| DELETE  | `/messages/:id`               | Supprimer un message  |

### WebSocket

| Endpoint              | Description                 |
|-----------------------|-----------------------------|
| `WS /ws?token=JWT`    | Connexion temps réel        |

Voir [WEBSOCKET.md](./WEBSOCKET.md) pour la spécification complète des événements.

## Rôles et permissions

| Action                   | Member | Admin | Owner |
|--------------------------|:------:|:-----:|:-----:|
| Écrire un message        | ✅     | ✅    | ✅    |
| Supprimer son message    | ✅     | ✅    | ✅    |
| Voir les membres         | ✅     | ✅    | ✅    |
| Voir les connectés       | ✅     | ✅    | ✅    |
| Voir qui tape            | ✅     | ✅    | ✅    |
| Créer un channel         | ❌     | ✅    | ✅    |
| Renommer un channel      | ❌     | ✅    | ✅    |
| Supprimer un channel     | ❌     | ✅    | ✅    |
| Supprimer msg d'un autre | ❌     | ✅    | ✅    |
| Créer une invitation     | ❌     | ✅    | ✅    |
| Gérer les rôles          | ❌     | ❌    | ✅    |
| Transférer la propriété  | ❌     | ❌    | ✅    |
| Quitter le serveur       | ✅     | ✅    | ❌    |

## Tests

```bash
# Backend — intégration (serveur doit être lancé sur :3001)
cd server
cargo test -- --test-threads=1

# Frontend
cd client
npm test
```

## Architecture

```
server/
├── Cargo.toml
├── .env.example
├── migrations/
│   └── 001_users.sql          # Schéma PostgreSQL
├── src/
│   ├── main.rs                # Entry point + routes
│   ├── auth.rs                # JWT + Argon2
│   ├── db.rs                  # Pool PostgreSQL
│   ├── mongo.rs               # MongoDB messages
│   ├── handlers.rs            # CRUD handlers
│   ├── middleware.rs          # Auth middleware
│   ├── models.rs              # Structs/types
│   └── websocket.rs           # WebSocket handler
└── tests/
    └── api_tests.rs           # Tests d'intégration

client/
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── page.tsx           # Redirect auto
│   │   ├── login/             # Authentification
│   │   ├── servers/           # Liste des serveurs
│   │   └── chat/[id]/         # Page chat
│   ├── components/            # Composants React
│   ├── lib/                   # API, auth, WS utilities
│   └── styles/                # CSS global
└── package.json
```

## Lancement rapide (développement)

```bash
# Terminal 1 — Backend
cd server && cargo run

# Terminal 2 — Frontend
cd client && npm run dev

# Accéder à l'app
open http://localhost:3000
```
