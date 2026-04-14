'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function RootPage() {
  const { locale } = useParams();

  useEffect(() => {
    try {
      const token = localStorage.getItem('rtc_auth_token');
      window.location.href = token ? `/${locale}/servers` : `/${locale}/login`;
    } catch {
      window.location.href = `/${locale}/login`;
    }
  }, [locale]);

  return (
    <div style={{
      height: '100vh',
      background: '#0f0f0f',
    }} />
  );
}
