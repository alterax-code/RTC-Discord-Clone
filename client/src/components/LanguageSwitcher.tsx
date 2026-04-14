'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';

export default function LanguageSwitcher() {
  const { locale } = useParams();
  const pathname = usePathname();
  const router = useRouter();

  const toggleLocale = () => {
    const nextLocale = locale === 'fr' ? 'en' : 'fr';
    // Remplace /fr/... par /en/... ou l'inverse
    const newPath = pathname.replace(`/${locale}`, `/${nextLocale}`);
    router.push(newPath);
  };

  return (
    <button
      onClick={toggleLocale}
      style={{
        background: 'none',
        border: '1px solid #3f4147',
        color: '#b5bac1',
        borderRadius: '6px',
        padding: '4px 10px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 600,
      }}
    >
      {locale === 'fr' ? '🇬🇧 EN' : '🇫🇷 FR'}
    </button>
  );
}
