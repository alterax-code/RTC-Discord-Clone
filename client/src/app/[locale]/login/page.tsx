'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import LoginForm from '@/components/LoginForm';
import RegisterForm from '@/components/RegisterForm';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(
    searchParams.get('tab') === 'register' ? 'register' : 'login'
  );
  const t = useTranslations();

  const handleTabChange = (tab: 'login' | 'register') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `?tab=${tab}`);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">🔴</div>
          <h1>RTC</h1>
          <p className="auth-subtitle">Real Time Chat</p>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => handleTabChange('login')}
          >
            {t('auth.login')}
          </button>
          <button
            className={`auth-tab ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => handleTabChange('register')}
          >
            {t('auth.register')}
          </button>
        </div>

        <div className="auth-forms">
          {activeTab === 'login' ? <LoginForm /> : <RegisterForm />}
        </div>

        <div className="auth-footer">
          <LanguageSwitcher />
          <p>Projet RTC - T-JSF-600</p>
        </div>
      </div>
    </div>
  );
}
