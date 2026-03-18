CREATE TABLE IF NOT EXISTS server_bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    banned_by UUID NOT NULL REFERENCES users(id),
    reason TEXT DEFAULT '',
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(server_id, user_id)
);