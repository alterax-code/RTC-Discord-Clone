"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { serversApi } from "@/lib/api";
import { getCurrentUser, logout } from "@/lib/auth";
import { Server } from "@/lib/types";

interface ServersBarProps {
  currentServerId?: string;
}

export default function ServersBar({ currentServerId }: ServersBarProps) {
  const router = useRouter();
  const { locale } = useParams();
  const t = useTranslations();
  const [servers, setServers] = useState<Server[]>([]);
  const currentUser = getCurrentUser();

  useEffect(() => {
    serversApi
      .getServers()
      .then(setServers)
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    logout();
    router.push(`/${locale}/login`);
  };

  const handleBack = () => {
    router.push(`/${locale}/servers`);
  };

  return (
    <aside className="servers-bar">
      {/* ===== LOGO / BOUTON RETOUR ===== */}
      <div className="servers-bar-header">
        <button
          className="sb-btn-back"
          onClick={handleBack}
          title={t('nav.back_to_servers')}
          aria-label={t('nav.back')}
        >
          <span className="sb-back-arrow">&#8592;</span>
        </button>
      </div>

      <div className="sb-divider" />

      {/* ===== BULLES SERVEURS ===== */}
      <div className="sb-servers-list">
        {servers.map((server) => {
          const isActive = server.id === currentServerId;
          const initials = server.name.slice(0, 2).toUpperCase();
          return (
            <div key={server.id} className="sb-server-item">
              {isActive && <div className="sb-active-pill" />}
              <button
                className={`sb-server-bubble ${isActive ? "active" : ""}`}
                onClick={() => router.push(`/${locale}/chat/${server.id}`)}
                title={server.name}
              >
                {initials}
              </button>
              <div className="sb-tooltip">{server.name}</div>
            </div>
          );
        })}
      </div>

      {/* ===== FOOTER : USER + LOGOUT ===== */}
      <div className="sb-footer">
        <div className="sb-divider" />

        {/* Avatar utilisateur */}
        {currentUser && (
          <div
            className="sb-user-bubble"
            title={currentUser.username || currentUser.email}
          >
            {(currentUser.username || currentUser.email || "?")
              .charAt(0)
              .toUpperCase()}
          </div>
        )}

        {/* Bouton déconnexion */}
        <button
          className="sb-btn sb-btn-logout"
          onClick={handleLogout}
          title={t('nav.logout')}
        >
          <span className="sb-btn-icon">⏻</span>
        </button>
      </div>
    </aside>
  );
}
