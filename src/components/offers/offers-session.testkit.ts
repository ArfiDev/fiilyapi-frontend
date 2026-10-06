import { CONTRACTS_VIEW } from "@/lib/auth/page-gates";
import { fullAccessPages, meFixture, pageGrant, pagesFor } from "@/lib/auth/page-grants.testkit";

/**
 * IZN-F6a · teklif ekranı testleri: kısa niyet parametreleri → oturum sayfa izni. Kapılar ve şerit metni YALNIZ
 * `me.pages`'ten karar verir; `contracts`/`projects` yalnız bu yardımcının girdisidir (ürün koduna modül seviyesi gitmez).
 *
 * - contracts none/view → sözleşme/teklif sayfaları None/Görür (yazma yok);
 * - contracts full (ya da bilinmeyen) → Düzenler; Dönüştür Onaylar'ı ⇔ projects admin;
 * - `isSystemAdmin` → sistem yöneticisi (Sil / Taslağı sil `need: "sa"`).
 */
export function offersSessionMe(options: { contracts?: string; projects?: string; isSystemAdmin?: boolean }) {
  const { contracts, projects, isSystemAdmin = false } = options;
  if (contracts === "none" || contracts === "view") {
    return meFixture({ pages: pagesFor(CONTRACTS_VIEW, contracts), isSystemAdmin });
  }
  return meFixture({
    pages: { ...fullAccessPages(), "teklif.teklif_hazirlama": pageGrant("edit", projects === "admin") },
    isSystemAdmin,
  });
}
