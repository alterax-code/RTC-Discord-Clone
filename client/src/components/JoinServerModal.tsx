'use client';

import { useState } from 'react';

interface JoinServerModalProps {
  onClose: () => void;
  onJoin: (inviteCode: string) => void;
}

export default function JoinServerModal({ onClose, onJoin }: JoinServerModalProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (inviteCode.trim().length < 6) {
      setError('Le code d\'invitation est invalide');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onJoin(inviteCode);
    } catch (err) {
      setError('Code invalide ou serveur introuvable');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Rejoindre un serveur</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="invite-code">Code d'invitation *</label>
            <input
              id="invite-code"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="ABC123XYZ"
              maxLength={20}
              required
              disabled={loading}
              style={{ textTransform: 'uppercase', letterSpacing: '1px' }}
            />
            <small className="form-hint">
              Demandez le code d'invitation à un administrateur du serveur
            </small>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={onClose}
              disabled={loading}
            >
              Annuler
            </button>
            <button 
              type="submit" 
              className="btn-primary-red"
              disabled={loading || inviteCode.trim().length < 6}
            >
              {loading ? 'Connexion...' : 'Rejoindre'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}