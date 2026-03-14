'use client';

import { useState } from 'react';

interface CreateServerModalProps {
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
}

export default function CreateServerModal({ onClose, onCreate }: CreateServerModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (name.trim().length < 3) {
      setError('Le nom doit contenir au moins 3 caractères');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onCreate(name, description);
    } catch (err) {
      setError('Erreur lors de la création du serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Créer un serveur</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="server-name">Nom du serveur *</label>
            <input
              id="server-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mon super serveur"
              maxLength={50}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="server-description">Description (optionnel)</label>
            <textarea
              id="server-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description de votre serveur..."
              maxLength={200}
              rows={3}
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
              disabled={loading || name.trim().length < 3}
            >
              {loading ? 'Création...' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}