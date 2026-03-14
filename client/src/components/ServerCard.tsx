'use client';

interface ServerCardProps {
  server: {
    id: string;
    name: string;
    description?: string;
    icon?: string;
  };
  onClick: () => void;
}

export default function ServerCard({ server, onClick }: ServerCardProps) {
  return (
    <div className="server-card" onClick={onClick}>
      <div className="server-icon">
        {server.icon || server.name.charAt(0).toUpperCase()}
      </div>
      <div className="server-info">
        <h3>{server.name}</h3>
        {server.description && (
          <p className="server-members">{server.description}</p>
        )}
      </div>
      <button className="server-open-btn">
        Ouvrir →
      </button>
    </div>
  );
}
