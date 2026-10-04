"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { cx } from "@/lib/cx";
import { usePages } from "@/lib/api/hooks/usePages";
import { useSession } from "@/components/shell/SessionProvider";
import { visibleNavGroups } from "@/components/shell/nav-visibility";
import { isActivePath } from "@/lib/shell/isActive";
import { useLogout } from "@/lib/shell/useLogout";
import { SETTINGS_NAV } from "./settings-nav-config";
import "./settings-shell.css";

export function SettingsSidebar() {
  const pathname = usePathname();
  const { logout, error } = useLogout();
  // IZN-F2.2 — yalnız MENÜ süzülür (rota/düğme kapıları ayrı); kural ana kabukla AYNI (`visibleNavGroups`).
  const { me } = useSession();
  const { data: pageCatalog } = usePages();
  const navGroups = useMemo(() => visibleNavGroups(SETTINGS_NAV, me, pageCatalog), [me, pageCatalog]);

  return (
    <aside className="settings-sidebar" aria-label="Ayarlar menüsü">
      <Link href="/" className="settings-sidebar__back">
        ← Gösterge Paneli
      </Link>
      {navGroups.map((group, gi) => (
        <div key={group.heading}>
          <div className="settings-group">
            <div className="settings-group__label">{group.heading}</div>
            <nav className="settings-nav-list">
              {group.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cx("settings-nav-item", active && "settings-nav-item--active")}
                    aria-current={active ? "page" : undefined}
                  >
                    <span aria-hidden="true">{item.emoji}</span> {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          {gi < navGroups.length - 1 && <div className="settings-divider" />}
        </div>
      ))}
      <div className="settings-divider" />
      <button type="button" className="settings-logout" onClick={logout}>
        🚪 Çıkış Yap
      </button>
      {error !== null && (
        <p role="alert" className="settings-logout__error">
          {error}
        </p>
      )}
    </aside>
  );
}
