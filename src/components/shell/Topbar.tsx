"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { BellIcon } from "@/components/ui/icons";
import { initials } from "@/lib/shell/initials";
import { isActivePath } from "@/lib/shell/isActive";
import { routes } from "@/lib/routes";
import { useLogout } from "@/lib/shell/useLogout";
import { TopbarBreadcrumb } from "./breadcrumb/TopbarBreadcrumb";
import { useSession } from "./SessionProvider";
import { WorkspaceTabsBar } from "./workspace-tabs/WorkspaceTabsBar";
import "./topbar.css";

// 🔴 F1.7a-ÖNERİ-A: Ayarlar altında topbar'da beliren "Çıkış Yap" (rapor v6
// "-a" karesi). "-b" alternatifi (Ayarlar sidebar'ının altındaki mevcut
// `.settings-logout` düğmesi, `SettingsSidebar.tsx`) KOD DEĞİŞİKLİĞİ
// GEREKTİRMEDEN zaten var — iki alternatif de ekranda AYNI ANDA görünür,
// seçim kullanıcıya bırakıldı (rapora bkz.).
const SETTINGS_ROOT = routes.settings.root();

export default function Topbar() {
  const { me } = useSession();
  const avatar = me ? initials(me.full_name) : "";
  const pathname = usePathname() ?? "/";
  const inSettings = isActivePath(pathname, SETTINGS_ROOT);
  const { logout, error: logoutError } = useLogout();

  return (
    <header className="topbar">
      <div className="topbar-logo">
        <Image
          src="/logo-fiil-yapi.png"
          alt="FİİL YAPI İNŞAAT MİMARLIK SAN. TİC. A.Ş."
          width={135}
          height={36}
          priority
          unoptimized
          className="topbar-logo__image"
        />
      </div>

      {/* F-KIRINTI → SEKME-F1.7a: kullanıcı kararıyla kırıntı ÜST ÇUBUĞA geri
          döndü (main görünümü/davranışı, bkz. `TopbarBreadcrumb.tsx`).
          Sekme şeridi (`.topbar-tabs`) kırıntının SAĞINDA, KALAN alanı alır. */}
      <TopbarBreadcrumb />
      <WorkspaceTabsBar />

      <div className="topbar-actions">
        <button type="button" className="topbar-bell" aria-label="Bildirimler">
          <BellIcon width={18} height={18} />
        </button>
        {inSettings && (
          <>
            <button type="button" className="topbar-settings-exit" onClick={logout}>
              Çıkış Yap
            </button>
            {logoutError !== null && (
              <p role="alert" className="topbar-settings-exit__error">
                {logoutError}
              </p>
            )}
          </>
        )}
        <span className="topbar-avatar" aria-hidden="true">{avatar}</span>
      </div>
    </header>
  );
}
