'use client';

import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="home-container">
      <header className="home-header">
        <div className="logo-container">
          <div className="logo">🔴</div>
          <h1>RTC</h1>
        </div>
        <p className="tagline">Votre plateforme de chat temps réel</p>
      </header>

      <div className="home-cta">
        <button 
          className="btn-primary-red"
          onClick={() => router.push('/servers')}
        >
          Accéder à mes serveurs →
        </button>
        <button 
  className="btn-secondary"
  onClick={() => router.push('/login')}  // ✅ Vers /login maintenant
>
  Se connecter
</button>
      </div>

      <section className="features">
        <div className="feature-card">
          <div className="feature-icon">🖥️</div>
          <h3>Serveurs multiples</h3>
          <p>Organisez vos conversations par serveurs thématiques</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">#️⃣</div>
          <h3>Channels organisés</h3>
          <p>Créez des channels pour structurer vos discussions</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">⚡</div>
          <h3>Temps réel</h3>
          <p>Messagerie instantanée avec WebSocket</p>
        </div>
      </section>

      <footer className="home-footer">
        <p>RTC - Real Time Chat Application | Projet T-JSF-600</p>
      </footer>
    </div>
  );
}
