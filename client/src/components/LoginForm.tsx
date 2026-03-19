'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authApi } from '@/lib/api';

export default function LoginForm() {
  const router = useRouter();
  const { locale } = useParams();
  const t = useTranslations();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.email || !formData.password) {
      setError(t('common.error'));
      return;
    }

    setLoading(true);
    try {
      await authApi.login(formData);
      router.push(`/${locale}/servers`);
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="login-email">{t('auth.email')}</label>
        <input
          id="login-email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="votre@email.com"
          disabled={loading}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="login-password">{t('auth.password')}</label>
        <input
          id="login-password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          placeholder="••••••••"
          disabled={loading}
          required
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      <button
        type="submit"
        className="btn-primary-red btn-full-width"
        disabled={loading}
      >
        {loading ? t('common.loading') : t('auth.submit_login')}
      </button>
    </form>
  );
}
