// app/login/page.tsx
'use client';

import { useState } from 'react';
import LoginForm from '@/components/LoginForm';
import RegisterForm from '@/components/RegisterForm';

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  return (
    <div className="auth-page">
      <div className="auth-container">
        {/* Logo et titre */}
        <div className="auth-header">
          <div className="auth-logo">🔴</div>
          <h1>RTC</h1>
          <p className="auth-subtitle">Real Time Chat</p>
        </div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => setActiveTab('login')}
          >
            Connexion
          </button>
          <button
            className={`auth-tab ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => setActiveTab('register')}
          >
            Inscription
          </button>
        </div>

        {/* Forms */}
        <div className="auth-forms">
          {activeTab === 'login' ? <LoginForm /> : <RegisterForm />}
        </div>

        {/* Footer */}
        <div className="auth-footer">
          <p>Projet RTC - T-JSF-600</p>
        </div>
      </div>
    </div>
  );
}