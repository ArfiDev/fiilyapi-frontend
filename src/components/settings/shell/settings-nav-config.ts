import { routes } from "@/lib/routes";
import type { PageKey } from "@/lib/api/models";
export interface SettingsNavItem {
  label: string;
  /** IZN-F2.2 — sayfa kataloğu anahtarı; rolün grant'ı "none" ise öğe menüde gizlenir (IZN-F1 kabuk kuralı). */
  pageKey: PageKey;
  href: string;
  emoji: string;
}
export interface SettingsNavGroup {
  heading: string;
  items: SettingsNavItem[];
}

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    heading: "GENEL",
    items: [
      { label: "Şirket Bilgileri", pageKey: "ayarlar.sirket_bilgileri", href: routes.settings.company(), emoji: "🏢" },
      { label: "Bildirimler", pageKey: "ayarlar.bildirimler", href: routes.settings.notifications(), emoji: "🔔" },
      { label: "Görünüm", pageKey: "ayarlar.gorunum", href: routes.settings.appearance(), emoji: "🎨" },
      // PLN-F1 · Ayarlar - Planlama.dc.html:28 — GENEL'in sonu; `YENİ` çipi YOK (K21).
      { label: "Planlama", pageKey: "ayarlar.planlama", href: routes.settings.planning(), emoji: "📈" },
    ],
  },
  {
    heading: "KULLANICI & ERİŞİM",
    items: [
      { label: "Kullanıcılar", pageKey: "ayarlar.kullanicilar", href: routes.settings.users(), emoji: "👤" },
      { label: "Rol Yönetimi", pageKey: "ayarlar.rol_yonetimi", href: routes.settings.roles(), emoji: "🔐" },
      { label: "Sayfa İzinleri", pageKey: "ayarlar.sayfa_izinleri", href: routes.settings.permissionMatrix(), emoji: "📋" },
      // F-OKROL — mockup `Ayarlar - Onay Rolleri.dc.html:82` bu bağlantıyı
      // "Kullanıcı & Erişim" grubunun SONUNA koyar. Rotası olmayan ekran
      // kullanıcıya görünmez: bağlantı ekranla AYNI dilimde iner.
      //
      // ⚠️ ONAYLI SAPMA — mockup `✅` (U+2705) çiziyor; kapsam dışı bir emoji
      // (👍, U+1F44D) ikame edildi. Literal yazılır (kaçış dizisi DEĞİL) ki
      // symbol-subset-guard kod noktasını görebilsin; onay guard'ın ALLOWED
      // listesindedir (bkz. kalan-3 #438 — kaçış dizisi bekçiyi kör bırakır).
      { label: "Onay Rolleri ve Eşik", pageKey: "ayarlar.onay_rolleri", href: routes.settings.approvalRoles(), emoji: "👍" },
    ],
  },
  {
    heading: "SİSTEM",
    items: [
      // F-BORORAN — mockup `Ayarlar - Bordro Oranları.dc.html:75` bu bağlantıyı
      // "Sistem" grubunun BAŞINA koyar. Rotası olmayan ekran kullanıcıya
      // görünmez: bağlantı ekranla AYNI dilimde iner.
      // 💰 (U+1F4B0) `src/styles/fonts.css`in `u+1f??` kümesindedir (ölçüldü).
      { label: "Bordro Oranları", pageKey: "ayarlar.bordro_oranlari", href: routes.settings.payrollRates(), emoji: "\u{1F4B0}" },
      { label: "Entegrasyonlar", pageKey: "ayarlar.entegrasyonlar", href: routes.settings.integrations(), emoji: "🔗" },
      { label: "Yedekleme", pageKey: "ayarlar.yedekleme", href: routes.settings.backup(), emoji: "📦" },
      { label: "Denetim Günlüğü", pageKey: "ayarlar.denetim_gunlugu", href: routes.settings.auditLog(), emoji: "📜" },
    ],
  },
];
