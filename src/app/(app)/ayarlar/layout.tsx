import { SettingsSidebar } from "@/components/settings/shell/SettingsSidebar";
import "./ayarlar.css";

export default function AyarlarLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsSidebar />
      {/* SEKME-F1.7a: kırıntı `.ayarlar-content`ten de ÇIKTI, üst çubuğa
          taşındı (`TopbarBreadcrumb` "Ayarlar / <bölüm>" basar — bkz.
          `route-tree.ts`teki `ayarlar` alt ağacı). `SettingsBreadcrumb`
          KALKTI; Çıkış Yap topbar'da (Ayarlar altında) ve/veya
          `SettingsSidebar`in altındaki `.settings-logout` düğmesinde yaşar. */}
      <div className="ayarlar-content">{children}</div>
    </>
  );
}
