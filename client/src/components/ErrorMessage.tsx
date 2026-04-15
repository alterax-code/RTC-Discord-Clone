'use client';

import { useTranslations } from 'next-intl';

export default function ErrorMessage({ code }: { code: number }) {
  const t = useTranslations();
  const map: Record<number, string> = {
    403: t('errors.e403'),
    404: t('errors.e404'),
    500: t('errors.e500'),
  };

  return (
    <div className="bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300 px-4 py-3 rounded-md text-sm">
      {map[code] ?? t('errors.unknown')}
    </div>
  );
}
