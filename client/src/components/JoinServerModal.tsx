'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface JoinServerModalProps {
  onClose: () => void;
  onJoin: (inviteCode: string) => void;
}

export default function JoinServerModal({ onClose, onJoin }: JoinServerModalProps) {
  const t = useTranslations();
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (inviteCode.trim().length < 6) {
      setError(t('servers.invite_code_invalid'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onJoin(inviteCode);
    } catch (err) {
      setError(t('servers.join_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('servers.join_modal_title')}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="invite-code">{t('servers.invite_code_label')}</label>
            <input
              id="invite-code"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder={t('servers.invite_code_placeholder')}
              maxLength={20}
              required
              disabled={loading}
              style={{ textTransform: 'uppercase', letterSpacing: '1px' }}
            />
            <small className="form-hint">
              {t('servers.invite_code_hint')}
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
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary-red"
              disabled={loading || inviteCode.trim().length < 6}
            >
              {loading ? t('servers.joining') : t('servers.join')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
