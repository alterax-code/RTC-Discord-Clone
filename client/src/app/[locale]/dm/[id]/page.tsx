'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import DMList from '@/components/DMList';
import ChatInput from '@/components/ChatInput';
import ReactionPicker from '@/components/ReactionPicker';
import { getAuthToken, getCurrentUser } from '@/lib/auth';
import wsClient from '@/lib/websocket';
import { WSEvent } from '@/lib/types';

interface DmMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
  reactions?: Array<{ emoji: string; user_ids: string[] }>;
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

export default function DMConversationPage() {
  const { locale, id } = useParams();
  const router = useRouter();
  const t = useTranslations();
  const token = getAuthToken() || '';
  const currentUser = getCurrentUser();

  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [otherUsername, setOtherUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationIdRef = useRef<string>(id as string);

  useEffect(() => {
    conversationIdRef.current = id as string;
  }, [id]);

  useEffect(() => {
    if (!id || !token) return;
    const loadMessages = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/dm/${id}/messages`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return;
        const data = await res.json();
        setMessages(
          (data || []).map((m: any, i: number) => ({
            id: extractId(m._id) || extractId(m.id) || `dm-${i}-${Date.now()}`,
            conversation_id: m.conversation_id || '',
            user_id: m.user_id || '',
            username: m.username || '',
            content: m.content || '',
            created_at: formatTime(m.created_at),
            reactions: m.reactions || [],
          }))
        );
      } catch {}
      finally { setLoading(false); }
    };
    loadMessages();
  }, [id, token]);

  useEffect(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }, [messages]);

  useEffect(() => {
    wsClient.connect();
    const handler = (event: WSEvent) => {
      if (event.type === 'dm_message') {
        const msg = event.data;
        if (msg.conversation_id !== conversationIdRef.current) return;
        setMessages(prev => [...prev, {
          id: msg.id || String(Date.now()),
          conversation_id: msg.conversation_id,
          user_id: msg.user_id,
          username: msg.username,
          content: msg.content,
          created_at: formatTime(msg.created_at || new Date().toISOString()),
        }]);
      } else if (event.type === 'reaction_added') {
        const { message_id, emoji, user_id } = event.data || {};
        setMessages(prev => prev.map(m => {
          if (m.id !== message_id) return m;
          const reactions = [...(m.reactions || [])];
          const idx = reactions.findIndex(r => r.emoji === emoji);
          if (idx >= 0) {
            reactions[idx] = { ...reactions[idx], user_ids: [...reactions[idx].user_ids, user_id] };
          } else {
            reactions.push({ emoji, user_ids: [user_id] });
          }
          return { ...m, reactions };
        }));
      } else if (event.type === 'reaction_removed') {
        const { message_id, emoji, user_id } = event.data || {};
        setMessages(prev => prev.map(m => {
          if (m.id !== message_id) return m;
          const reactions = (m.reactions || [])
            .map(r => r.emoji === emoji ? { ...r, user_ids: r.user_ids.filter(id => id !== user_id) } : r)
            .filter(r => r.user_ids.length > 0);
          return { ...m, reactions };
        }));
      }
    };
    const unsub = wsClient.onEvent(handler);
    return () => unsub();
  }, []);

  const handleSend = useCallback(async (content: string) => {
    if (!content.trim() || !id) return;
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/dm/${id}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: content.trim() }),
        }
      );
    } catch {}
  }, [id, token]);

  const handleSelectDM = (dmId: string, _otherUserId: string, username: string) => {
    if (dmId === (id as string)) { setOtherUsername(username); return; }
    setOtherUsername(username);
    setMessages([]);
    router.push(`/${locale}/dm/${dmId}`);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#313338' }}>
      <DMList
        token={token}
        currentUserId={currentUser?.id || ''}
        selectedDMId={id as string}
        onSelectDM={handleSelectDM}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          height: '48px', borderBottom: '1px solid #1e1f22',
          display: 'flex', alignItems: 'center', padding: '0 16px',
          background: '#313338', flexShrink: 0,
        }}>
          <button
            onClick={() => router.push(`/${locale}/servers`)}
            style={{ background: 'none', border: 'none', color: '#8e9297', cursor: 'pointer', fontSize: '13px', padding: '4px 8px', borderRadius: '4px', marginRight: '8px' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#8e9297'; }}
          >
            {t('common.back')}
          </button>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>
            {otherUsername ? `@ ${otherUsername}` : `💬 ${t('dm.conversation')}`}
          </span>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loading && (
            <p style={{ color: '#a3a3a3', textAlign: 'center' }}>{t('common.loading')}</p>
          )}
          {!loading && messages.length === 0 && (
            <p style={{ color: '#a3a3a3', textAlign: 'center', marginTop: '40px' }}>
              {t('dm.no_messages')}
            </p>
          )}
          {messages.map((msg, i) => {
            const isOwn = msg.user_id === currentUser?.id;
            return (
              <div key={msg.id || i} style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                marginBottom: '16px',
              }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  background: isOwn ? '#5865f2' : '#3ba55c',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: '14px', flexShrink: 0,
                }}>
                  {(msg.username || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ color: isOwn ? '#c9cdfb' : '#fff', fontWeight: 600, fontSize: '14px' }}>
                      {msg.username}
                    </span>
                    <span style={{ color: '#72767d', fontSize: '11px' }}>{msg.created_at}</span>
                  </div>
                  <div style={{ color: '#dcddde', fontSize: '15px', lineHeight: '1.375' }}>
                    {(msg.content || '').startsWith('http') && (msg.content || '').endsWith('.gif')
                      ? <img src={msg.content} alt="gif" style={{ maxWidth: '300px', borderRadius: '8px', display: 'block' }} />
                      : (msg.content || '')}
                  </div>
                  {currentUser && token && (
                    <ReactionPicker
                      messageId={msg.id}
                      reactions={msg.reactions || []}
                      currentUserId={currentUser.id}
                      token={token}
                      apiBase="dm/messages"
                      onReactionChange={(emoji, added) => {
                        setMessages(prev => prev.map(m => {
                          if (m.id !== msg.id) return m;
                          const reactions = [...(m.reactions || [])];
                          const idx = reactions.findIndex(r => r.emoji === emoji);
                          if (added) {
                            if (idx >= 0) reactions[idx] = { ...reactions[idx], user_ids: [...reactions[idx].user_ids, currentUser.id] };
                            else reactions.push({ emoji, user_ids: [currentUser.id] });
                          } else {
                            if (idx >= 0) {
                              const filtered = reactions[idx].user_ids.filter(id => id !== currentUser.id);
                              if (filtered.length === 0) reactions.splice(idx, 1);
                              else reactions[idx] = { ...reactions[idx], user_ids: filtered };
                            }
                          }
                          return { ...m, reactions };
                        }));
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <ChatInput onSendMessage={handleSend} onTyping={() => {}} />
      </div>
    </div>
  );
}
