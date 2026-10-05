import type { RoleResponse } from "@/lib/api/models";

/** Sistem Yöneticisi rolünün anahtarı (backend `roles/seed_data.py`) — PROJE rolü olamaz (backend 422). */
export const SYSTEM_ADMIN_ROLE_KEY = "system_admin";

/**
 * Seçicide görünecek roller. IZN-F1.2: `is_assignable === false` roller atanamaz; ama kişinin ZATEN
 * atanmış rolü (`keepRoleId`) atanamaz olsa da listede KALIR — yoksa seçili değer kaybolur.
 * `forProject`: Sistem Yöneticisi proje rolü olarak sunulmaz.
 * `canAssignSystemAdmin` (IZN-F3.1e): Sistem Yöneticisi ana rolünü YALNIZ Sistem Yöneticisi atar (backend 403);
 * değilse o rol seçicide görünmez (kişide zaten varsa `keepRoleId` ile görünür kalır).
 */
export function selectableRoles(
  roles: readonly RoleResponse[] | undefined,
  keepRoleId: string,
  forProject = false,
  canAssignSystemAdmin = true,
): RoleResponse[] {
  return (roles ?? []).filter((role) => {
    if (role.id === keepRoleId) return true;
    if (role.is_assignable === false) return false;
    if (role.key === SYSTEM_ADMIN_ROLE_KEY) return !forProject && canAssignSystemAdmin;
    return true;
  });
}
