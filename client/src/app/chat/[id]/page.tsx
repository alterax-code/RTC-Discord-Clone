'use client';

import React, { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ServersBar from '@/components/ServersBar';
import ChannelsList from '@/components/ChannelsList';
import MembersList from '@/components/MembersList';
import MessageList from '@/components/MessageList';
import ChatInput from '@/components/ChatInput';
import { serversApi, channelsApi, messagesApi } from '@/lib/api';
import { isAuthenticated, getCurrentUser } from '@/lib/auth';
import wsClient from '@/lib/websocket';
import { Channel, WSEvent, MemberRole } from '@/lib/types';


// ---- Types ----

interface DisplayMessage {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: string;
  messageType?: string;
  editedAt?: string;
}

interface DisplayMember {
  id: string;
  username: string;
  role: "owner" | "admin" | "member";
  online: boolean;
}

// ---- Helpers ----

function extractId(raw: any): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    if (raw.$oid) return raw.$oid;
    if (raw.toString && raw.toString() !== "[object Object]")
      return raw.toString();
  }
  return "";
}

function formatTime(dateStr: any): string {
  try {
    if (!dateStr) return "";
    if (typeof dateStr === "object" && dateStr.$date) {
      const d = dateStr.$date;
      if (typeof d === "object" && d.$numberLong)
        return new Date(parseInt(d.$numberLong)).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        });
      return new Date(d).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? ""
      : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// ---- Page ----

export default function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: serverId } = use(params);
  const router = useRouter();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [members, setMembers] = useState<DisplayMember[]>([]);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [serverName, setServerName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const oldestMessageIdRef = useRef<string | null>(null);
  const [sendError, setSendError] = useState("");
  const [showOwnerLeaveModal, setShowOwnerLeaveModal] = useState(false);
  const pendingChannelSelectRef = useRef<string | null>(null); // ID du channel à auto-sélectionner après création
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(
    new Map(),
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const currentUser = getCurrentUser();
  const messageIdsRef = useRef<Set<string>>(new Set());

  // ★ Ref pour éviter la stale closure dans le handler WS
  const selectedChannelRef = useRef("");
  useEffect(() => {
    selectedChannelRef.current = selectedChannel;
  }, [selectedChannel]);

  // Timers typing par user (cleanup auto)
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  useEffect(() => {
    return () => {
      typingTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  // ---- Load server data ----
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    const loadData = async () => {
      setLoading(true);

      // ★ FIX: Vérifier l'accès au serveur avec un fetch brut
      // PAS via serversApi.getServer() qui throw une ApiException
      // que Next.js dev mode intercepte avant le catch
      const token = getAuthToken();
      try {
        const checkRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/servers/${serverId}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (!checkRes.ok) {
          // 403 = pas membre, 404 = serveur inexistant, 401 = pas connecté
          window.location.href = "/servers";
          return;
        }
        var server = await checkRes.json();
      } catch {
        // Erreur réseau → redirect aussi
        window.location.href = "/servers";
        return;
      }

      try {
        const [chans, mems] = await Promise.all([
          channelsApi.getChannels(serverId),
          serversApi.getMembers(serverId),
        ]);

        setServerName(server.name);
        setInviteCode(server.invite_code || "");
        setChannels(chans);
        setMembers(
          mems.map((m: any) => ({
            id: m.user_id,
            username: m.username,
            role: m.role,
            online: false,
          })),
        );

        if (chans.length > 0) {
          setSelectedChannel(chans[0].id);
        }
      } catch (e: any) {
        console.error("Erreur chargement données:", e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [serverId]);

  // ---- Load messages when channel changes ----
  useEffect(() => {
    if (!selectedChannel) return;

    const loadMessages = async () => {
      try {
        // ── 8. Pagination : charger les 50 derniers messages ──
        const msgs = await messagesApi.getMessages(selectedChannel, {
          limit: 50,
        });
        const ids = new Set<string>();
        const displayMsgs: DisplayMessage[] = (msgs || []).map(
          (m: any, i: number) => {
            const id =
              extractId(m._id) || extractId(m.id) || `msg-${i}-${Date.now()}`;
            ids.add(id);
            return {
              id,
              userId: m.user_id || "",
              username: m.username || "Inconnu",
              content: m.content || "",
              timestamp: formatTime(m.created_at),
              messageType: m.message_type || "user",
            };
          },
        );
        messageIdsRef.current = ids;
        setMessages(displayMsgs);
        setHasMoreMessages(msgs.length === 50);
        // Stocker l'ID du plus ancien pour le scroll infini
        oldestMessageIdRef.current =
          displayMsgs.length > 0 ? displayMsgs[0].id : null;
      } catch (e: any) {
        console.error("Erreur chargement messages:", e);
        setMessages([]);
      }
    };

    loadMessages();
  }, [selectedChannel]);

  // ── 4. Titre de l'onglet ──
  useEffect(() => {
    const channelName = channels.find((c) => c.id === selectedChannel)?.name;
    if (channelName && serverName) {
      document.title = `#${channelName} — ${serverName}`;
    } else if (serverName) {
      document.title = serverName;
    } else {
      document.title = "RTC Project";
    }
    return () => {
      document.title = "RTC Project";
    };
  }, [selectedChannel, channels, serverName]);

  // ---- ★ WebSocket — DEPS VIDES = handler stable ----
  // On utilise selectedChannelRef au lieu de selectedChannel
  // pour que le handler ne soit jamais recréé/détruit
  // → les événements online/offline ne sont JAMAIS perdus
  useEffect(() => {
    wsClient.connect();

    const handler = (event: WSEvent) => {
      switch (event.type) {
        case "new_message": {
          const msg = event.data;
          // ★ Utilise le ref, pas la variable (stale closure fix)
          if (msg.channel_id !== selectedChannelRef.current) return;
          const msgId =
            extractId((msg as any).id) ||
            extractId((msg as any)._id) ||
            `ws-${Date.now()}`;
          if (messageIdsRef.current.has(msgId)) return;
          messageIdsRef.current.add(msgId);
          
          setMessages(prev => [...prev, {
            id: msgId,
            userId: msg.user_id || '',
            username: msg.username || 'Inconnu',
            content: msg.content || '',
            timestamp: formatTime(msg.created_at || new Date().toISOString()),
            messageType: (msg as any).message_type || 'user',
          }]);

          // Retirer typing quand message envoyé
          if (msg.user_id) {
            const timer = typingTimersRef.current.get(msg.user_id);
            if (timer) {
              clearTimeout(timer);
              typingTimersRef.current.delete(msg.user_id);
            }
            setTypingUsers((prev) => {
              if (!prev.has(msg.user_id)) return prev;
              const n = new Map(prev);
              n.delete(msg.user_id);
              return n;
            });
          }
          break;
        }

        // ★ Online status — pas de filtre par channel, c'est global
        case "online_users":
          setOnlineUserIds(
            new Set<string>((event.data || []).map((u: any) => u.user_id)),
          );
          break;

        case "user_online":
          if (event.data?.user_id)
            setOnlineUserIds((prev) => new Set([...prev, event.data.user_id]));
          break;

        case "user_offline":
          if (event.data?.user_id)
            setOnlineUserIds((prev) => {
              const s = new Set(prev);
              s.delete(event.data.user_id);
              return s;
            });
          break;

        // ★ Nouveau membre qui rejoint le serveur — mise à jour temps réel
        case "member_joined": {
          const { server_id, user_id, username, role } = event.data || {};
          if (server_id !== serverId) break;
          setMembers((prev) => {
            if (prev.find((m) => m.id === user_id)) return prev;
            return [...prev, { id: user_id, username, role: role as 'owner' | 'admin' | 'member', online: true }];
          });
          setOnlineUserIds((prev) => new Set([...prev, user_id]));
          break;
        }

        // ★ Membre qui quitte le serveur — mise à jour temps réel
        case "member_left": {
          const { server_id, user_id } = event.data || {};
          if (server_id !== serverId) break;
          setMembers((prev) => prev.filter((m) => m.id !== user_id));
          setOnlineUserIds((prev) => {
            const s = new Set(prev);
            s.delete(user_id);
            return s;
          });
          break;
        }

        // ★ Nouveau channel créé — mise à jour temps réel pour tous les membres
        case "channel_created": {
          const { server_id, channel } = event.data || {};
          if (server_id !== serverId) break;
          setChannels((prev) => {
            if (prev.find((c) => c.id === channel.id)) return prev;
            return [...prev, channel as Channel];
          });
          // ★ Si c'est un channel qu'on vient de créer, l'auto-sélectionner
          if (pendingChannelSelectRef.current === channel.id) {
            setSelectedChannel(channel.id);
            pendingChannelSelectRef.current = null;
          }
          break;
        }

        // ★ Channel supprimé — retirer de la liste + reset si c'était le channel actif
        case "channel_deleted": {
          const { server_id, channel_id } = event.data || {};
          if (server_id !== serverId) break;
          setChannels((prev) => {
            const updated = prev.filter((c) => c.id !== channel_id);
            // Si le channel supprimé était celui affiché, basculer sur le premier dispo
            if (selectedChannelRef.current === channel_id) {
              const next = updated[0];
              if (next) {
                setSelectedChannel(next.id);
              } else {
                setSelectedChannel("");
                setMessages([]);
              }
            }
            return updated;
          });
          break;
        }

        // ★ Changement de rôle — mise à jour temps réel pour tous
        case "member_role_updated": {
          const { server_id, changes } = event.data || {};
          if (server_id !== serverId) break;
          if (!Array.isArray(changes)) break;
          setMembers((prev) =>
            prev.map((m) => {
              const change = changes.find((c: any) => c.user_id === m.id);
              if (change) return { ...m, role: change.new_role as any };
              return m;
            }),
          );
          break;
        }

        // ★ Typing — expire après 5s, timer par user
        case "user_typing": {
          const { user_id, username, channel_id } = event.data || {};
          if (channel_id !== selectedChannelRef.current) break;
          if (user_id === currentUser?.id) break;

          setTypingUsers((prev) => new Map(prev).set(user_id, username));

          // Reset timer 5s pour ce user
          const oldTimer = typingTimersRef.current.get(user_id);
          if (oldTimer) clearTimeout(oldTimer);
          const newTimer = setTimeout(() => {
            typingTimersRef.current.delete(user_id);
            setTypingUsers((prev) => {
              if (!prev.has(user_id)) return prev;
              const n = new Map(prev);
              n.delete(user_id);
              return n;
            });
          }, 5000);
          typingTimersRef.current.set(user_id, newTimer);
          break;
        }

        // ★ Serveur supprimé → redirect instantané pour tous les membres
        case "server_deleted": {
          if ((event as any).data?.server_id === serverId) {
            window.location.href = "/servers";
          }
          break;
        }

        // ★ Message supprimé par un admin → retirer de l'affichage
        case "message_deleted": {
          const md = (event as any).data || {};
          if (md.channel_id === selectedChannelRef.current && md.message_id) {
            setMessages((prev) => prev.filter((m) => m.id !== md.message_id));
            messageIdsRef.current.delete(md.message_id);
          }
          break;
        }
      }
    };

    // ★ wsClient.onEvent rejoue le cache online_users automatiquement
    const unsub = wsClient.onEvent(handler);
    return () => {
      unsub();
    };
  }, []); // ← DEPS VIDES : le handler vit toute la durée de la page

  // ---- Actions ----

  // ── 8. Charger plus de messages (scroll vers le haut) ──
  const handleLoadMore = useCallback(async () => {
    if (loadingMoreMessages || !hasMoreMessages || !selectedChannel) return;
    setLoadingMoreMessages(true);
    try {
      const oldest = oldestMessageIdRef.current;
      const msgs = await messagesApi.getMessages(selectedChannel, {
        limit: 50,
        before: oldest || undefined,
      });
      if (!msgs || msgs.length === 0) {
        setHasMoreMessages(false);
        return;
      }
      const newMsgs: DisplayMessage[] = msgs.map((m: any, i: number) => {
        const id =
          extractId(m._id) || extractId(m.id) || `more-${i}-${Date.now()}`;
        messageIdsRef.current.add(id);
        return {
          id,
          userId: m.user_id || "",
          username: m.username || "Inconnu",
          content: m.content || "",
          timestamp: formatTime(m.created_at),
          messageType: m.message_type || "user",
        };
      });
      setMessages((prev) => [...newMsgs, ...prev]);
      setHasMoreMessages(msgs.length === 50);
      oldestMessageIdRef.current = newMsgs[0]?.id || null;
    } catch (e) {
      console.error("Erreur chargement ancien messages:", e);
    } finally {
      setLoadingMoreMessages(false);
    }
  }, [selectedChannel, loadingMoreMessages, hasMoreMessages]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!selectedChannel) return;
      // ── 5. Bloquer les messages vides ou espaces seuls ──
      if (!content.trim()) return;
      try {
        // HTTP POST (pas WS) pour éviter le triple envoi
        await messagesApi.sendMessage(selectedChannel, {
          content: content.trim(),
        });
      } catch (e: any) {
        // ── 3. Feedback visuel si envoi échoue ──
        setSendError(
          "Impossible d'envoyer le message. Vérifiez votre connexion.",
        );
        setTimeout(() => setSendError(""), 4000);
      }
    },
    [selectedChannel],
  );

  const handleCreateChannel = useCallback(
    async (name: string) => {
      try {
        const newChannel = await channelsApi.createChannel(serverId, { name });
        pendingChannelSelectRef.current = newChannel.id;
        // ★ Fallback local — si le WS est lent ou déconnecté
        setChannels((prev) => {
          if (prev.find((c) => c.id === newChannel.id)) return prev;
          return [...prev, newChannel];
        });
        setSelectedChannel(newChannel.id);
      } catch (e: any) {
        console.error("Erreur creation channel:", e);
        alert("Erreur: " + (e?.message || "Impossible de créer le channel"));
      }
    },
    [serverId],
  );
  const handleDeleteChannel = useCallback(
    async (channelId: string) => {
      try {
        await channelsApi.deleteChannel(channelId);
        setChannels((prev) => {
          const remaining = prev.filter((c) => c.id !== channelId);
          if (selectedChannel === channelId && remaining.length > 0) {
            setSelectedChannel(remaining[0].id);
          } else if (remaining.length === 0) {
            setSelectedChannel("");
          }
          return remaining;
        });
      } catch (e: any) {
        alert(
          "Erreur: " + (e?.message || "Impossible de supprimer le channel"),
        );
      }
    },
    [selectedChannel],
  );

  const handleRenameChannel = useCallback(
    async (channelId: string, newName: string) => {
      try {
        await channelsApi.updateChannel(channelId, { name: newName });
        setChannels((prev) =>
          prev.map((c) => (c.id === channelId ? { ...c, name: newName } : c)),
        );
      } catch (e: any) {
        alert("Erreur: " + (e?.message || "Impossible de renommer le channel"));
      }
    },
    [],
  );

  const handleDeleteServer = useCallback(async () => {
    if (!confirm("Supprimer ce serveur ? Cette action est irréversible."))
      return;
    try {
      await serversApi.deleteServer(serverId);
      window.location.href = "/servers";
    } catch (e: any) {
      if (e?.code === "HTTP_404") {
        window.location.href = "/servers";
      } else if (e?.code === "HTTP_403") {
        alert("Vous n'avez pas la permission de supprimer ce serveur.");
      } else {
        alert("Erreur: " + (e?.message || "Impossible de supprimer"));
      }
    }
  }, [serverId]);

  const handleLeaveServer = useCallback(async () => {
    // ★ Bloquer l'owner côté frontend avant même l'appel API
    if (
      currentUser &&
      members.find((m) => m.id === currentUser.id && m.role === "owner")
    ) {
      setShowOwnerLeaveModal(true);
      return;
    }
    if (!confirm("Quitter ce serveur ?")) return;
    try {
      await serversApi.leaveServer(serverId);
      router.push("/servers");
    } catch (e: any) {
      // 403 = owner côté backend (double sécurité)
      if (e?.status === 403) {
        setShowOwnerLeaveModal(true);
      } else {
        alert("Erreur: " + (e?.message || "Impossible de quitter"));
      }
    }
  }, [serverId, router, currentUser, members]);

  const handleUpdateRole = useCallback(
    async (userId: string, newRole: string) => {
      await serversApi.updateMember(serverId, userId, { role: newRole as MemberRole });
      // Mettre à jour localement
      setMembers((prev) =>
        prev.map((m) => {
          if (newRole === "owner") {
            // Transfert : l'ancien owner devient admin
            if (m.id === currentUser?.id)
              return { ...m, role: "admin" as const };
            if (m.id === userId) return { ...m, role: "owner" as const };
          } else {
            if (m.id === userId) return { ...m, role: newRole as any };
          }
          return m;
        }),
      );
    },
    [serverId, currentUser],
  );

  const handleCopyInvite = useCallback(() => {
    navigator.clipboard
      .writeText(inviteCode)
      .then(() => {
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 2000);
      })
      .catch(() => {});
  }, [inviteCode]);

  // ---- Derived state ----
  const displayMembers = members.map((m) => ({
    ...m,
    online: onlineUserIds.has(m.id),
  }));
  const channelName =
    channels.find((c) => c.id === selectedChannel)?.name || "";
  const myRole = members.find((m) => m.id === currentUser?.id)?.role;
  const canManage = myRole === "owner" || myRole === "admin";
  const typingUserIds = new Set(typingUsers.keys());
  const typingNames = Array.from(typingUsers.values());

  if (loading) {
    return (
      <div className="chat-layout">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gridColumn: "1 / -1",
            color: "#999",
          }}
        >
          Chargement...
        </div>
      </div>
    );
  }

  return (
    <React.Fragment>
      {/* Overlay mobile — EN DEHORS du chat-layout */}
      {showMobileSidebar && (
        <div
          className="mobile-sidebar-overlay"
          onClick={() => setShowMobileSidebar(false)}
          style={{
            position: "fixed",
            inset: 0,
            left: "70px",
            background: "rgba(0,0,0,0.55)",
            zIndex: 199,
            display: "block",
            cursor: "pointer",
          }}
        ></div>
      )}
      <div className="chat-layout">
        <ServersBar currentServerId={serverId} />

        {/* ★ ChannelsList avec userRole + onDeleteChannel */}
        <ChannelsList
          channels={channels.map((c) => ({
            id: c.id,
            name: c.name,
            serverId: c.server_id,
          }))}
          selectedChannelId={selectedChannel}
          onChannelSelect={(id) => {
            setSelectedChannel(id);
            setShowMobileSidebar(false);
          }}
          serverName={serverName}
          onCreateChannel={handleCreateChannel}
          onDeleteChannel={handleDeleteChannel}
          onRenameChannel={handleRenameChannel}
          userRole={myRole}
          defaultChannelId={channels[0]?.id}
          className={showMobileSidebar ? "mobile-open" : ""}
          onClose={() => setShowMobileSidebar(false)}
        />

        <div className="chat-zone">
          {/* ===== HEADER avec inviter + settings ===== */}
          <div className="chat-header">
            <div className="chat-header-left">
              {/* Bouton hamburger — visible uniquement sur mobile */}
              <button
                className="mobile-menu-btn"
                onClick={() => setShowMobileSidebar((prev) => !prev)}
                aria-label="Ouvrir les channels"
              >
                ☰
              </button>
              <span className="channel-hash">#</span>
              <h1 className="channel-title">{channelName}</h1>
            </div>
            <div
              className="chat-header-right"
              style={{
                position: "relative",
                display: "flex",
                gap: "8px",
                alignItems: "center",
              }}
            >
              {/* Bouton Inviter */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInviteModal(true);
                  setShowSettings(false);
                }}
                style={{
                  cursor: "pointer",
                  fontSize: "13px",
                  background: "#248046",
                  color: "#fff",
                  border: "none",
                  padding: "4px 12px",
                  borderRadius: "4px",
                  fontWeight: 600,
                }}
              >
                👤+ Inviter
              </button>

              {/* Bouton Settings */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSettings(!showSettings);
                  setShowInviteModal(false);
                }}
                className="header-icon-btn"
                title="Paramètres"
                style={{
                  cursor: "pointer",
                  fontSize: "18px",
                  background: "none",
                  border: "none",
                  padding: "4px 8px",
                }}
              >
                ⚙️
              </button>

              {/* Dropdown settings */}
              {showSettings && (
                <React.Fragment>
                  <div
                    onClick={() => setShowSettings(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 99 }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "110%",
                      right: 0,
                      background: "#111214",
                      border: "1px solid #3f4147",
                      borderRadius: "8px",
                      padding: "6px 0",
                      minWidth: "220px",
                      zIndex: 100,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                    }}
                  >
                    {(myRole === "owner" || myRole === "admin") && (
                      <button
                        onClick={() => {
                          setShowSettings(false);
                          handleDeleteServer();
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px 16px",
                          background: "none",
                          border: "none",
                          color: "#ed4245",
                          textAlign: "left",
                          cursor: "pointer",
                          fontSize: "14px",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#2b2d31")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "none")
                        }
                      >
                        🗑️ Supprimer le serveur
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowSettings(false);
                        handleLeaveServer();
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "10px 16px",
                        background: "none",
                        border: "none",
                        color: "#ed4245",
                        textAlign: "left",
                        cursor: "pointer",
                        fontSize: "14px",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#2b2d31")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "none")
                      }
                    >
                      🚪 Quitter le serveur
                    </button>
                  </div>
                </React.Fragment>
              )}

              {/* Modal invitation */}
              {showInviteModal && (
                <React.Fragment>
                  <div
                    onClick={() => setShowInviteModal(false)}
                    style={{
                      position: "fixed",
                      inset: 0,
                      zIndex: 99,
                      background: "rgba(0,0,0,0.5)",
                    }}
                  />
                  <div
                    style={{
                      position: "fixed",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%,-50%)",
                      background: "#2b2d31",
                      borderRadius: "12px",
                      padding: "24px",
                      minWidth: "400px",
                      zIndex: 100,
                      boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "16px",
                      }}
                    >
                      <h3
                        style={{ color: "#fff", margin: 0, fontSize: "18px" }}
                      >
                        Inviter des amis sur {serverName}
                      </h3>
                      <button
                        onClick={() => setShowInviteModal(false)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#b5bac1",
                          cursor: "pointer",
                          fontSize: "20px",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#b5bac1",
                        marginBottom: "8px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                      }}
                    >
                      Code d&apos;invitation
                    </div>
                    {inviteCode ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          background: "#1e1f22",
                          borderRadius: "6px",
                          padding: "8px 12px",
                        }}
                      >
                        <code
                          style={{
                            flex: 1,
                            color: "#00b0f4",
                            fontSize: "16px",
                            fontWeight: 600,
                            letterSpacing: "1px",
                            userSelect: "all",
                          }}
                        >
                          {inviteCode}
                        </code>
                        <button
                          onClick={handleCopyInvite}
                          style={{
                            background: inviteCopied ? "#248046" : "#5865f2",
                            color: "#fff",
                            border: "none",
                            borderRadius: "4px",
                            padding: "8px 16px",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 600,
                            minWidth: "80px",
                          }}
                        >
                          {inviteCopied ? "✓ Copié !" : "Copier"}
                        </button>
                      </div>
                    ) : (
                      <div style={{ color: "#888", fontStyle: "italic" }}>
                        Aucun code disponible
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#888",
                        marginTop: "12px",
                      }}
                    >
                      Partagez ce code pour inviter vos amis depuis la page
                      Serveurs.
                    </div>
                  </div>
                </React.Fragment>
              )}
            </div>
          </div>

          {/* ===== MESSAGES ===== */}
          {/* ── 2. Aucun channel ── */}
          {(!selectedChannel || channels.length === 0) && !loading && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "#4f545c",
                gap: "16px",
              }}
            >
              <div style={{ fontSize: "3rem" }}>{"📭"}</div>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#6d6f78",
                }}
              >
                Aucun channel disponible
              </div>
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "#4f545c",
                  textAlign: "center",
                  maxWidth: "260px",
                }}
              >
                {canManage
                  ? "Creez un channel avec le bouton + pour commencer a discuter."
                  : "Aucun channel n'a encore ete cree sur ce serveur."}
              </div>
            </div>
          )}

          {/* ── 8. Bouton charger plus de messages ── */}
          {hasMoreMessages && messages.length >= 50 && selectedChannel && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "8px 0",
              }}
            >
              <button
                onClick={handleLoadMore}
                disabled={loadingMoreMessages}
                style={{
                  background: "none",
                  border: "1px solid #3f4147",
                  color: "#8e9297",
                  borderRadius: "6px",
                  padding: "6px 16px",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#3f4147";
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                  e.currentTarget.style.color = "#8e9297";
                }}
              >
                {loadingMoreMessages
                  ? "Chargement..."
                  : "↑ Charger les messages précédents"}
              </button>
            </div>
          )}

          {/* ── 3. Erreur envoi ── */}
          {sendError && (
            <div
              style={{
                margin: "0 16px 8px",
                padding: "8px 12px",
                background: "#2b0a0a",
                border: "1px solid #8b1a1a",
                borderRadius: "6px",
                color: "#ff4444",
                fontSize: "0.85rem",
              }}
            >
              ⚠️ {sendError}
            </div>
          )}

          {selectedChannel && (
            <MessageList
              messages={messages}
              currentUserId={currentUser?.id}
              userRole={myRole}
              onDeleteMessage={async (msgId) => {
                try {
                  await messagesApi.deleteMessage(msgId);
                  setMessages((prev) => prev.filter((m) => m.id !== msgId));
                } catch {
                  alert("Erreur lors de la suppression");
                }
              }}
            />
          )}

          {/* ===== TYPING INDICATOR ===== */}
          <div style={{ minHeight: "24px", padding: "2px 16px" }}>
            {typingNames.length > 0 && (
              <div
                style={{
                  fontSize: "12px",
                  color: "#b5bac1",
                  fontStyle: "italic",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    gap: "2px",
                    alignItems: "center",
                  }}
                >
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      style={{
                        width: "5px",
                        height: "5px",
                        borderRadius: "50%",
                        backgroundColor: "#5865f2",
                        display: "inline-block",
                        animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </span>
                <span>
                  <strong style={{ color: "#fff", fontStyle: "normal" }}>
                    {typingNames.join(", ")}
                  </strong>
                  {typingNames.length === 1
                    ? " est en train d'écrire..."
                    : " sont en train d'écrire..."}
                </span>
                <style>{`@keyframes typingBounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }`}</style>
              </div>
            )}
          </div>

          {/* ===== INPUT ===== */}
          {selectedChannel && (
            <ChatInput
              onSendMessage={handleSendMessage}
              onTyping={() => wsClient.sendTyping(selectedChannel)}
            />
          )}
        </div>

        {/* ★ MembersList avec typing indicators */}
        <MembersList
          members={displayMembers}
          typingUserIds={typingUserIds}
          currentUserId={currentUser?.id}
          currentUserRole={myRole}
          serverId={serverId}
          onUpdateRole={handleUpdateRole}
        />
      </div>

      {/* ★ Modale : owner ne peut pas quitter sans transférer */}
      {showOwnerLeaveModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
          onClick={() => setShowOwnerLeaveModal(false)}
        >
          <div
            style={{
              background: "#2b2d31",
              borderRadius: "12px",
              padding: "32px",
              maxWidth: "420px",
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              border: "1px solid #3f4147",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: "2rem",
                marginBottom: "12px",
                textAlign: "center",
              }}
            >
              👑
            </div>
            <h3
              style={{
                color: "#fff",
                margin: "0 0 12px",
                textAlign: "center",
                fontSize: "1.1rem",
              }}
            >
              Impossible de quitter ce serveur
            </h3>
            <p
              style={{
                color: "#b5bac1",
                fontSize: "0.9rem",
                lineHeight: "1.5",
                textAlign: "center",
                margin: "0 0 24px",
              }}
            >
              Vous êtes{" "}
              <strong style={{ color: "#f0b132" }}>propriétaire</strong> de ce
              serveur. Pour le quitter, vous devez d'abord{" "}
              <strong style={{ color: "#fff" }}>transférer la propriété</strong>{" "}
              à un autre membre via le menu ⋯ dans la liste des membres.
            </p>
            <button
              onClick={() => setShowOwnerLeaveModal(false)}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "6px",
                background: "#5865f2",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontSize: "0.95rem",
                fontWeight: 600,
              }}
            >
              Compris
            </button>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
