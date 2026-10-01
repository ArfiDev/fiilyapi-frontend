import { WorkItemCatalogScreen } from "@/components/work-item-catalog/WorkItemCatalogScreen";

// TKL-F1.3 · `/planlama/is-kalemi-katalogu` — şirket geneli fiyatlı katalog (şantiye yok).
// [...slug] catch-all'ı bu segment için devre dışı bırakır.
export default function IsKalemiKataloguPage() {
  return <WorkItemCatalogScreen />;
}
