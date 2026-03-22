'use client';

import { useState } from 'react';

interface BanModalProps {
  member: { id: string; username: string };
  serverId: string;
  onClose: () => void;
  onBan: (userId: string, reason: string, durationHours: number | null) => void;
}

export default function BanModal({ member, serverId, onClose, onBan }: BanModalProps) {
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const durationHours = duration ? parseInt(duration) : null;
      await onBan(member.id, reason, durationHours);
      onClose();
    } catch (err) {
      setError('Erreur lors du bannissement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Bannir {member.username}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="ban-reason">Raison (optionnel)</label>
            <input
              id="ban-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Raison du bannissement..."
              maxLength={200}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="ban-duration">
              Durée en heures (laisser vide = ban permanent)
            </label>
            <input
              id="ban-duration"
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Ex: 24 pour 24h, vide = permanent"
              min={1}
              disabled={loading}
            />
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
              disabled={loading}
            >
              {loading ? 'Bannissement...' : 'Bannir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
