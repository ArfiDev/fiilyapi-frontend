import { DisciplineManagementScreen } from "@/components/earned-value/catalog/DisciplineManagementScreen";

// NAV-F2 · `/planlama/disiplin-yonetimi` — şirket disiplin listesi (M6) sayfa olarak.
// [...slug] catch-all'ı bu segment için devre dışı bırakır.
export default function DisiplinYonetimiPage() {
  return <DisciplineManagementScreen />;
}
