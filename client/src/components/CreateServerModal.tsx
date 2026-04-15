'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface CreateServerModalProps {
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
}

export default function CreateServerModal({ onClose, onCreate }: CreateServerModalProps) {
  const t = useTranslations();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (name.trim().length < 3) {
      setError(t('servers.name_too_short'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onCreate(name, description);
    } catch (err) {
      setError(t('servers.create_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('servers.create_modal_title')}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="server-name">{t('servers.name_label')}</label>
            <input
              id="server-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('servers.name_placeholder')}
              maxLength={50}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="server-description">{t('servers.description_label')}</label>
            <textarea
              id="server-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('servers.description_placeholder')}
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
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary-red"
              disabled={loading || name.trim().length < 3}
            >
              {loading ? t('servers.creating') : t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
