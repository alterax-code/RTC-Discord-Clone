-- 002_v2.sql - Schema V2 RTC Strikes Back

-- Table des bans serveur (kick-ban)
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

-- Table des conversations privées (DM)
CREATE TABLE IF NOT EXISTS dm_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id UUID NOT NULL REFERENCES users(id),
    user2_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user1_id, user2_id)
);
