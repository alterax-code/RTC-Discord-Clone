// lib/websocket.ts - Client WebSocket avec cache du statut en ligne

import { getAuthToken } from './auth';
import { WSEvent } from './types';

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000';

type EventHandler = (event: WSEvent) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Set<EventHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  // ★ Cache des utilisateurs en ligne
  // Quand on change de channel/page, le nouveau handler reçoit automatiquement
  // la dernière liste connue des users online
  private cachedOnlineUsers: any[] | null = null;

  connect(): void {
    const token = getAuthToken();
    if (!token) {
      console.warn('[WS] No auth token, skipping connect');
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    // Fermer proprement si connexion en cours
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(`${WS_BASE_URL}/ws?token=${token}`);

      this.ws.onopen = () => {
        console.log('[WS] Connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed: WSEvent = JSON.parse(event.data);

          // ★ Maintenir le cache à jour en permanence
          if (parsed.type === 'online_users') {
            this.cachedOnlineUsers = parsed.data || [];
          } else if (parsed.type === 'user_online' && parsed.data?.user_id) {
            if (this.cachedOnlineUsers) {
              if (!this.cachedOnlineUsers.find((u: any) => u.user_id === parsed.data.user_id)) {
                this.cachedOnlineUsers = [...this.cachedOnlineUsers, parsed.data];
              }
            }
          } else if (parsed.type === 'user_offline' && parsed.data?.user_id) {
            if (this.cachedOnlineUsers) {
              this.cachedOnlineUsers = this.cachedOnlineUsers.filter(
                (u: any) => u.user_id !== parsed.data.user_id
              );
            }
          }

          // Dispatch à tous les handlers
          this.handlers.forEach((handler) => handler(parsed));
        } catch (e) {
          console.error('[WS] Parse error:', e);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[WS] Disconnected', event.code);
        this.scheduleReconnect();
      };

      this.ws.onerror = (_event) => {
        // Le navigateur masque les détails d'erreur WS pour des raisons de sécurité
        // L'erreur réelle sera loggée dans onclose (code + reason)
        console.warn('[WS] Connexion échouée — vérifiez que le backend est démarré sur', WS_BASE_URL);
      };
    } catch (e) {
      console.error('[WS] Connection failed:', e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[WS] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = 0;
    this.cachedOnlineUsers = null;
  }

  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler);

    // ★ Rejouer le cache au nouveau handler
    // C'est ça qui résout le bug : quand le useEffect se ré-exécute
    // (changement de channel/page), le handler reçoit immédiatement
    // la liste des users en ligne sans attendre un nouvel event du serveur
    if (this.cachedOnlineUsers) {
      const cached = this.cachedOnlineUsers;
      setTimeout(() => {
        handler({ type: 'online_users', data: cached } as WSEvent);
      }, 0);
    }

    return () => this.handlers.delete(handler);
  }

  sendMessage(channelId: string, content: string): void {
    this.send({ type: 'new_message', data: { channel_id: channelId, content } });
  }

  sendTyping(channelId: string): void {
    this.send({ type: 'typing', data: { channel_id: channelId } });
  }

  requestHistory(channelId: string): void {
    this.send({ type: 'get_history', data: { channel_id: channelId } });
  }

  private send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton
export const wsClient = new WebSocketClient();
export default wsClient;
