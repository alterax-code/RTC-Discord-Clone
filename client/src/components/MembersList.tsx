'use client';

import BanModal from './BanModal';
import { useState, useRef, useEffect } from 'react';

interface Member {
  id: string;
  username: string;
  role: 'owner' | 'admin' | 'member';
  online: boolean;
}

interface MembersListProps {
  members: Member[];
  typingUserIds?: Set<string>;
  currentUserId?: string;
  currentUserRole?: 'owner' | 'admin' | 'member';
  serverId?: string;
  onUpdateRole?: (userId: string, newRole: string) => void;
}

const roleIcons: Record<string, string> = {
  owner: '👑',
  admin: '🛡️',
  member: '',
};

const roleColors: Record<string, string> = {
  owner: '#f0b132',
  admin: '#99aab5',
  member: '#a3a3a3',
};

function TypingDots() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '6px', gap: '2px' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: '4px', height: '4px', borderRadius: '50%',
          backgroundColor: '#5865f2', display: 'inline-block',
          animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
      <style>{`@keyframes typingBounce { 0%,60%,100%{transform:translateY(0);opacity:0.4} 30%{transform:translateY(-4px);opacity:1} }`}</style>
    </span>
  );
}

// ── Menu ⋯ pour un membre ──
function MemberMenu({
  member, currentUserRole, onUpdateRole, onKick, onBanClick,
}: {
  member: Member;
  currentUserRole?: string;
  onUpdateRole?: (userId: string, newRole: string) => void;
  onKick?: (userId: string) => void;
  onBanClick?: (member: Member) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    width: '100%', padding: '9px 14px', background: 'none',
    border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '13px',
  };

  const canPromoteToAdmin = currentUserRole === 'owner' && member.role === 'member';
  const canDemoteToMember = currentUserRole === 'owner' && member.role === 'admin';
  const canTransfer = currentUserRole === 'owner' && member.role !== 'owner';

  if (!canPromoteToAdmin && !canDemoteToMember && !canTransfer) return null;

  return (
    <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        title="Options"
        style={{
          background: 'none', border: 'none', color: '#8e9297',
          cursor: 'pointer', fontSize: '18px', padding: '0 4px',
          lineHeight: 1, borderRadius: '4px',
          opacity: 0, transition: 'opacity 0.1s',
        }}
        className="member-menu-btn"
      >
        ⋯
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: '4px',
          background: '#111214', border: '1px solid #3f4147',
          borderRadius: '6px', minWidth: '180px', zIndex: 999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}>
          {/* Rôles */}
          {canPromoteToAdmin && (
            <button
              onClick={() => { setOpen(false); onUpdateRole?.(member.id, 'admin'); }}
              style={{ ...itemStyle, color: '#99aab5' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#5865f2', e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none', e.currentTarget.style.color = '#99aab5')}
            >
              🛡️ Promouvoir Admin
            </button>
          )}
          {canDemoteToMember && (
            <button
              onClick={() => { setOpen(false); onUpdateRole?.(member.id, 'member'); }}
              style={{ ...itemStyle, color: '#dcddde' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#5865f2', e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none', e.currentTarget.style.color = '#dcddde')}
            >
              👤 Rétrograder Membre
            </button>
          )}
          {canTransfer && (
            <>
            
                {/* Kick */}
              {(currentUserRole === 'owner' || currentUserRole === 'admin') && member.role !== 'owner' && (
                <>
                  <div style={{ height: '1px', background: '#3f4147', margin: '2px 0' }} />
                  <button
                    onClick={() => { setOpen(false); onKick?.(member.id); }}
                    style={{ ...itemStyle, color: '#ed4245' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#ed424520')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    👢 Expulser
                  </button>
                  <button
                    onClick={() => { setOpen(false); onBanClick?.(member); }}
                    style={{ ...itemStyle, color: '#ed4245' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#ed424520')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    🔨 Bannir
                  </button>
                </>
              )}
              <div style={{ height: '1px', background: '#3f4147', margin: '2px 0' }} />
              <button
                onClick={() => {
                  setOpen(false);
                  if (confirm(`Transférer la propriété à ${member.username} ?`))
                    onUpdateRole?.(member.id, 'owner');
                }}
                style={{ ...itemStyle, color: '#f0b132' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f0b13220')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                👑 Transférer ownership
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function MembersList({
  members, typingUserIds, currentUserId, currentUserRole, onUpdateRole,
}: MembersListProps) {
  const typing = typingUserIds || new Set<string>();
  const onlineMembers = members.filter(m => m.online);
  const offlineMembers = members.filter(m => !m.online);

  const renderMember = (member: Member) => {
    const isTyping = typing.has(member.id);
    const isMe = member.id === currentUserId;
    const canManageThis = currentUserRole === 'owner' && !isMe && member.role !== 'owner';

    return (
      <div
        key={member.id}
        className="member-item"
        style={{ position: 'relative' }}
      >
        <div className={`member-status ${member.online ? 'online' : 'offline'}`} />
        <span
          className={`member-name ${!member.online ? 'offline-name' : ''}`}
          style={{
            color: member.online ? roleColors[member.role] : undefined,
            display: 'flex', alignItems: 'center', flex: 1, minWidth: 0,
          }}
        >
          {roleIcons[member.role]} {member.username}

          {isTyping && <TypingDots />}
        </span>

        {/* Menu ⋯ visible au hover si on peut gérer ce membre */}
        {canManageThis && (
          <span className="member-actions">
            <MemberMenu
              member={member}
              currentUserRole={currentUserRole}
              onUpdateRole={onUpdateRole}
            />
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="members-list">
      <style>{`
        .member-item:hover .member-actions .member-menu-btn { opacity: 1 !important; }
        .member-actions { display: flex; align-items: center; }
      `}</style>

      <div className="members-header">
        <span className="members-count">MEMBRES — {members.length}</span>
      </div>

      <div className="members-content">
        {onlineMembers.length > 0 && (
          <div className="members-section">
            <div className="section-title">EN LIGNE — {onlineMembers.length}</div>
            {onlineMembers.map(renderMember)}
          </div>
        )}
        {offlineMembers.length > 0 && (
          <div className="members-section">
            <div className="section-title">HORS LIGNE — {offlineMembers.length}</div>
            {offlineMembers.map(renderMember)}
          </div>
        )}
      </div>
    </div>
  );
}
