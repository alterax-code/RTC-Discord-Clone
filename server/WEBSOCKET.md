# WebSocket Specification — RTC

## Connection

```
WS /ws?token=<JWT>
```

The client connects to the WebSocket endpoint by passing a valid JWT token as query parameter.
The server verifies the token before upgrading the connection. If invalid, returns `401 Unauthorized`.

## Authentication

The JWT is the same token obtained from `POST /auth/login` or `POST /auth/signup`.
It contains the user ID (`sub`) and expiration time (`exp`).

## Events (Server → Client)

### `online_users`

Sent immediately after connection. Contains the full list of currently online users.

```json
{
  "type": "online_users",
  "data": [
    { "user_id": "uuid", "username": "alice" },
    { "user_id": "uuid", "username": "bob" }
  ]
}
```

### `user_online`

Broadcast when a user connects.

```json
{
  "type": "user_online",
  "data": {
    "user_id": "uuid",
    "username": "alice"
  }
}
```

### `user_offline`

Broadcast when a user disconnects.

```json
{
  "type": "user_offline",
  "data": {
    "user_id": "uuid",
    "username": "alice"
  }
}
```

### `new_message`

Broadcast when a message is sent (via WS or HTTP).

```json
{
  "type": "new_message",
  "data": {
    "id": "mongodb_object_id",
    "channel_id": "uuid",
    "user_id": "uuid",
    "username": "alice",
    "content": "Hello world!",
    "created_at": "2026-03-15T20:30:00Z"
  }
}
```

### `user_typing`

Broadcast when a user is typing in a channel. Throttled client-side (max 1 event per 3 seconds).

```json
{
  "type": "user_typing",
  "data": {
    "user_id": "uuid",
    "username": "alice",
    "channel_id": "uuid"
  }
}
```

### `message_history`

Response to a `get_history` request. Contains all messages for a channel.

```json
{
  "type": "message_history",
  "data": {
    "channel_id": "uuid",
    "messages": [
      {
        "_id": "mongodb_object_id",
        "channel_id": "uuid",
        "user_id": "uuid",
        "username": "alice",
        "content": "Hello!",
        "created_at": "2026-03-15T20:30:00Z",
        "deleted": false,
        "message_type": "user"
      }
    ]
  }
}
```

### `member_joined`

Broadcast when a user joins a server (via invite code).

```json
{
  "type": "member_joined",
  "data": {
    "server_id": "uuid",
    "user_id": "uuid",
    "username": "alice",
    "role": "member"
  }
}
```

### `member_left`

Broadcast when a user leaves a server.

```json
{
  "type": "member_left",
  "data": {
    "server_id": "uuid",
    "user_id": "uuid"
  }
}
```

### `member_role_updated`

Broadcast when a member's role is changed (promote, demote, or ownership transfer).

```json
{
  "type": "member_role_updated",
  "data": {
    "server_id": "uuid",
    "user_id": "uuid",
    "new_role": "admin",
    "updated_by": "uuid"
  }
}
```

### `channel_created`

Broadcast when a new channel is created in a server.

```json
{
  "type": "channel_created",
  "data": {
    "server_id": "uuid",
    "channel": {
      "id": "uuid",
      "name": "general",
      "server_id": "uuid",
      "created_at": "2026-03-15T20:30:00Z"
    }
  }
}
```

### `channel_deleted`

Broadcast when a channel is deleted.

```json
{
  "type": "channel_deleted",
  "data": {
    "server_id": "uuid",
    "channel_id": "uuid"
  }
}
```

## Events (Client → Server)

### `new_message`

Send a message to a channel.

```json
{
  "type": "new_message",
  "data": {
    "channel_id": "uuid",
    "content": "Hello world!"
  }
}
```

The server persists the message in MongoDB and broadcasts a `new_message` event to all connected users.

### `typing`

Notify that the user is typing.

```json
{
  "type": "typing",
  "data": {
    "channel_id": "uuid"
  }
}
```

### `get_history`

Request message history for a channel.

```json
{
  "type": "get_history",
  "data": {
    "channel_id": "uuid"
  }
}
```

The server responds with a `message_history` event.

## Architecture

The WebSocket system uses a **broadcast channel** (tokio broadcast, capacity 1024).
Every event goes through a single bus — each connected client receives all events and filters client-side by `server_id` or `channel_id`.

```
Client A ──┐
            ├──→ Broadcast Bus ──→ All connected clients
Client B ──┘
```

Online user tracking uses a shared `HashSet<OnlineUser>` protected by `RwLock`.

## Error Handling

- Invalid JWT → `401 Unauthorized` (connection refused before upgrade)
- Malformed JSON → silently ignored
- Broadcast lag → missed messages are skipped (receiver continues)
- Client disconnect → automatic cleanup (remove from online users, broadcast `user_offline`)

## Reconnection

The client implements exponential backoff reconnection:
- Initial delay: 1 second
- Max delay: 30 seconds
- Max attempts: 5
- Formula: `min(1000 * 2^attempt, 30000)` ms
