'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import DMList from '@/components/DMList';
import { getAuthToken, getCurrentUser } from '@/lib/auth';

export default function DMPage() {
  const { locale } = useParams();
  const router = useRouter();
  const t = useTranslations();
  const token = getAuthToken() || '';
  const user = getCurrentUser();

  const handleSelectDM = (dmId: string) => {
    router.push(`/${locale}/dm/${dmId}`);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#313338' }}>
      <DMList
        token={token}
        currentUserId={user?.id || ''}
        onSelectDM={handleSelectDM}
      />
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#8e9297', fontSize: '16px', flexDirection: 'column', gap: '8px',
      }}>
        <p>💬 {t('dm.select')}</p>
      </div>
    </div>
  );
}
