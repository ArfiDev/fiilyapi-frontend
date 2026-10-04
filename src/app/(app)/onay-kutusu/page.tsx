import { Suspense } from "react";

import { ApprovalsView } from "@/components/approvals/ApprovalsView";

// F-OK T5 · Onay Kutusu (`projedesign/Onay Kutusu.dc.html`) gerçek rotası.
// Kabuk sidebar'ındaki "Onay Kutusu" girişi (F3'ten beri duruyordu) artık
// catch-all `[...slug]` ComingSoon'una DEĞİL bu statik segmente düşer;
// `nav-config.test.ts`in "statik rotaya düşer" bekçisi bu klasörle yeşile döner.
//
// OKT-F1.2: açık sekme URL'de taşınır (`?sekme=`) → görünüm `useSearchParams`
// okur ve Next 15 kanonu gereği Suspense sınırında sarılır
// (`hakedisler/page.tsx` ile aynı).
export default function OnayKutusuPage() {
  return (
    <Suspense>
      <ApprovalsView />
    </Suspense>
  );
}
