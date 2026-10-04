import { Suspense } from "react";
import { SettingsHeader } from "@/components/settings/shell/SettingsHeader";
import { PageAccessScreen } from "@/components/settings/page-access/PageAccessScreen";

export default function IzinMatrisiPage() {
  return (
    <>
      <SettingsHeader
        variant="sub"
        title="Sayfa İzinleri"
        subtitle="Önce bir rol seçin, sonra o rolün her sayfadaki erişim düzeyini ayarlayın"
      />
      <Suspense fallback={<p className="settings-note">Yükleniyor…</p>}>
        <PageAccessScreen />
      </Suspense>
    </>
  );
}
