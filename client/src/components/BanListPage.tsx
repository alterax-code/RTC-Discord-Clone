'use client';

import { useState, useEffect } from 'react';

interface Ban {
  user_id: string;
  username: string;
  reason: string;
  expires_at: string | null;
  created_at: string;
}

interface BanListPageProps {
  serverId: string;
  token: string;
  onClose: () => void;
}

export default function BanListPage({ serverId, token, onClose }: BanListPageProps) {
  const [bans, setBans] = useState<Ban[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Charger la liste des bans
  useEffect(() => {
    const fetchBans = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/servers/${serverId}/bans`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error('Erreur lors du chargement');
        const data = await res.json();
        setBans(data);
      } catch (err) {
        setError('Impossible de charger les bans');
      } finally {
        setLoading(false);
      }
    };
    fetchBans();
  }, [serverId, token]);

  // Unban un membre
  const handleUnban = async (userId: string) => {
    if (!confirm('Débannir ce membre ?')) return;
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/servers/${serverId}/bans/${userId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      setBans(prev => prev.filter(b => b.user_id !== userId));
    } catch {
      setError('Erreur lors du débannissement');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '600px', width: '100%' }}>
        <div className="modal-header">
          <h2>🔨 Membres bannis</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {loading && <p style={{ color: '#a3a3a3', padding: '20px' }}>Chargement...</p>}
        {error && <div className="error-message">{error}</div>}

        {!loading && bans.length === 0 && (
          <p style={{ color: '#a3a3a3', padding: '20px' }}>Aucun membre banni.</p>
        )}

        {bans.map(ban => (
          <div key={ban.user_id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid #3f4147',
          }}>
            <div>
              <p style={{ color: '#fff', fontWeight: 600, margin: 0 }}>
                {ban.username}
              </p>
              <p style={{ color: '#a3a3a3', fontSize: '12px', margin: '4px 0 0' }}>
                Raison : {ban.reason || 'Aucune'} •{' '}
                {ban.expires_at
                  ? `Expire le ${new Date(ban.expires_at).toLocaleDateString()}`
                  : 'Ban permanent'}
              </p>
            </div>
            <button
              onClick={() => handleUnban(ban.user_id)}
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              Débannir
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
