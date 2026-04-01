'use client';

import { useState, useEffect } from 'react';

interface DMConversation {
  id: string;
  other_user_id: string;
  other_username: string;
  last_message?: string;
}

interface DMListProps {
  token: string;
  currentUserId: string;
  selectedDMId?: string;
  onSelectDM: (dmId: string, otherUserId: string, otherUsername: string) => void;
}

export default function DMList({ token, currentUserId, selectedDMId, onSelectDM }: DMListProps) {
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDMs = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/dm`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        setConversations(data || []);
      } catch {
        console.error('Erreur chargement DMs');
      } finally {
        setLoading(false);
      }
    };
    fetchDMs();
  }, [token]);

  return (
    <div style={{
      width: '240px', background: '#2b2d31', height: '100%',
      display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e1f22',
    }}>
      <div style={{
        padding: '16px', borderBottom: '1px solid #1e1f22',
        color: '#fff', fontWeight: 700, fontSize: '15px',
      }}>
        💬 Messages privés
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {loading && (
          <p style={{ color: '#a3a3a3', fontSize: '13px', padding: '8px' }}>Chargement...</p>
        )}
        {!loading && conversations.length === 0 && (
          <p style={{ color: '#a3a3a3', fontSize: '13px', padding: '8px' }}>Aucune conversation</p>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => onSelectDM(conv.id, conv.other_user_id, conv.other_username)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
              background: selectedDMId === conv.id ? '#404249' : 'none',
              marginBottom: '2px',
            }}
            onMouseEnter={e => {
              if (selectedDMId !== conv.id) e.currentTarget.style.background = '#35373c';
            }}
            onMouseLeave={e => {
              if (selectedDMId !== conv.id) e.currentTarget.style.background = 'none';
            }}
          >
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: '#5865f2', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#fff', fontSize: '14px',
              fontWeight: 700, flexShrink: 0,
            }}>
              {conv.other_username.charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ color: '#fff', fontSize: '14px', fontWeight: 600, margin: 0 }}>
                {conv.other_username}
              </p>
              {conv.last_message && (
                <p style={{
                  color: '#a3a3a3', fontSize: '12px', margin: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {conv.last_message}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
