'use client';

interface EmptyServersProps {
  onCreateClick: () => void;
}

export default function EmptyServers({ onCreateClick }: EmptyServersProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">🏜️</div>
      <h2>Aucun serveur pour le moment</h2>
      <p>Créez votre premier serveur pour commencer à discuter avec votre équipe</p>
      <button className="btn-primary-red" onClick={onCreateClick}>
        + Créer mon premier serveur
      </button>
    </div>
  );
}