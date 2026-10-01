"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";
import { initials } from "@/lib/shell/initials";
import { useLogout } from "@/lib/shell/useLogout";
import { LockIcon } from "@/components/ui/icons";
import { activeNavHref, NAV_GROUPS } from "./nav-config";
import { useSession } from "./SessionProvider";
import { UnsavedTabGuardModal } from "./workspace-tabs/UnsavedTabGuardModal";
import { useWorkspaceTabsController } from "./workspace-tabs/useWorkspaceTabsController";
import "./sidebar.css";
// GLS-F1 GEÇİCİ — Geliştirme sayfası silinince kaldır
import { canSeeGelistirme, GELISTIRME_NAV_LABEL, gelistirmeHref } from "@/app/(app)/gelistirme/erisim";
import { isActivePath } from "@/lib/shell/isActive";
import { ListIcon } from "@/components/ui/icons";
import { routes } from "@/lib/routes";

/** Tarayıcının kendi davranışına bırakılan tıklar (yeni pencere, indirme, orta tuş). */
function isPlainPrimaryClick(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { me } = useSession();
  // SEKME-F1.4a — nav öğesine DÜZ tık çalışma sekmesi kuralıyla yürür
  // (KARARLAR §1.10 (3)): açık modül öne gelir (hatırlanan adresiyle), aktif
  // modül köküne döner, kapalı modül yeni sekmede açılır; aktif sekme
  // değişecekse ve kaydedilmemiş veri varsa önce onay. Ctrl/Cmd/orta tık
  // belge düzeyi yakalayıcıdadır (`useTabLinkCapture`) — burada ELLENMEZ.
  const tabs = useWorkspaceTabsController();
  function handleNavClick(event: React.MouseEvent<HTMLAnchorElement>, href: string): void {
    // Oturum gelmeden mağaza kullanıcıya iliştirilmemiştir: düz Link gezinmesi.
    if (!tabs.isReady || !isPlainPrimaryClick(event)) return;
    event.preventDefault();
    tabs.openFromSidebar(href);
  }
  // 🔴 KAYIT NO 297 — çıkış mantığı `useLogout` (src/lib/shell/useLogout.ts)
  // ortak kancasında yaşar: ne `response.ok` kontrolsüz ne `try/catch`siz
  // bırakılır (aksi hâlde sunucu oturumu kapatamasa bile kullanıcı "çıktım"
  // sanır, ya da ağ hatası yakalanmamış bir promise reddi olarak kalır).
  // Ayarlar sidebar/breadcrumb ile TEK mantık paylaşılır (DRY).
  const { logout: handleLogout, error: logoutError } = useLogout();
  // ⚠️ Aktiflik SATIR BAŞINA değil, nav'ın TAMAMINA bakılarak seçilir:
  // `/hazine/cek-senet` yolunda `/hazine` de eşleşir ve iki öğe birden yanardı
  // (bkz. `activeNavHref` notu).
  const currentHref = activeNavHref(pathname);

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {/* GLS-F1 GEÇİCİ — Geliştirme sayfası silinince kaldır. Yalnız system_admin;
            değilse DOM'a HİÇBİR şey eklenmez. NAV_GROUPS dışındadır (bekçiler etkilenmez). */}
        {canSeeGelistirme(me) && (
          <div className="sidebar-group">
            <Link
              href={gelistirmeHref()}
              className={cx("sidebar-item", isActivePath(pathname, gelistirmeHref()) && "sidebar-item--active")}
              aria-current={isActivePath(pathname, gelistirmeHref()) ? "page" : undefined}
              onClick={(event) => handleNavClick(event, gelistirmeHref())}
            >
              <ListIcon width={16} height={16} className="sidebar-item__icon" />
              <span>{GELISTIRME_NAV_LABEL}</span>
            </Link>
          </div>
        )}
        {NAV_GROUPS.map((group) => (
          <div key={group.heading} className="sidebar-group">
            <div className="sidebar-group__heading">{group.heading}</div>
            {group.items.map(({ label, href, Icon }) => {
              const active = href === currentHref;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cx("sidebar-item", active && "sidebar-item--active")}
                  aria-current={active ? "page" : undefined}
                  onClick={(event) => handleNavClick(event, href)}
                >
                  <Icon width={16} height={16} className="sidebar-item__icon" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-user">
        <Link href={routes.settings.root()} className="sidebar-user__row">
          <span className="sidebar-user__avatar" aria-hidden="true">{me ? initials(me.full_name) : ""}</span>
          <span className="sidebar-user__meta">
            <span className="sidebar-user__name">{me?.full_name ?? ""}</span>
            <span className="sidebar-user__role">{me?.title ?? ""}</span>
          </span>
          <LockIcon className="sidebar-user__lock" />
        </Link>
        <div className="sidebar-user__actions">
          <Link href={routes.settings.root()} className="sidebar-user__btn">
            <span aria-hidden="true">⚙️</span> Ayarlar
          </Link>
          <button type="button" className="sidebar-user__btn sidebar-user__btn--logout" onClick={handleLogout}>
            <span aria-hidden="true">🚪</span> Çıkış
          </button>
        </div>
        {logoutError !== null && (
          <p role="alert" className="sidebar-user__error">
            {logoutError}
          </p>
        )}
      </div>
      <UnsavedTabGuardModal
        isOpen={tabs.guard.isOpen}
        labels={tabs.guard.labels}
        onCancel={tabs.guard.cancel}
        onDiscard={tabs.guard.confirm}
      />
    </aside>
  );
}
