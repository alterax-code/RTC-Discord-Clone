'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ServerCard from '@/components/ServerCard';
import CreateServerModal from '@/components/CreateServerModal';
import JoinServerModal from '@/components/JoinServerModal';
import EmptyServers from '@/components/EmptyServers';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { serversApi } from '@/lib/api';
import { isAuthenticated, getCurrentUser, logout } from '@/lib/auth';
import { Server } from '@/lib/types';

export default function ServersPage() {
  const router = useRouter();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    const user = getCurrentUser();
    if (user?.username) setUsername(user.username);
    loadServers();
  }, []);

  const loadServers = async (attempt = 1) => {
    try {
      setLoading(true);
      setError('');
      const data = await serversApi.getServers();
      setServers(data);
    } catch (e: any) {
      if (attempt < 3) {
        await new Promise(res => setTimeout(res, 600 * attempt));
        return loadServers(attempt + 1);
      }
      setError(e.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleServerClick = (serverId: string) => {
    router.push(`/chat/${serverId}`);
  };

  const handleCreateServer = async (name: string, description: string) => {
    try {
      await serversApi.createServer({ name, description });
      setShowCreateModal(false);
      loadServers();
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la création');
    }
  };

  const handleJoinServer = async (inviteCode: string) => {
    try {
      setShowJoinModal(false);
      const server = await serversApi.joinServerByCode(inviteCode);
      const updated = await serversApi.getServers();
      setServers(updated);
      if (server && server.id) {
        router.push(`/chat/${server.id}`);
      }
    } catch (e: any) {
      if (e?.message?.includes('409') || e?.code === 'HTTP_409') {
        setError('Vous êtes déjà membre de ce serveur');
      } else if (e?.message?.includes('404') || e?.code === 'HTTP_404') {
        setError('Code d\'invitation invalide');
      } else {
        setError(e.message || 'Erreur lors de la connexion au serveur');
      }
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="servers-page">
      <header className="servers-header">
        <h1>Mes serveurs {username && <span style={{ fontSize: '0.9rem', color: '#8e9297', fontWeight: 400 }}>— {username}</span>}</h1>
        <div className="servers-actions">
          <button
            className="btn-primary-red"
            onClick={() => setShowCreateModal(true)}
          >
            + Créer un serveur
          </button>
          <button
            className="btn-secondary"
            onClick={() => setShowJoinModal(true)}
          >
            Rejoindre via code
          </button>
          <button
            onClick={handleLogout}
            title="Se déconnecter"
            style={{
              background: '#2a1010',
              color: '#f87171',
              border: '1px solid #7f1d1d',
              padding: '10px 22px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#dc2626';
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.borderColor = '#dc2626';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#2a1010';
              e.currentTarget.style.color = '#f87171';
              e.currentTarget.style.borderColor = '#7f1d1d';
            }}
          >
            ⏻ Déconnexion
          </button>
        </div>
      </header>

      {error && (
        <div style={{ color: '#ef4444', padding: '8px 16px', background: '#1a1a2e', borderRadius: '8px', margin: '0 0 12px' }}>
          {error}
          <button onClick={() => setError('')} style={{ marginLeft: 8, color: '#aaa' }}>✕</button>
        </div>
      )}

      <div className="servers-content">
        {loading ? (
          <LoadingSkeleton count={3} type="server-card" />
        ) : servers.length === 0 ? (
          <EmptyServers onCreateClick={() => setShowCreateModal(true)} />
        ) : (
          <div className="servers-grid">
            {servers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                onClick={() => handleServerClick(server.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateServerModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateServer}
        />
      )}

      {showJoinModal && (
        <JoinServerModal
          onClose={() => setShowJoinModal(false)}
          onJoin={handleJoinServer}
        />
      )}
    </div>
  );
}
