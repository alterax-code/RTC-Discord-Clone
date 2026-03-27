'use client';

import { useState } from 'react';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏'];

interface Reaction {
  emoji: string;
  user_ids: string[];
}

interface ReactionPickerProps {
  messageId: string;
  reactions: Reaction[];
  currentUserId: string;
  token: string;
}

export default function ReactionPicker({
  messageId, reactions, currentUserId, token,
}: ReactionPickerProps) {
  const [showPicker, setShowPicker] = useState(false);

  const handleReaction = async (emoji: string) => {
    setShowPicker(false);
    const hasReacted = reactions
      .find(r => r.emoji === emoji)
      ?.user_ids.includes(currentUserId);

    const method = hasReacted ? 'DELETE' : 'POST';
    const url = hasReacted
      ? `${process.env.NEXT_PUBLIC_API_URL}/messages/${messageId}/reactions/${emoji}`
      : `${process.env.NEXT_PUBLIC_API_URL}/messages/${messageId}/reactions`;

    await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: method === 'POST' ? JSON.stringify({ emoji }) : undefined,
    });
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {/* Badges réactions existantes */}
      {reactions.map(r => (
        <button
          key={r.emoji}
          onClick={() => handleReaction(r.emoji)}
          style={{
            background: r.user_ids.includes(currentUserId) ? '#5865f220' : '#2b2d31',
            border: r.user_ids.includes(currentUserId) ? '1px solid #5865f2' : '1px solid #3f4147',
            borderRadius: '12px', padding: '2px 6px', cursor: 'pointer',
            fontSize: '13px', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px',
          }}
        >
          {r.emoji} <span style={{ fontSize: '11px' }}>{r.user_ids.length}</span>
        </button>
      ))}

      {/* Bouton + pour ouvrir le picker */}
      <button
        onClick={() => setShowPicker(o => !o)}
        style={{
          background: 'none', border: '1px solid #3f4147',
          borderRadius: '12px', padding: '2px 6px',
          cursor: 'pointer', color: '#8e9297', fontSize: '13px',
        }}
      >
        +
      </button>

      {/* Mini picker */}
      {showPicker && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0,
          background: '#111214', border: '1px solid #3f4147',
          borderRadius: '8px', padding: '6px', display: 'flex',
          gap: '4px', zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          {EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => handleReaction(emoji)}
              style={{
                background: 'none', border: 'none',
                cursor: 'pointer', fontSize: '18px', padding: '4px',
                borderRadius: '4px',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#2b2d31')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
