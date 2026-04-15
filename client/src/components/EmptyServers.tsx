'use client';

import { useTranslations } from 'next-intl';

interface EmptyServersProps {
  onCreateClick: () => void;
}

export default function EmptyServers({ onCreateClick }: EmptyServersProps) {
  const t = useTranslations();
  return (
    <div className="empty-state">
      <div className="empty-icon">🏜️</div>
      <h2>{t('servers.empty_title')}</h2>
      <p>{t('servers.empty_subtitle')}</p>
      <button className="btn-primary-red" onClick={onCreateClick}>
        {t('servers.empty_create')}
      </button>
    </div>
  );
}
