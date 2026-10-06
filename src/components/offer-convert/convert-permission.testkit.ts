/**
 * TKL-F5.3 · izin/kapsam durumu (Dönüştür ekranı testleri). AYRI modül: `vi.mock` fabrikaları buradan döner ve bu dosya
 * ekranı İÇE ALMAZ (aksi halde ekran → mock → fabrika → testkit → ekran döngüsü oluşur).
 */
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

export const permissionState = { levels: { contracts: "full", projects: "admin" } as Record<string, string | undefined> };
export const scopeState = { value: { isRestricted: false, names: [] as string[] } };
export const modulePermissionMock = {
  useModulePermission: (moduleKey: string) => {
    const level = permissionState.levels[moduleKey];
    return { level, canView: level !== "none", canWrite: true, canDelete: true };
  },
};
/**
 * IZN-F6a · kapı YALNIZ sayfa izninden karar verir: modül niyeti oturum sayfa iznine çevrilir. Dönüştür = Onaylar
 * (`teklif.teklif_hazirlama`): projects:admin ∧ contracts:full → Düzenler+Onaylar; seviyeler bilinmiyorsa (undefined)
 * sayfa izni HİÇ yok (fail-closed); aksi (eksik seviye) → Düzenler ama Onaylamaz.
 */
export function sessionMockFor() {
  const levels = permissionState.levels;
  if (levels.contracts === undefined && levels.projects === undefined) return meFixture({ pages: {} });
  const canApprove = levels.contracts === "full" && levels.projects === "admin";
  return meFixture({ pages: { "teklif.teklif_hazirlama": pageGrant("edit", canApprove) } });
}
export const disciplineScopeMock = { useDisciplineScope: () => scopeState.value };

export function resetPermissions(): void {
  permissionState.levels = { contracts: "full", projects: "admin" };
  scopeState.value = { isRestricted: false, names: [] };
}
