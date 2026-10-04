import { Suspense } from "react";
import { SettingsHeader } from "@/components/settings/shell/SettingsHeader";
import { RoleCreateButton } from "@/components/settings/roles/RoleCreateButton";
import { RolesScreen } from "@/components/settings/roles/RolesScreen";

export default function RollerPage() {
  return (
    <>
      <SettingsHeader
        title="Rol Yönetimi"
        subtitle="Rolleri oluşturun, kopyalayın ve kullanıcı sayılarını görün"
        action={<RoleCreateButton />}
      />
      <Suspense fallback={<p className="settings-note">Yükleniyor…</p>}>
        <RolesScreen />
      </Suspense>
    </>
  );
}
