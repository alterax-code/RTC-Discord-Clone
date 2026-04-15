'use client';

import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';

export default function LanguageSwitcher() {
  const { locale } = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const toggleLocale = () => {
    const nextLocale = locale === 'fr' ? 'en' : 'fr';
    const newPath = pathname.replace(`/${locale}`, `/${nextLocale}`);
    const search = searchParams.toString();
    router.push(search ? `${newPath}?${search}` : newPath);
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
      {locale === 'fr' ? 'EN' : 'FR'}
    </button>
  );
}
