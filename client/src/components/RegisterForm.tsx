'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authApi } from '@/lib/api';

export default function RegisterForm() {
  const router = useRouter();
  const { locale } = useParams();
  const t = useTranslations();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.username || !formData.email || !formData.password || !formData.confirmPassword) {
      setError(t('common.error'));
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError(t('common.error'));
      return;
    }

    setLoading(true);
    try {
      await authApi.register({
        username: formData.username,
        email: formData.email,
        password: formData.password,
      });
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
        <label htmlFor="register-username">Username</label>
        <input
          id="register-username"
          type="text"
          value={formData.username}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          placeholder="JohnDoe"
          disabled={loading}
          required
          minLength={3}
          maxLength={20}
        />
      </div>

      <div className="form-group">
        <label htmlFor="register-email">{t('auth.email')}</label>
        <input
          id="register-email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="votre@email.com"
          disabled={loading}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="register-password">{t('auth.password')}</label>
        <input
          id="register-password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          placeholder="••••••••"
          disabled={loading}
          required
          minLength={6}
        />
      </div>

      <div className="form-group">
        <label htmlFor="register-confirm">{t('auth.password')}</label>
        <input
          id="register-confirm"
          type="password"
          value={formData.confirmPassword}
          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          placeholder="••••••••"
          disabled={loading}
          required
          minLength={6}
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      <button
        type="submit"
        className="btn-primary-red btn-full-width"
        disabled={loading}
      >
        {loading ? t('common.loading') : t('auth.submit_register')}
      </button>
    </form>
  );
}
