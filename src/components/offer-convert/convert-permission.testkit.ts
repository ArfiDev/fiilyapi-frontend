/**
 * TKL-F5.3 · izin/kapsam durumu (Dönüştür ekranı testleri). AYRI modül: `vi.mock` fabrikaları buradan döner ve bu dosya
 * ekranı İÇE ALMAZ (aksi halde ekran → mock → fabrika → testkit → ekran döngüsü oluşur).
 */
export const permissionState = { levels: { contracts: "full", projects: "admin" } as Record<string, string | undefined> };
export const scopeState = { value: { isRestricted: false, names: [] as string[] } };
export const modulePermissionMock = {
  useModulePermission: (moduleKey: string) => {
    const level = permissionState.levels[moduleKey];
    return { level, canView: level !== "none", canWrite: true, canDelete: true };
  },
};
export const disciplineScopeMock = { useDisciplineScope: () => scopeState.value };

export function resetPermissions(): void {
  permissionState.levels = { contracts: "full", projects: "admin" };
  scopeState.value = { isRestricted: false, names: [] };
}
