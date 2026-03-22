// lib/api.ts - Client API connecté au backend Rust

import {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  Server,
  CreateServerRequest,
  UpdateServerRequest,
  JoinServerRequest,
  Channel,
  CreateChannelRequest,
  UpdateChannelRequest,
  Member,
  UpdateMemberRequest,
  Message,
  CreateMessageRequest,
} from './types';
import { getAuthToken, setAuthToken, setCurrentUser, logout } from './auth';
import { ApiException } from './errors';

// ============================================
// CONFIGURATION
// ============================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============================================
// HTTP CLIENT
// ============================================

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      if (response.status === 401) {
        logout();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        throw new ApiException({
          code: 'INVALID_TOKEN',
          message: 'Session expirée',
        });
      }

      try {
        const text = await response.text();
        throw new ApiException({
          code: `HTTP_${response.status}`,
          message: text || response.statusText || 'Erreur serveur',
        });
      } catch (e) {
        if (e instanceof ApiException) throw e;
        throw new ApiException({
          code: `HTTP_${response.status}`,
          message: response.statusText || 'Une erreur est survenue',
        });
      }
    }

    if (response.status === 204) {
      return {} as T;
    }

    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text);
  }

  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    return this.handleResponse<T>(response);
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
    return this.handleResponse<T>(response);
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
    return this.handleResponse<T>(response);
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return this.handleResponse<T>(response);
  }
}

const client = new ApiClient(API_BASE_URL);

// ============================================
// AUTH API
// ============================================

export const authApi = {
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await client.post<AuthResponse>('/auth/signup', data);
    setAuthToken(response.token);
    setCurrentUser(response.user);
    return response;
  },

  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await client.post<AuthResponse>('/auth/login', data);
    setAuthToken(response.token);
    setCurrentUser(response.user);
    return response;
  },

  async logout(): Promise<void> {
    try {
      await client.post('/auth/logout');
    } finally {
      logout();
    }
  },

  async getCurrentUser(): Promise<AuthResponse['user']> {
    return client.get('/me');
  },
};

// ============================================
// SERVERS API
// ============================================

export const serversApi = {
  async getServers(): Promise<Server[]> {
    return client.get('/servers');
  },

  async getServer(id: string): Promise<Server> {
    return client.get(`/servers/${id}`);
  },

  async createServer(data: CreateServerRequest): Promise<Server> {
    return client.post('/servers', data);
  },

  async updateServer(id: string, data: UpdateServerRequest): Promise<Server> {
    return client.put(`/servers/${id}`, data);
  },

  async deleteServer(id: string): Promise<void> {
    return client.delete(`/servers/${id}`);
  },

  async joinServer(id: string, data: JoinServerRequest): Promise<void> {
    return client.post(`/servers/${id}/join`, data);
  },

  async joinServerByCode(inviteCode: string): Promise<any> {
    return client.post('/servers/join-by-code', { invite_code: inviteCode });
  },

  async leaveServer(id: string): Promise<void> {
    return client.delete(`/servers/${id}/leave`);
  },

  async getMembers(serverId: string): Promise<Member[]> {
    return client.get(`/servers/${serverId}/members`);
  },

  async updateMember(serverId: string, userId: string, data: UpdateMemberRequest): Promise<Member> {
    return client.put(`/servers/${serverId}/members/${userId}`, data);
  },
};

// ============================================
// CHANNELS API
// ============================================

export const channelsApi = {
  async getChannels(serverId: string): Promise<Channel[]> {
    return client.get(`/servers/${serverId}/channels`);
  },

  async getChannel(id: string): Promise<Channel> {
    return client.get(`/channels/${id}`);
  },

  async createChannel(serverId: string, data: CreateChannelRequest): Promise<Channel> {
    return client.post(`/servers/${serverId}/channels`, data);
  },

  async updateChannel(id: string, data: UpdateChannelRequest): Promise<Channel> {
    return client.put(`/channels/${id}`, data);
  },

  async deleteChannel(id: string): Promise<void> {
    return client.delete(`/channels/${id}`);
  },
};

// ============================================
// MESSAGES API (HTTP fallback)
// ============================================

export const messagesApi = {
  async getMessages(
    channelId: string,
    params?: { limit?: number; before?: string }
  ): Promise<Message[]> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.before) qs.set('before', params.before);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return client.get(`/channels/${channelId}/messages${query}`);
  },

  async sendMessage(channelId: string, data: CreateMessageRequest): Promise<Message> {
    return client.post(`/channels/${channelId}/messages`, data);
  },

  async deleteMessage(id: string): Promise<void> {
    return client.delete(`/messages/${id}`);
  },
};

// ============================================
// EXPORT ALL
// ============================================

export const api = {
  auth: authApi,
  servers: serversApi,
  channels: channelsApi,
  messages: messagesApi,
};

export default api;
