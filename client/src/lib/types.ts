// lib/types.ts - Types adaptés aux réponses backend (snake_case)

// ============================================
// AUTH TYPES
// ============================================

export interface User {
  id: string;
  username: string;
  email: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// ============================================
// SERVER TYPES
// ============================================

export interface Server {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  invite_code: string | null;
  created_at: string | null;
}

export interface CreateServerRequest {
  name: string;
  description?: string;
}

export interface UpdateServerRequest {
  name?: string;
  description?: string;
}

export interface JoinServerRequest {
  invite_code: string;
}

// ============================================
// CHANNEL TYPES
// ============================================

export interface Channel {
  id: string;
  name: string;
  server_id: string;
  created_at: string | null;
}

export interface CreateChannelRequest {
  name: string;
}

export interface UpdateChannelRequest {
  name?: string;
}

// ============================================
// MEMBER TYPES
// ============================================

export type MemberRole = 'owner' | 'admin' | 'member';

export interface Member {
  user_id: string;
  username: string;
  role: MemberRole;
  joined_at: string | null;
}

export interface UpdateMemberRequest {
  role: MemberRole;
}

// ============================================
// MESSAGE TYPES
// ============================================

export interface Message {
  _id?: string;
  id?: string;
  channel_id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
  deleted?: boolean;
}

export interface CreateMessageRequest {
  content: string;
}

// ============================================
// WEBSOCKET EVENT TYPES
// ============================================

export interface WSNewMessageEvent {
  type: 'new_message';
  data: {
    id: string;
    channel_id: string;
    user_id: string;
    username: string;
    content: string;
    created_at: string;
    message_type?: string;
  };
}

export interface WSUserOnlineEvent {
  type: 'user_online';
  data: {
    user_id: string;
    username: string;
  };
}

export interface WSUserOfflineEvent {
  type: 'user_offline';
  data: {
    user_id: string;
    username: string;
  };
}

export interface WSUserTypingEvent {
  type: 'user_typing';
  data: {
    user_id: string;
    username: string;
    channel_id: string;
  };
}

export interface WSOnlineUsersEvent {
  type: 'online_users';
  data: Array<{ user_id: string; username: string }>;
}

export interface WSMessageHistoryEvent {
  type: 'message_history';
  data: {
    channel_id: string;
    messages: Message[];
  };
}

export interface WSMemberJoinedEvent {
  type: 'member_joined';
  data: {
    server_id: string;
    user_id: string;
    username: string;
    role: string;
  };
}

export interface WSMemberKickedEvent {
  type: 'member_kicked';
  data: {
    server_id: string;
    user_id: string;
    reason: string;
  };
}

export interface WSMemberBannedEvent {
  type: 'member_banned';
  data: {
    server_id: string;
    user_id: string;
    reason: string;
    expires_at: string | null;

  };
}

export interface WSMemberJoinedEvent {
  type: 'member_joined';
  data: { server_id: string; user_id: string; username: string; role: string; };
}
export interface WSMemberLeftEvent {
  type: 'member_left';
  data: { server_id: string; user_id: string; };
}
export interface WSMemberKickedEvent {
  type: 'member_kicked';
  data: { server_id: string; user_id: string; reason: string; };
}
export interface WSMemberBannedEvent {
  type: 'member_banned';
  data: { server_id: string; user_id: string; reason: string; expires_at: string | null; };
}
export interface WSChannelCreatedEvent {
  type: 'channel_created';
  data: { server_id: string; channel: Channel; };
}
export interface WSChannelDeletedEvent {
  type: 'channel_deleted';
  data: { server_id: string; channel_id: string; };
}
export interface WSMemberRoleUpdatedEvent {
  type: 'member_role_updated';
  data: { server_id: string; user_id: string; role: string; changes?: Array<{ user_id: string; role: string; new_role: string }>; };

}

export type WSEvent =
  | WSNewMessageEvent
  | WSUserOnlineEvent
  | WSUserOfflineEvent
  | WSUserTypingEvent
  | WSOnlineUsersEvent
  | WSMessageHistoryEvent
  | WSMemberJoinedEvent
  | WSMemberLeftEvent
  | WSMemberKickedEvent
  | WSMemberBannedEvent
  | WSChannelCreatedEvent
  | WSChannelDeletedEvent
  | WSMemberRoleUpdatedEvent;


// ============================================
// API ERROR TYPES
// ============================================

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}
