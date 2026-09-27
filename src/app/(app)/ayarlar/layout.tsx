import { SettingsSidebar } from "@/components/settings/shell/SettingsSidebar";
import { SettingsBreadcrumb } from "@/components/settings/shell/SettingsBreadcrumb";
import "./ayarlar.css";

export default function AyarlarLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsSidebar />
      {/* SEKME-F1.2: kırıntı artık `.ayarlar-content`in İÇİNDE, normal akışta
          bir satır — eskiden global topbar'ın ortasını örten `position:fixed`
          bir şeritti (bkz. `settings-shell.css` eski `.settings-breadcrumb`). */}
      <div className="ayarlar-content">
        <SettingsBreadcrumb />
        {children}
      </div>
    </>
  );
}
