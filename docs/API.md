# API Documentation

## Authentication
- \POST /auth/signup\ - Créer un compte
- \POST /auth/login\ - Se connecter
- \GET /me\ - Infos utilisateur courant

## Servers
- \GET /servers\ - Liste des serveurs
- \POST /servers\ - Créer un serveur
- \GET /servers/:id\ - Détails serveur
- \PUT /servers/:id\ - Modifier serveur
- \DELETE /servers/:id\ - Supprimer serveur
- \POST /servers/:id/join\ - Rejoindre
- \DELETE /servers/:id/leave\ - Quitter
- \GET /servers/:id/members\ - Liste membres

## Channels
- \GET /servers/:id/channels\ - Liste channels
- \POST /servers/:id/channels\ - Créer channel
- \PUT /channels/:id\ - Modifier channel
- \DELETE /channels/:id\ - Supprimer channel

## Messages
- \GET /channels/:id/messages\ - Historique
- \POST /channels/:id/messages\ - Envoyer
- \DELETE /messages/:id\ - Supprimer
