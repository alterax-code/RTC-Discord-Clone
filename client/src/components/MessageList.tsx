'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactionPicker from './ReactionPicker';

interface Reaction {
  emoji: string;
  user_ids: string[];
}

interface Message {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: string;
  messageType?: string;
  edited_at?: any;
  reactions?: Reaction[];
}

interface MessageListProps {
  messages: Message[];
  currentUserId?: string;
  token?: string;
  userRole?: 'owner' | 'admin' | 'member';
  onDeleteMessage?: (msgId: string) => void;
  onEditMessage?: (msgId: string, newContent: string) => void;
}

function safeKey(id: any, index: number): string {
  if (typeof id === 'string' && id.length > 0) return id;
  if (typeof id === 'object' && id !== null && id.$oid) return id.$oid;
  return `fallback-${index}`;
}

// ── Menu ⋯ pour un message ──
function MessageMenu({
  isOwn,
  onEdit,
  onDelete,
}: {
  isOwn: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '8px',
    width: '100%', padding: '10px 14px', background: 'none',
    border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px',
  };

  return (
    <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="message-menu-btn"
        title="Options"
        style={{
          background: 'none', border: 'none', color: '#8e9297',
          cursor: 'pointer', fontSize: '18px', padding: '0 6px',
          lineHeight: 1, borderRadius: '4px', opacity: 0,
          transition: 'opacity 0.15s',
        }}
      >
        ⋯
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: '4px',
          background: '#111214', border: '1px solid #3f4147',
          borderRadius: '6px', minWidth: '160px', zIndex: 999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}>
          {isOwn && (
            <button
              onClick={() => { setOpen(false); onEdit(); }}
              style={{ ...btnBase, color: '#dcddde' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#5865f2'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#dcddde'; }}
            >
              ✏️ {t('chat.edit_message')}
            </button>
          )}
          <button
            onClick={() => { setOpen(false); onDelete(); }}
            style={{ ...btnBase, color: '#ed4245' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#ed4245'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#ed4245'; }}
          >
            🗑️ {t('chat.delete_message')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function MessageList({ messages, currentUserId, token, userRole, onDeleteMessage, onEditMessage }: MessageListProps) {
  const t = useTranslations();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }, [messages]);

  const canShowMenu = (msg: Message) => {
    if (msg.messageType === 'system') return false;
    if (msg.userId === currentUserId) return true;
    if ((userRole === 'owner' || userRole === 'admin') && onDeleteMessage) return true;
    return false;
  };

  const handleEditSave = async (msgId: string) => {
    const trimmed = editContent.trim();
    if (!trimmed || !token) { setEditingId(null); return; }
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/messages/${msgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: trimmed }),
      });
      onEditMessage?.(msgId, trimmed);
    } catch {}
    setEditingId(null);
  };

  if (messages.length === 0) {
    return (
      <div className="messages-container">
        <div className="empty-messages">
          <div className="empty-icon">💬</div>
          <h3>{t('chat.no_messages')}</h3>
          <p>{t('chat.no_messages_sub')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="messages-container">
      <style>{`
        .message-item:hover .message-menu-btn { opacity: 1 !important; }
      `}</style>
      <div className="messages-list">
        {messages.map((message, index) => {
          const isSystem = message.messageType === 'system';

          if (isSystem) {
            return (
              <div key={safeKey(message.id, index)} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '4px 16px', color: '#8e9297', fontSize: '12px',
              }}>
                <div style={{ flex: 1, height: '1px', background: '#3f4147' }} />
                <span>{message.content}</span>
                <div style={{ flex: 1, height: '1px', background: '#3f4147' }} />
              </div>
            );
          }

          return (
            <div
              key={safeKey(message.id, index)}
              className="message-item"
              style={{ position: 'relative', display: 'flex', alignItems: 'flex-start' }}
            >
              <div className="message-avatar">
                {(message.username || '?').charAt(0).toUpperCase()}
              </div>
              <div className="message-content" style={{ flex: 1, minWidth: 0 }}>
                <div className="message-header">
                  <span className="message-username">{message.username}</span>
                  <span className="message-timestamp">{message.timestamp}</span>
                </div>
                <div className="message-text">
                  {editingId === message.id ? (
                    <input
                      autoFocus
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSave(message.id); }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      style={{
                        width: '100%', background: '#383a40', border: '1px solid #5865f2',
                        borderRadius: '4px', color: '#dcddde', padding: '6px 10px',
                        fontSize: '15px', outline: 'none',
                      }}
                    />
                  ) : (
                    <>
                      {(message.content || '').startsWith('http') && (message.content || '').endsWith('.gif')
                        ? <img src={message.content} alt="gif" style={{ maxWidth: '300px', borderRadius: '8px', display: 'block' }} />
                        : (message.content || '')}
                      {message.edited_at && (
                        <span style={{ fontSize: '11px', color: '#72767d', marginLeft: '4px' }}>
                          {t('chat.edited')}
                        </span>
                      )}
                    </>
                  )}
                </div>
                {currentUserId && token && (
                  <ReactionPicker
                    messageId={message.id}
                    reactions={message.reactions || []}
                    currentUserId={currentUserId}
                    token={token}
                  />
                )}
              </div>

              {/* Menu ⋯ visible au hover */}
              {canShowMenu(message) && editingId !== message.id && (
                <MessageMenu
                  isOwn={message.userId === currentUserId}
                  onEdit={() => { setEditContent(message.content); setEditingId(message.id); }}
                  onDelete={() => onDeleteMessage?.(message.id)}
                />
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
