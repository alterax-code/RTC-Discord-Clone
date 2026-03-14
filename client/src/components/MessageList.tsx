'use client';

import { useEffect, useRef, useState } from 'react';

interface Message {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: string;
  messageType?: string;
}

interface MessageListProps {
  messages: Message[];
  currentUserId?: string;
  userRole?: 'owner' | 'admin' | 'member';
  onDeleteMessage?: (msgId: string) => void;
}

function safeKey(id: any, index: number): string {
  if (typeof id === 'string' && id.length > 0) return id;
  if (typeof id === 'object' && id !== null && id.$oid) return id.$oid;
  return `fallback-${index}`;
}

// ── Menu ⋯ pour un message ──
function MessageMenu({
  onDelete,
}: {
  onDelete: () => void;
}) {
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
          borderRadius: '6px', minWidth: '150px', zIndex: 999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}>
          <button
            onClick={() => { setOpen(false); onDelete(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              width: '100%', padding: '10px 14px', background: 'none',
              border: 'none', color: '#ed4245', textAlign: 'left',
              cursor: 'pointer', fontSize: '14px',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#ed4245'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#ed4245'; }}
          >
            🗑️ Supprimer
          </button>
        </div>
      )}
    </div>
  );
}

export default function MessageList({ messages, currentUserId, userRole, onDeleteMessage }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }, [messages]);

  const canDelete = (msg: Message) => {
    if (!onDeleteMessage) return false;
    if (msg.messageType === 'system') return false;
    if (msg.userId === currentUserId) return true;
    if (userRole === 'owner' || userRole === 'admin') return true;
    return false;
  };

  if (messages.length === 0) {
    return (
      <div className="messages-container">
        <div className="empty-messages">
          <div className="empty-icon">💬</div>
          <h3>Aucun message pour le moment</h3>
          <p>Soyez le premier à envoyer un message dans ce channel !</p>
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
                <div className="message-text">{message.content}</div>
              </div>

              {/* Menu ⋯ visible au hover */}
              {canDelete(message) && (
                <MessageMenu
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
