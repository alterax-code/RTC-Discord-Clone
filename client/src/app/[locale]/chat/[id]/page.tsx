'use client';

import React, { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import ServersBar from '@/components/ServersBar';
import ChannelsList from '@/components/ChannelsList';
import MembersList from '@/components/MembersList';
import MessageList from '@/components/MessageList';
import ChatInput from '@/components/ChatInput';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { serversApi, channelsApi, messagesApi } from '@/lib/api';
import { isAuthenticated, getCurrentUser, getAuthToken } from '@/lib/auth';
import wsClient from '@/lib/websocket';
import { Channel, MemberRole, WSEvent } from '@/lib/types';

interface Reaction {
  emoji: string;
  user_ids: string[];
}

interface DisplayMessage {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: string;
  reactions?: Reaction[];
  edited_at?: any;
}

interface DisplayMember {
  id: string;
  username: string;
  role: 'owner' | 'admin' | 'member';
  online: boolean;
}

function extractId(raw: any): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') {
    if (raw.$oid) return raw.$oid;
    if (raw.toString && raw.toString() !== '[object Object]') return raw.toString();
  }
  return '';
}

function formatTime(dateStr: any): string {
  try {
    if (!dateStr) return '';
    if (typeof dateStr === 'object' && dateStr.$date) {
      const d = dateStr.$date;
      if (typeof d === 'object' && d.$numberLong)
        return new Date(parseInt(d.$numberLong)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: serverId } = use(params);
  const router = useRouter();
  const { locale } = useParams();
  const t = useTranslations();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [members, setMembers] = useState<DisplayMember[]>([]);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [serverName, setServerName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const oldestMessageIdRef = useRef<string | null>(null);
  const [sendError, setSendError] = useState('');
  const [showOwnerLeaveModal, setShowOwnerLeaveModal] = useState(false);
  const pendingChannelSelectRef = useRef<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [showSettings, setShowSettings] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const currentUser = getCurrentUser();
  const token = getAuthToken() || '';
  const messageIdsRef = useRef<Set<string>>(new Set());
  const selectedChannelRef = useRef('');
  useEffect(() => { selectedChannelRef.current = selectedChannel; }, [selectedChannel]);

  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    return () => { typingTimersRef.current.forEach(t => clearTimeout(t)); };
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push(`/${locale}/login`);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      try {
        const [server, chans, mems] = await Promise.all([
          serversApi.getServer(serverId),
          channelsApi.getChannels(serverId),
          serversApi.getMembers(serverId),
        ]);
        setServerName(server.name);
        setInviteCode(server.invite_code || '');
        setChannels(chans);
        setMembers(mems.map((m: any) => ({
          id: m.user_id,
          username: m.username,
          role: m.role,
          online: false,
        })));
        if (chans.length > 0) setSelectedChannel(chans[0].id);
      } catch (e: any) {
        console.error('Erreur chargement:', e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [serverId]);

  useEffect(() => {
    if (!selectedChannel) return;
    const loadMessages = async () => {
      try {
        const msgs = await messagesApi.getMessages(selectedChannel, { limit: 50 });
        const ids = new Set<string>();
        const displayMsgs: DisplayMessage[] = (msgs || []).map((m: any, i: number) => {
          const id = extractId(m._id) || extractId(m.id) || `msg-${i}-${Date.now()}`;
          ids.add(id);
          return {
            id,
            userId: m.user_id || '',
            username: m.username || 'Inconnu',
            content: m.content || '',
            timestamp: formatTime(m.created_at),
            messageType: m.message_type || 'user',
            reactions: m.reactions || [],
            edited_at: m.edited_at || null,
          };
        });
        messageIdsRef.current = ids;
        setMessages(displayMsgs);
        setHasMoreMessages(msgs.length === 50);
        oldestMessageIdRef.current = displayMsgs.length > 0 ? displayMsgs[0].id : null;
      } catch (e: any) {
        console.error('Erreur chargement messages:', e);
        setMessages([]);
      }
    };
    loadMessages();
  }, [selectedChannel]);

  useEffect(() => {
    const channelName = channels.find(c => c.id === selectedChannel)?.name;
    if (channelName && serverName) {
      document.title = `#${channelName} — ${serverName}`;
    } else if (serverName) {
      document.title = serverName;
    } else {
      document.title = 'RTC Project';
    }
    return () => { document.title = 'RTC Project'; };
  }, [selectedChannel, channels, serverName]);

  useEffect(() => {
    wsClient.connect();
    const handler = (event: WSEvent) => {
      switch (event.type) {
        case 'new_message': {
          const msg = event.data;
          if (msg.channel_id !== selectedChannelRef.current) return;
          const msgId = extractId((msg as any).id) || extractId((msg as any)._id) || `ws-${Date.now()}`;
          if (messageIdsRef.current.has(msgId)) return;
          messageIdsRef.current.add(msgId);
          setMessages(prev => [...prev, {
            id: msgId,
            userId: msg.user_id || '',
            username: msg.username || 'Inconnu',
            content: msg.content || '',
            timestamp: formatTime(msg.created_at || new Date().toISOString()),
            messageType: msg.message_type || 'user',
          }]);
          // Desktop notification via Electron (no-op in browser)
          if (typeof window !== 'undefined' && (window as any).electronAPI) {
            (window as any).electronAPI.notify(
              msg.username || 'Nouveau message',
              msg.content || ''
            );
          }
          if (msg.user_id) {
            const timer = typingTimersRef.current.get(msg.user_id);
            if (timer) { clearTimeout(timer); typingTimersRef.current.delete(msg.user_id); }
            setTypingUsers(prev => {
              if (!prev.has(msg.user_id)) return prev;
              const n = new Map(prev); n.delete(msg.user_id); return n;
            });
          }
          break;
        }
        case 'online_users':
          setOnlineUserIds(new Set<string>((event.data || []).map((u: any) => u.user_id)));
          break;
        case 'user_online':
          if (event.data?.user_id)
            setOnlineUserIds(prev => new Set([...prev, event.data.user_id]));
          break;
        case 'user_offline':
          if (event.data?.user_id)
            setOnlineUserIds(prev => { const s = new Set(prev); s.delete(event.data.user_id); return s; });
          break;
        case 'member_joined': {
          const { server_id, user_id, username, role } = event.data || {};
          if (server_id !== serverId) break;
          setMembers(prev => {
            if (prev.find(m => m.id === user_id)) return prev;
            return [...prev, { id: user_id, username, role: role as DisplayMember['role'], online: true }];
          });
          setOnlineUserIds(prev => new Set([...prev, user_id]));
          break;
        }
        case 'member_left': {
          const { server_id, user_id } = event.data || {};
          if (server_id !== serverId) break;
          setMembers(prev => prev.filter(m => m.id !== user_id));
          setOnlineUserIds(prev => { const s = new Set(prev); s.delete(user_id); return s; });
          break;
        }
        case 'channel_created': {
          const { server_id, channel } = event.data || {};
          if (server_id !== serverId) break;
          setChannels(prev => {
            if (prev.find(c => c.id === channel.id)) return prev;
            return [...prev, channel as Channel];
          });
          if (pendingChannelSelectRef.current === channel.id) {
            setSelectedChannel(channel.id);
            pendingChannelSelectRef.current = null;
          }
          break;
        }
        case 'channel_deleted': {
          const { server_id, channel_id } = event.data || {};
          if (server_id !== serverId) break;
          setChannels(prev => {
            const updated = prev.filter(c => c.id !== channel_id);
            if (selectedChannelRef.current === channel_id) {
              const next = updated[0];
              if (next) { setSelectedChannel(next.id); }
              else { setSelectedChannel(''); setMessages([]); }
            }
            return updated;
          });
          break;
        }
        case 'member_role_updated': {
          const { server_id, changes } = event.data || {};
          if (server_id !== serverId) break;
          if (!Array.isArray(changes)) break;
          setMembers(prev => prev.map(m => {
            const change = changes.find((c: any) => c.user_id === m.id);
            if (change) return { ...m, role: change.new_role as any };
            return m;
          }));
          break;
        }
        case 'user_typing': {
          const { user_id, username, channel_id } = event.data || {};
          if (channel_id !== selectedChannelRef.current) break;
          if (user_id === currentUser?.id) break;
          setTypingUsers(prev => new Map(prev).set(user_id, username));
          const oldTimer = typingTimersRef.current.get(user_id);
          if (oldTimer) clearTimeout(oldTimer);
          const newTimer = setTimeout(() => {
            typingTimersRef.current.delete(user_id);
            setTypingUsers(prev => {
              if (!prev.has(user_id)) return prev;
              const n = new Map(prev); n.delete(user_id); return n;
            });
          }, 5000);
          typingTimersRef.current.set(user_id, newTimer);
          break;
        }
        case 'reaction_added': {
          const { message_id: _raw_mid_add, emoji, user_id } = event.data || {};
          const message_id = extractId(_raw_mid_add);
          setMessages(prev => prev.map(m => {
            if (!message_id || m.id !== message_id) return m;
            const reactions = m.reactions || [];
            const existing = reactions.find(r => r.emoji === emoji);
            if (existing) {
              if (existing.user_ids.includes(user_id)) return m;
              return { ...m, reactions: reactions.map(r => r.emoji === emoji ? { ...r, user_ids: [...r.user_ids, user_id] } : r) };
            }
            return { ...m, reactions: [...reactions, { emoji, user_ids: [user_id] }] };
          }));
          break;
        }
        case 'reaction_removed': {
          const { message_id: _raw_mid_rm, emoji, user_id } = event.data || {};
          const message_id = extractId(_raw_mid_rm);
          setMessages(prev => prev.map(m => {
            if (!message_id || m.id !== message_id) return m;
            const reactions = (m.reactions || [])
              .map(r => r.emoji === emoji ? { ...r, user_ids: r.user_ids.filter(id => id !== user_id) } : r)
              .filter(r => r.user_ids.length > 0);
            return { ...m, reactions };
          }));
          break;
        }
        case 'message_deleted': {
          const { message_id } = event.data || {};
          if (message_id) setMessages(prev => prev.filter(m => m.id !== message_id));
          break;
        }
        case 'message_edited': {
          const { message_id, channel_id, content, edited_at } = event.data || {};
          if (channel_id && channel_id !== selectedChannelRef.current) break;
          setMessages(prev => prev.map(m =>
            m.id === message_id ? { ...m, content, edited_at } : m
          ));
          break;
        }
      }
    };
    const unsub = wsClient.onEvent(handler);
    return () => { unsub(); };
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (loadingMoreMessages || !hasMoreMessages || !selectedChannel) return;
    setLoadingMoreMessages(true);
    try {
      const oldest = oldestMessageIdRef.current;
      const msgs = await messagesApi.getMessages(selectedChannel, { limit: 50, before: oldest || undefined });
      if (!msgs || msgs.length === 0) { setHasMoreMessages(false); return; }
      const newMsgs: DisplayMessage[] = msgs.map((m: any, i: number) => {
        const id = extractId(m._id) || extractId(m.id) || `more-${i}-${Date.now()}`;
        messageIdsRef.current.add(id);
        return {
          id,
          userId: m.user_id || '',
          username: m.username || 'Inconnu',
          content: m.content || '',
          timestamp: formatTime(m.created_at),
          messageType: m.message_type || 'user',
          reactions: m.reactions || [],
          edited_at: m.edited_at || null,
        };
      });
      setMessages(prev => [...newMsgs, ...prev]);
      setHasMoreMessages(msgs.length === 50);
      oldestMessageIdRef.current = newMsgs[0]?.id || null;
    } catch (e) {
      console.error('Erreur chargement ancien messages:', e);
    } finally {
      setLoadingMoreMessages(false);
    }
  }, [selectedChannel, loadingMoreMessages, hasMoreMessages]);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!selectedChannel || !content.trim()) return;
    try {
      await messagesApi.sendMessage(selectedChannel, { content: content.trim() });
    } catch (e: any) {
      setSendError(t('common.error'));
      setTimeout(() => setSendError(''), 4000);
    }
  }, [selectedChannel]);

  const handleCreateChannel = useCallback(async (name: string) => {
    try {
      const newChannel = await channelsApi.createChannel(serverId, { name });
      pendingChannelSelectRef.current = newChannel.id;
    } catch (e: any) {
      alert(t('common.error') + ': ' + (e?.message || ''));
    }
  }, [serverId]);

  const handleDeleteChannel = useCallback(async (channelId: string) => {
    try {
      await channelsApi.deleteChannel(channelId);
      setChannels(prev => {
        const remaining = prev.filter(c => c.id !== channelId);
        if (selectedChannel === channelId && remaining.length > 0) setSelectedChannel(remaining[0].id);
        else if (remaining.length === 0) setSelectedChannel('');
        return remaining;
      });
    } catch (e: any) {
      alert(t('common.error') + ': ' + (e?.message || ''));
    }
  }, [selectedChannel]);

  const handleRenameChannel = useCallback(async (channelId: string, newName: string) => {
    try {
      await channelsApi.updateChannel(channelId, { name: newName });
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, name: newName } : c));
    } catch (e: any) {
      alert(t('common.error') + ': ' + (e?.message || ''));
    }
  }, []);

  const handleDeleteServer = useCallback(async () => {
    if (!confirm(t('chat.delete_server') + ' ?')) return;
    try {
      await serversApi.deleteServer(serverId);
      router.push(`/${locale}/servers`);
    } catch (e: any) {
      alert(t('common.error') + ': ' + (e?.message || ''));
    }
  }, [serverId, router]);

  const handleLeaveServer = useCallback(async () => {
    if (currentUser && members.find(m => m.id === currentUser.id && m.role === 'owner')) {
      setShowOwnerLeaveModal(true);
      return;
    }
    if (!confirm(t('chat.leave') + ' ?')) return;
    try {
      await serversApi.leaveServer(serverId);
      router.push(`/${locale}/servers`);
    } catch (e: any) {
      if (e?.status === 403) setShowOwnerLeaveModal(true);
      else alert(t('common.error') + ': ' + (e?.message || ''));
    }
  }, [serverId, router, currentUser, members]);

  const handleUpdateRole = useCallback(async (userId: string, newRole: string) => {
    await serversApi.updateMember(serverId, userId, { role: newRole as MemberRole });
    setMembers(prev => prev.map(m => {
      if (newRole === 'owner') {
        if (m.id === currentUser?.id) return { ...m, role: 'admin' as const };
        if (m.id === userId) return { ...m, role: 'owner' as const };
      } else {
        if (m.id === userId) return { ...m, role: newRole as any };
      }
      return m;
    }));
  }, [serverId, currentUser]);

  const handleCopyInvite = useCallback(() => {
    navigator.clipboard.writeText(inviteCode).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    }).catch(() => {});
  }, [inviteCode]);

  const displayMembers = members.map(m => ({ ...m, online: onlineUserIds.has(m.id) }));
  const channelName = channels.find(c => c.id === selectedChannel)?.name || '';
  const myRole = members.find(m => m.id === currentUser?.id)?.role;
  const canManage = myRole === 'owner' || myRole === 'admin';
  const typingUserIds = new Set(typingUsers.keys());
  const typingNames = Array.from(typingUsers.values());

  if (loading) {
    return (
      <div className="chat-layout">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#999' }}>
          {t('common.loading')}
        </div>
      </div>
    );
  }

  return (
    <React.Fragment>
      {showMobileSidebar && (
        <div
          className="mobile-sidebar-overlay"
          onClick={() => setShowMobileSidebar(false)}
          style={{ position: 'fixed', inset: 0, left: '70px', background: 'rgba(0,0,0,0.55)', zIndex: 199, display: 'block', cursor: 'pointer' }}
        />
      )}
      <div className="chat-layout">
        <ServersBar currentServerId={serverId} />
        <ChannelsList
          channels={channels.map(c => ({ id: c.id, name: c.name, serverId: c.server_id }))}
          selectedChannelId={selectedChannel}
          onChannelSelect={(id) => { setSelectedChannel(id); setShowMobileSidebar(false); }}
          serverName={serverName}
          onCreateChannel={handleCreateChannel}
          onDeleteChannel={handleDeleteChannel}
          onRenameChannel={handleRenameChannel}
          userRole={myRole}
          defaultChannelId={channels[0]?.id}
          className={showMobileSidebar ? 'mobile-open' : ''}
          onClose={() => setShowMobileSidebar(false)}
        />

        <div className="chat-zone">
          <div className="chat-header">
            <div className="chat-header-left">
              <button className="mobile-menu-btn" onClick={() => setShowMobileSidebar(prev => !prev)} aria-label="Ouvrir les channels">☰</button>
              <span className="channel-hash">#</span>
              <h1 className="channel-title">{channelName}</h1>
            </div>
            <div className="chat-header-right" style={{ position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <LanguageSwitcher />
              <button
                onClick={(e) => { e.stopPropagation(); setShowInviteModal(true); setShowSettings(false); }}
                style={{ cursor: 'pointer', fontSize: '13px', background: '#248046', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: '4px', fontWeight: 600 }}
              >
                👤+ {t('chat.invite')}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); setShowInviteModal(false); }}
                className="header-icon-btn"
                style={{ cursor: 'pointer', fontSize: '18px', background: 'none', border: 'none', padding: '4px 8px' }}
              >
                ⚙️
              </button>

              {showSettings && (
                <React.Fragment>
                  <div onClick={() => setShowSettings(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                  <div style={{ position: 'absolute', top: '110%', right: 0, background: '#111214', border: '1px solid #3f4147', borderRadius: '8px', padding: '6px 0', minWidth: '220px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                    {(myRole === 'owner' || myRole === 'admin') && (
                      <button
                        onClick={() => { setShowSettings(false); handleDeleteServer(); }}
                        style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: '#ed4245', textAlign: 'left', cursor: 'pointer', fontSize: '14px' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#2b2d31')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        🗑️ {t('chat.delete_server')}
                      </button>
                    )}
                    <button
                      onClick={() => { setShowSettings(false); handleLeaveServer(); }}
                      style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: '#ed4245', textAlign: 'left', cursor: 'pointer', fontSize: '14px' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#2b2d31')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      🚪 {t('chat.leave')}
                    </button>
                  </div>
                </React.Fragment>
              )}

              {showInviteModal && (
                <React.Fragment>
                  <div onClick={() => setShowInviteModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.5)' }} />
                  <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#2b2d31', borderRadius: '12px', padding: '24px', minWidth: '400px', zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.8)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>{t('chat.invite')} — {serverName}</h3>
                      <button onClick={() => setShowInviteModal(false)} style={{ background: 'none', border: 'none', color: '#b5bac1', cursor: 'pointer', fontSize: '20px' }}>✕</button>
                    </div>
                    {inviteCode ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1e1f22', borderRadius: '6px', padding: '8px 12px' }}>
                        <code style={{ flex: 1, color: '#00b0f4', fontSize: '16px', fontWeight: 600, letterSpacing: '1px', userSelect: 'all' }}>{inviteCode}</code>
                        <button
                          onClick={handleCopyInvite}
                          style={{ background: inviteCopied ? '#248046' : '#5865f2', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, minWidth: '80px' }}
                        >
                          {inviteCopied ? t('common.copied') : t('common.copy')}
                        </button>
                      </div>
                    ) : (
                      <div style={{ color: '#888', fontStyle: 'italic' }}>{t('chat.no_invite_code')}</div>
                    )}
                  </div>
                </React.Fragment>
              )}
            </div>
          </div>

          {(!selectedChannel || channels.length === 0) && !loading && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#4f545c', gap: '16px' }}>
              <div style={{ fontSize: '3rem' }}>📭</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#6d6f78' }}>{t('chat.no_channel')}</div>
            </div>
          )}

          {hasMoreMessages && messages.length >= 50 && selectedChannel && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
              <button
                onClick={handleLoadMore}
                disabled={loadingMoreMessages}
                style={{ background: 'none', border: '1px solid #3f4147', color: '#8e9297', borderRadius: '6px', padding: '6px 16px', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                {loadingMoreMessages ? t('common.loading') : `↑ ${t('chat.load_more')}`}
              </button>
            </div>
          )}

          {sendError && (
            <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: '#2b0a0a', border: '1px solid #8b1a1a', borderRadius: '6px', color: '#ff4444', fontSize: '0.85rem' }}>
              ⚠️ {sendError}
            </div>
          )}

          {selectedChannel && (
            <MessageList
              messages={messages}
              currentUserId={currentUser?.id}
              token={token}
              userRole={myRole}
              onDeleteMessage={async (msgId) => {
                try {
                  await messagesApi.deleteMessage(msgId);
                  setMessages(prev => prev.filter(m => m.id !== msgId));
                } catch {
                  alert(t('common.error'));
                }
              }}
              onEditMessage={(msgId, newContent) => {
                setMessages(prev => prev.map(m =>
                  m.id === msgId ? { ...m, content: newContent, edited_at: new Date().toISOString() } : m
                ));
              }}
            />
          )}

          <div style={{ minHeight: '24px', padding: '2px 16px' }}>
            {typingNames.length > 0 && (
              <div style={{ fontSize: '12px', color: '#b5bac1', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ display: 'inline-flex', gap: '2px', alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#5865f2', display: 'inline-block', animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </span>
                <span>
                  <strong style={{ color: '#fff', fontStyle: 'normal' }}>{typingNames.join(', ')}</strong>
                  {typingNames.length === 1 ? ` ${t('chat.typing_one')}` : ` ${t('chat.typing_many')}`}
                </span>
                <style>{`@keyframes typingBounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }`}</style>
              </div>
            )}
          </div>

          {selectedChannel && (
            <ChatInput
              onSendMessage={handleSendMessage}
              onTyping={() => wsClient.sendTyping(selectedChannel)}
            />
          )}
        </div>

        <MembersList
          members={displayMembers}
          typingUserIds={typingUserIds}
          currentUserId={currentUser?.id}
          currentUserRole={myRole}
          serverId={serverId}
          onUpdateRole={handleUpdateRole}
        />
      </div>

      {showOwnerLeaveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }} onClick={() => setShowOwnerLeaveModal(false)}>
          <div style={{ background: '#2b2d31', borderRadius: '12px', padding: '32px', maxWidth: '420px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: '1px solid #3f4147' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '2rem', marginBottom: '12px', textAlign: 'center' }}>👑</div>
            <h3 style={{ color: '#fff', margin: '0 0 12px', textAlign: 'center', fontSize: '1.1rem' }}>{t('chat.owner_leave_title')}</h3>
            <p style={{ color: '#b5bac1', fontSize: '0.9rem', lineHeight: '1.5', textAlign: 'center', margin: '0 0 24px' }}>
              {t('chat.owner_leave_body')}
            </p>
            <button
              onClick={() => setShowOwnerLeaveModal(false)}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#5865f2', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600 }}
            >
              {t('common.confirm')}
            </button>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
