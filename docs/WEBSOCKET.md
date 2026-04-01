# WebSocket V2 - Documentation

## Connexion
```
ws://localhost:3001/ws?token=<JWT_TOKEN>
```

## Events émis par le serveur

### user_online
Quand un utilisateur se connecte.
```json
{ "type": "user_online", "data": { "user_id": "uuid", "username": "string" } }
```

### user_offline
Quand un utilisateur se déconnecte.
```json
{ "type": "user_offline", "data": { "user_id": "uuid", "username": "string" } }
```

### new_message
Quand un message est envoyé dans un channel.
```json
{ "type": "new_message", "data": { "id": "string", "channel_id": "string", "user_id": "string", "username": "string", "content": "string", "created_at": "string" } }
```

### member_kicked
Quand un membre est expulsé d'un serveur.
```json
{ "type": "member_kicked", "data": { "server_id": "uuid", "user_id": "uuid", "reason": "string" } }
```

### member_banned
Quand un membre est banni d'un serveur.
```json
{ "type": "member_banned", "data": { "server_id": "uuid", "user_id": "uuid", "reason": "string", "expires_at": "string|null" } }
```

### dm_message
Quand un message privé est envoyé.
```json
{ "type": "dm_message", "data": { "from_user_id": "uuid", "from_username": "string", "to_user_id": "uuid", "content": "string" } }
```

### reaction_added
Quand une réaction est ajoutée sur un message.
```json
{ "type": "reaction_added", "data": { "message_id": "string", "emoji": "string", "user_id": "uuid" } }
```

### reaction_removed
Quand une réaction est retirée d'un message.
```json
{ "type": "reaction_removed", "data": { "message_id": "string", "emoji": "string", "user_id": "uuid" } }
```

## Events envoyés par le client

### new_message
```json
{ "type": "new_message", "data": { "channel_id": "string", "content": "string" } }
```

### dm_message
```json
{ "type": "dm_message", "data": { "to_user_id": "uuid", "content": "string" } }
```

### kick_member
```json
{ "type": "kick_member", "data": { "server_id": "uuid", "user_id": "uuid", "reason": "string" } }
```﻿# WebSocket Documentation

## Connexion
\\\
WS /ws
\\\

## Events

### new_message
Envoyé quand un message est posté dans un channel.

### user_typing
Envoyé quand un utilisateur tape dans un channel.

### user_online
Envoyé quand un utilisateur se connecte/déconnecte.
