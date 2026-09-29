"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowRightIcon, BellIcon } from "@/components/ui/icons";
import { isActivePath } from "@/lib/shell/isActive";
import { routes } from "@/lib/routes";
import { useLogout } from "@/lib/shell/useLogout";
import { TopbarBreadcrumb } from "./breadcrumb/TopbarBreadcrumb";
import { useSession } from "./SessionProvider";
import { UserMenu } from "./UserMenu";
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
            {/* SEKME-F2 D(a): ≤900px'te (bkz. `topbar.css` gerekçesi) görünür
                metin YER AÇMAK için ikona iner — erişilebilir ad `aria-label`
                ile sabit kalır, ekran okuyucu genişlikten BAĞIMSIZ "Çıkış
                Yap" okur. `aria-hidden` ikonun KENDİSİ metnin YERİNE değil
                YANINA basıldığı için (görünür metin CSS'te gizlenir, DOM'dan
                KALKMAZ) çift okunmayı önler. */}
            <button
              type="button"
              className="topbar-settings-exit"
              onClick={logout}
              aria-label="Çıkış Yap"
            >
              <ArrowRightIcon
                width={14}
                height={14}
                aria-hidden="true"
                className="topbar-settings-exit__icon"
              />
              <span className="topbar-settings-exit__label">Çıkış Yap</span>
            </button>
            {logoutError !== null && (
              <p role="alert" className="topbar-settings-exit__error">
                {logoutError}
              </p>
            )}
          </>
        )}
        <UserMenu me={me} onLogout={logout} logoutError={inSettings ? null : logoutError} />
      </div>
    </header>
  );
}
