'use client';

interface ChatHeaderProps {
  channelName: string;
}

export default function ChatHeader({ channelName }: ChatHeaderProps) {
  return (
    <div className="chat-header">
      <div className="chat-header-left">
        <span className="channel-hash">#</span>
        <h1 className="channel-title">{channelName}</h1>
      </div>
      
      <div className="chat-header-right">
        <button className="header-icon-btn" title="Membres">👥</button>
        <button className="header-icon-btn" title="Rechercher">🔍</button>
        <button className="header-icon-btn" title="Paramètres">⚙️</button>
      </div>
    </div>
  );
}