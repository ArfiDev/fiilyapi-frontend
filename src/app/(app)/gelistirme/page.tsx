import { GelistirmeView } from "./GelistirmeView";
import { VERI } from "./veri";

// GLS-F1 GEÇİCİ — Geliştirme sayfası silinince bu klasör komple silinir.
export default function GelistirmePage() {
  return <GelistirmeView veri={VERI} />;
}
