'use client';

import { useEffect } from 'react';

export default function RootPage() {
  useEffect(() => {
    try {
      const token = localStorage.getItem('rtc_auth_token');
      window.location.href = token ? '/servers' : '/login';
    } catch {
      window.location.href = '/login';
    }
  }, []);

  return (
    <div style={{
      height: '100vh',
      background: '#0f0f0f',
    }} />
  );
}
