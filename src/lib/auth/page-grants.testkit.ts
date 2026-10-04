import type { PageGrant, PageKey } from "@/lib/api/models";
import type { MeResponse } from "@/lib/auth/types";

/** IZN-F2.x test yardımcıları — sayfa izni (`me.pages`) taşıyan sahte oturum yükü. */
export function pageGrant(level: PageGrant["level"], approve = false): PageGrant {
  return { level, approve };
}

export interface MeFixtureOptions {
  pages?: Partial<Record<PageKey, PageGrant>>;
  isSystemAdmin?: boolean;
  /** Eski modül izinleri (geri uyum düşüşü için). */
  permissions?: Record<string, string>;
}

/** `useSession().me` için kısmi yük; `pages` verilmezse alan HİÇ yoktur (eski oturum). */
export function meFixture({ pages, isSystemAdmin = false, permissions }: MeFixtureOptions = {}): MeResponse {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    email: "test@ornek.com",
    full_name: "Test Kullanıcı",
    title: null,
    role_key: "procurement",
    status: "active",
    is_system_admin: isSystemAdmin,
    ...(pages === undefined ? {} : { pages }),
    ...(permissions === undefined ? {} : { permissions }),
  } as unknown as MeResponse;
}
