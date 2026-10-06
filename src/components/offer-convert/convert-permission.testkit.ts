/**
 * TKL-F5.3 · izin/kapsam durumu (Dönüştür ekranı testleri). AYRI modül: `vi.mock` fabrikaları buradan döner ve bu dosya
 * ekranı İÇE ALMAZ (aksi halde ekran → mock → fabrika → testkit → ekran döngüsü oluşur).
 */
import type { PageGrant } from "@/lib/api/models";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

/** Oturumdaki `teklif.teklif_hazirlama` hücresi; `undefined` = sayfa izni HİÇ yok (fail-closed). */
export const permissionState = { grant: undefined as PageGrant | undefined };
export const scopeState = { value: { isRestricted: false, names: [] as string[] } };
/**
 * Kapı YALNIZ sayfa izninden karar verir. Dönüştür = `teklif.teklif_hazirlama` Düzenler + Onaylar; hücre yoksa
 * oturumda hiçbir sayfa izni yoktur (fail-closed).
 */
export function sessionMockFor() {
  const { grant } = permissionState;
  return meFixture({ pages: grant === undefined ? {} : { "teklif.teklif_hazirlama": grant } });
}
export const disciplineScopeMock = { useDisciplineScope: () => scopeState.value };

export function resetPermissions(): void {
  permissionState.grant = pageGrant("edit", true);
  scopeState.value = { isRestricted: false, names: [] };
}
