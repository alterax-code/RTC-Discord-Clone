'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations();
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);

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
        // 501 placeholder — show empty state
      } finally {
        setLoading(false);
      }
    };
    fetchDMs();
  }, [token]);

  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/dm/${convId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      setConversations(prev => prev.filter(c => c.id !== convId));
    } catch {
      // ignore
    }
  };

  const handleStartDM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/dm/start-by-username`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ username: searchInput.trim() }),
        }
      );
      if (res.status === 404) { setSearchError(t('dm.user_not_found')); return; }
      if (!res.ok) { setSearchError(t('dm.user_not_found')); return; }
      const data = await res.json();
      setShowSearch(false);
      setSearchInput('');
      onSelectDM(data.id, '', data.other_username);
    } catch {
      setSearchError(t('dm.user_not_found'));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div style={{
      width: '240px', background: '#2b2d31', height: '100%',
      display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e1f22',
    }}>
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid #1e1f22',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>💬 {t('dm.title')}</span>
        <button
          onClick={() => { setShowSearch(o => !o); setSearchError(''); setSearchInput(''); }}
          style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: '#5865f2', border: 'none', color: '#fff',
            cursor: 'pointer', fontSize: '20px', lineHeight: '1',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
          title={t('dm.new_message')}
        >
          +
        </button>
      </div>

      {showSearch && (
        <form onSubmit={handleStartDM} style={{ padding: '10px 12px', borderBottom: '1px solid #1e1f22' }}>
          <input
            autoFocus
            type="text"
            value={searchInput}
            onChange={e => { setSearchInput(e.target.value); setSearchError(''); }}
            placeholder={t('dm.search_placeholder')}
            style={{
              width: '100%', background: '#1e1f22', border: '1px solid #3f4147',
              borderRadius: '4px', color: '#fff', padding: '6px 8px',
              fontSize: '13px', outline: 'none', boxSizing: 'border-box',
            }}
            disabled={searching}
          />
          {searchError && <p style={{ color: '#f04747', fontSize: '11px', margin: '4px 0 0' }}>{searchError}</p>}
        </form>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {loading && (
          <p style={{ color: '#a3a3a3', fontSize: '13px', padding: '8px' }}>{t('common.loading')}</p>
        )}
        {!loading && conversations.length === 0 && (
          <p style={{ color: '#a3a3a3', fontSize: '13px', padding: '8px' }}>{t('dm.no_conversations')}</p>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => onSelectDM(conv.id, conv.other_user_id, conv.other_username)}
            onMouseEnter={() => setHoveredConvId(conv.id)}
            onMouseLeave={() => setHoveredConvId(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
              background: selectedDMId === conv.id ? '#404249' : hoveredConvId === conv.id ? '#35373c' : 'none',
              marginBottom: '2px', position: 'relative',
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
            <div style={{ minWidth: 0, flex: 1 }}>
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
            {hoveredConvId === conv.id && (
              <button
                onClick={e => handleDeleteConversation(e, conv.id)}
                title={t('dm.delete')}
                style={{
                  background: 'none', border: 'none', color: '#a3a3a3',
                  cursor: 'pointer', fontSize: '16px', lineHeight: 1,
                  padding: '2px 4px', borderRadius: '4px', flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#a3a3a3'; }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
