"use client";

import { useEffect, useId, useRef, useState } from "react";

import { initials } from "@/lib/shell/initials";
import { summarizeDisciplines } from "@/lib/shell/disciplineSummary";
import type { MeResponse } from "@/lib/auth/types";
import "./user-menu.css";

interface UserMenuProps {
  me: MeResponse | null;
  /** Mevcut çıkış akışı (`useLogout().logout`) — burada YENİ çıkış mantığı yok. */
  onLogout: () => Promise<void> | void;
  logoutError: string | null;
}

/**
 * Üst çubuk avatarı + açılır kullanıcı kartı — mockup "Kısıtlı kullanıcının
 * kendi gördüğü" (Ayarlar - Kullanıcı Disiplin Ataması.dc.html 255-275).
 * YALNIZ ad · rol · "Disiplin: …" · Çıkış Yap (mockup'taki Profilim/Bildirim
 * tercihleri kullanıcı kararıyla EKLENMEDİ).
 *
 * Davranış `TabContextMenu` deseninde: Esc + dış `mousedown` kapatır (tıklama
 * dinleyici kurulmadan biter), açılışta ilk öğeye odak, Esc'te odak tetikleyiciye döner.
 */
export function UserMenu({ me, onLogout, logoutError }: UserMenuProps) {
  const [isOpen, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const avatar = me ? initials(me.full_name) : "";
  const discipline = summarizeDisciplines(me?.disciplines);

  useEffect(() => {
    if (!isOpen) return;
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [isOpen]);

  return (
    <div
      className={isOpen ? "topbar-user topbar-user--open" : "topbar-user"}
      ref={rootRef}
      onBlur={(event) => {
        // Tab ile odak kartın DIŞINA çıkınca kapanır. `relatedTarget` null iken
        // (kart içindeki metne tıklama / pencere dışı) KAPANMAZ.
        const next = event.relatedTarget;
        if (isOpen && next instanceof Node && !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="topbar-avatar"
        aria-label="Kullanıcı menüsü"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        disabled={me === null}
        onClick={() => setOpen((open) => !open)}
      >
        {avatar}
      </button>
      {isOpen && me !== null && (
        <div id={menuId} className="user-menu">
          {/* Bilgi başlığı menü rolünün DIŞINDA: `role="menu"` yalnız menü öğelerini sarar. */}
          <div className="user-menu__head">
            <span className="user-menu__avatar" aria-hidden="true">
              {avatar}
            </span>
            <span className="user-menu__who">
              <span className="user-menu__name">{me.full_name}</span>
              <span className="user-menu__role">{me.title}</span>
              <span className="user-menu__discipline">
                <span
                  className="user-menu__dot"
                  aria-hidden="true"
                  style={discipline.color === null ? undefined : { backgroundColor: discipline.color }}
                />
                <span className="user-menu__discipline-text">
                  Disiplin: <b>{discipline.label}</b>
                </span>
              </span>
            </span>
          </div>
          <div className="user-menu__rule" aria-hidden="true" />
          <div role="menu" aria-label="Kullanıcı menüsü">
            <button type="button" role="menuitem" className="user-menu__logout" onClick={() => void onLogout()}>
              Çıkış Yap
            </button>
          </div>
          {logoutError !== null && (
            <p role="alert" className="user-menu__error">
              {logoutError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
