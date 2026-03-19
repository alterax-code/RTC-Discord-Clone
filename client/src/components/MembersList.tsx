'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';

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

function MemberMenu({
  member, currentUserRole, onUpdateRole,
}: {
  member: Member;
  currentUserRole?: string;
  onUpdateRole?: (userId: string, newRole: string) => void;
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
    width: '100%', padding: '9px 14px', background: 'none',
    border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '13px',
    whiteSpace: 'nowrap',
  };

  const canPromoteToAdmin = currentUserRole === 'owner' && member.role === 'member';
  const canDemoteToMember = currentUserRole === 'owner' && member.role === 'admin';
  const canTransfer = currentUserRole === 'owner' && member.role !== 'owner';

  if (!canPromoteToAdmin && !canDemoteToMember && !canTransfer) return null;

  return (
    <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
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

      {/* ★ FIX: Dropdown en position fixed pour ne jamais être coupé */}
      {open && (
        <div style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: '#111214', border: '1px solid #3f4147',
          borderRadius: '8px', minWidth: '220px', zIndex: 9999,
          boxShadow: '0 12px 40px rgba(0,0,0,0.8)', overflow: 'hidden',
          padding: '4px 0',
        }}>
          {/* Header du menu */}
          <div style={{
            padding: '8px 14px', fontSize: '11px', fontWeight: 700,
            color: '#8e9297', textTransform: 'uppercase', letterSpacing: '0.5px',
            borderBottom: '1px solid #3f4147',
          }}>
            Gérer {member.username}
          </div>

          {canPromoteToAdmin && (
            <button
              onClick={() => { setOpen(false); onUpdateRole?.(member.id, 'admin'); }}
              style={{ ...itemStyle, color: '#99aab5' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#5865f2', e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none', e.currentTarget.style.color = '#99aab5')}
            >
              🛡️ {t('members.promote_admin')}
            </button>
          )}
          {canDemoteToMember && (
            <button
              onClick={() => { setOpen(false); onUpdateRole?.(member.id, 'member'); }}
              style={{ ...itemStyle, color: '#dcddde' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#5865f2', e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none', e.currentTarget.style.color = '#dcddde')}
            >
              👤 {t('members.demote_member')}
            </button>
          )}
          {canTransfer && (
            <>
              <div style={{ height: '1px', background: '#3f4147', margin: '2px 0' }} />
              <button
                onClick={() => {
                  setOpen(false);
                  if (confirm(t('members.transfer_confirm', { username: member.username })))
                    onUpdateRole?.(member.id, 'owner');
                }}
                style={{ ...itemStyle, color: '#f0b132' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f0b13220')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                👑 {t('members.transfer_owner')}
              </button>
            </>
          )}

          {/* Bouton fermer */}
          <div style={{ height: '1px', background: '#3f4147', margin: '2px 0' }} />
          <button
            onClick={() => setOpen(false)}
            style={{ ...itemStyle, color: '#8e9297', justifyContent: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#2b2d31')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            Annuler
          </button>
        </div>
      )}

      {/* ★ Backdrop sombre quand le menu est ouvert */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.4)',
          }}
        />
      )}
    </div>
  );
}

export default function MembersList({
  members, typingUserIds, currentUserId, currentUserRole, onUpdateRole,
}: MembersListProps) {
  const t = useTranslations();
  const typing = typingUserIds || new Set<string>();
  const onlineMembers = members.filter(m => m.online);
  const offlineMembers = members.filter(m => !m.online);

  const renderMember = (member: Member) => {
    const isTyping = typing.has(member.id);
    const isMe = member.id === currentUserId;
    const canManageThis = currentUserRole === 'owner' && !isMe && member.role !== 'owner';

    return (
      <div key={member.id} className="member-item" style={{ position: 'relative' }}>
        <div className={`member-status ${member.online ? 'online' : 'offline'}`} />
        <span
          className={`member-name ${!member.online ? 'offline-name' : ''}`}
          style={{ color: member.online ? roleColors[member.role] : undefined, display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}
        >
          {roleIcons[member.role]} {member.username}
          {isTyping && <TypingDots />}
        </span>
        {canManageThis && (
          <span className="member-actions">
            <MemberMenu member={member} currentUserRole={currentUserRole} onUpdateRole={onUpdateRole} />
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
        <span className="members-count">{t('members.title')} — {members.length}</span>
      </div>

      <div className="members-content">
        {onlineMembers.length > 0 && (
          <div className="members-section">
            <div className="section-title">{t('members.online')} — {onlineMembers.length}</div>
            {onlineMembers.map(renderMember)}
          </div>
        )}
        {offlineMembers.length > 0 && (
          <div className="members-section">
            <div className="section-title">{t('members.offline')} — {offlineMembers.length}</div>
            {offlineMembers.map(renderMember)}
          </div>
        )}
      </div>
    </div>
  );
}
