import '../styles/globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'RTC Project',
  description: 'Real-Time Chat Project',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
      </body>
    </html>
  );
}
