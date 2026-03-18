import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import fr from './locales/fr.json';
import en from './locales/en.json';

const allMessages = { fr, en };
const locales = ['fr', 'en'] as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(locales, requested) ? requested : 'fr';

  return {
    locale,
    messages: allMessages[locale],
  };
});
