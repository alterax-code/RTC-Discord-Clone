'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface Channel {
  id: string;
  name: string;
  serverId: string;
}

interface ChannelsListProps {
  channels: Channel[];
  selectedChannelId: string;
  onChannelSelect: (channelId: string) => void;
  serverName: string;
  onCreateChannel?: (name: string) => void;
  onDeleteChannel?: (channelId: string) => void;
  onRenameChannel?: (channelId: string, newName: string) => void;
  userRole?: 'owner' | 'admin' | 'member';
  defaultChannelId?: string;
  className?: string;
  onClose?: () => void;
}

function ChannelMenu({
  channel, onRename, onDelete, isDefault,
}: {
  channel: Channel;
  onRename: () => void;
  onDelete: () => void;
  isDefault: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const t = useTranslations();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '8px',
    width: '100%', padding: '10px 14px', background: 'none',
    border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px',
  };

  return (
    <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        title={t('common.options')}
        style={{
          background: 'none', border: 'none', color: '#8e9297',
          cursor: 'pointer', fontSize: '18px', padding: '0 4px',
          lineHeight: 1, borderRadius: '4px', display: 'flex', alignItems: 'center',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
        onMouseLeave={e => (e.currentTarget.style.color = '#8e9297')}
      >
        ⋯
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: '4px',
          background: '#111214', border: '1px solid #3f4147',
          borderRadius: '6px', minWidth: '160px', zIndex: 999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}>
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onRename(); }}
            style={{ ...itemStyle, color: '#dcddde' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#5865f2')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            ✏️ {t('chat.rename')}
          </button>

          {!isDefault && (
            <>
              <div style={{ height: '1px', background: '#3f4147', margin: '2px 0' }} />
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}
                style={{ ...itemStyle, color: '#ed4245' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#ed4245'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#ed4245'; }}
              >
                🗑️ {t('common.delete')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChannelsList({
  channels, selectedChannelId, onChannelSelect, serverName,
  onCreateChannel, onDeleteChannel, onRenameChannel,
  userRole, defaultChannelId, className = '', onClose,
}: ChannelsListProps) {
  const t = useTranslations();
  const [showInput, setShowInput] = useState(false);
  const [newName, setNewName] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const canManage = userRole === 'owner' || userRole === 'admin';

  const handleCreate = () => {
    const name = newName.trim();
    if (name && onCreateChannel) { onCreateChannel(name); setNewName(''); setShowInput(false); }
  };

  const handleStartRename = (channelId: string, currentName: string) => {
    setEditingId(channelId);
    setEditName(currentName);
  };

  const handleRename = (channelId: string) => {
    const name = editName.trim();
    if (name && name.length <= 100 && onRenameChannel) onRenameChannel(channelId, name);
    setEditingId(null);
    setEditName('');
  };

  const handleDelete = (channelId: string, channelName: string) => {
    if (!onDeleteChannel) return;
    if (!confirm(t('chat.delete_channel_confirm', { name: channelName }))) return;
    onDeleteChannel(channelId);
  };

  return (
    <div className={`channels-list ${className}`}>
      <div className="channels-header">
        <h2 title={serverName}>{serverName}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <button className="server-dropdown">▼</button>
          {onClose && (
            <button className="channels-close-btn" onClick={onClose} title={t('common.close')}>✕</button>
          )}
        </div>
      </div>

      <div className="channels-content">
        <div className="channels-section">
          <div className="section-header">
            <span className="section-title">{t('chat.text_channels')}</span>
            {canManage && (
              <button className="add-channel-btn" title={t('chat.create_channel_title')}
                onClick={() => setShowInput(!showInput)}>+</button>
            )}
          </div>

          {showInput && canManage && (
            <div className="create-channel-form">
              <div className="create-channel-label">{t('chat.new_channel')}</div>
              <input
                type="text" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') { setShowInput(false); setNewName(''); }
                }}
                placeholder={t('chat.channel_name_placeholder')} autoFocus className="create-channel-input"
              />
              <div className="create-channel-actions">
                <button onClick={handleCreate} className="create-channel-btn-confirm">{t('common.create')}</button>
                <button onClick={() => { setShowInput(false); setNewName(''); }}
                  className="create-channel-btn-cancel">{t('common.cancel')}</button>
              </div>
            </div>
          )}

          <div className="channels-items">
            {channels.map((channel) => {
              const isDefault = defaultChannelId
                ? channel.id === defaultChannelId
                : channel.id === channels[0]?.id;

              return (
                <div
                  key={channel.id}
                  className={`channel-item ${selectedChannelId === channel.id ? 'active' : ''}`}
                  onClick={() => editingId !== channel.id && onChannelSelect(channel.id)}
                  onMouseEnter={() => setHoveredId(channel.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{ position: 'relative' }}
                >
                  <span className="channel-hash">#</span>

                  {editingId === channel.id ? (
                    <input
                      autoFocus value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => handleRename(channel.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(channel.id);
                        if (e.key === 'Escape') { setEditingId(null); setEditName(''); }
                      }}
                      onClick={e => e.stopPropagation()}
                      style={{
                        flex: 1, minWidth: 0, background: '#1e1f22',
                        border: '1px solid #5865f2', borderRadius: '4px',
                        color: '#fff', fontSize: '14px', padding: '2px 6px', outline: 'none',
                      }}
                    />
                  ) : (
                    <span className="channel-name" style={{
                      flex: 1, minWidth: 0, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {channel.name}
                    </span>
                  )}

                  {canManage && hoveredId === channel.id && editingId !== channel.id && (
                    <ChannelMenu
                      channel={channel}
                      isDefault={isDefault}
                      onRename={() => handleStartRename(channel.id, channel.name)}
                      onDelete={() => handleDelete(channel.id, channel.name)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
