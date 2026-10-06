import { describe, expect, it } from "vitest";

import type { PageKey } from "@/lib/api/models";

import {
  decideGate,
  decidePagePermission,
  isPageVisibleInProject,
  pagesForProject,
  type PagePermissionMe,
} from "./page-permission";
import { pageGrant } from "./page-grants.testkit";

const PUANTAJ: PageKey = "saha.puantaj";
const SANTIYE_PUANTAJ: PageKey = "santiye.puantaj";
const BOLUM_PUANTAJ: PageKey = "bolum.puantaj";

function me(pages: PagePermissionMe["pages"], isSystemAdmin = false): PagePermissionMe {
  return { is_system_admin: isSystemAdmin, pages };
}

describe("decidePagePermission · V / E / A", () => {
  it("none: ne görür ne düzenler ne onaylar", () => {
    const result = decidePagePermission(me({ [PUANTAJ]: pageGrant("none") }), [PUANTAJ]);
    expect(result).toMatchObject({ canView: false, canEdit: false, canApprove: false, hasGrant: true });
  });

  it("view: yalnız görür", () => {
    const result = decidePagePermission(me({ [PUANTAJ]: pageGrant("view") }), [PUANTAJ]);
    expect(result).toMatchObject({ canView: true, canEdit: false, canApprove: false });
  });

  it("edit: görür ve düzenler, onaylamaz", () => {
    const result = decidePagePermission(me({ [PUANTAJ]: pageGrant("edit") }), [PUANTAJ]);
    expect(result).toMatchObject({ canView: true, canEdit: true, canApprove: false });
  });

  it("approve bayrağı düzeyden bağımsızdır: view + approve onaylar ama düzenlemez", () => {
    const result = decidePagePermission(me({ [PUANTAJ]: pageGrant("view", true) }), [PUANTAJ]);
    expect(result).toMatchObject({ canView: true, canEdit: false, canApprove: true });
  });
});

describe("decidePagePermission · VEYA kuralı (ikiz sayfalar)", () => {
  const keys = [PUANTAJ, SANTIYE_PUANTAJ, BOLUM_PUANTAJ];

  it("ikizlerden BİRİ edit ise düzenler", () => {
    const result = decidePagePermission(
      me({ [PUANTAJ]: pageGrant("none"), [SANTIYE_PUANTAJ]: pageGrant("edit"), [BOLUM_PUANTAJ]: pageGrant("view") }),
      keys,
    );
    expect(result.canEdit).toBe(true);
    expect(result.canApprove).toBe(false);
  });

  it("ikizlerden biri approve ise onaylar", () => {
    const result = decidePagePermission(
      me({ [PUANTAJ]: pageGrant("view"), [BOLUM_PUANTAJ]: pageGrant("view", true) }),
      keys,
    );
    expect(result.canApprove).toBe(true);
  });

  it("hiçbiri edit değilse düzenlemez", () => {
    const result = decidePagePermission(
      me({ [PUANTAJ]: pageGrant("view"), [SANTIYE_PUANTAJ]: pageGrant("none") }),
      keys,
    );
    expect(result.canEdit).toBe(false);
  });

  it("grant'ı olmayan anahtar yok sayılır, grant'lı olan karar verir", () => {
    const result = decidePagePermission(me({ [SANTIYE_PUANTAJ]: pageGrant("edit") }), keys);
    expect(result).toMatchObject({ canEdit: true, hasGrant: true });
  });
});

describe("decidePagePermission · hasGrant ve sistem yöneticisi", () => {
  it("me yok (yükleniyor) → hasGrant false", () => {
    expect(decidePagePermission(null, [PUANTAJ]).hasGrant).toBe(false);
  });

  it("pages boş → hasGrant false", () => {
    expect(decidePagePermission(me({}), [PUANTAJ]).hasGrant).toBe(false);
  });

  it("istenen anahtarların hiçbirinin grant'ı yok → hasGrant false (başka sayfanın grant'ı sayılmaz)", () => {
    expect(decidePagePermission(me({ "ik.personel": pageGrant("edit") }), [PUANTAJ]).hasGrant).toBe(false);
  });

  it("anahtar verilmediyse hasGrant = pages boş değil", () => {
    expect(decidePagePermission(me({ "ik.personel": pageGrant("view") }), []).hasGrant).toBe(true);
    expect(decidePagePermission(me({}), []).hasGrant).toBe(false);
  });

  it("sistem yöneticisi: grant'lar none olsa da her şey true", () => {
    const result = decidePagePermission(me({ [PUANTAJ]: pageGrant("none") }, true), [PUANTAJ]);
    expect(result).toMatchObject({ isSystemAdmin: true, canView: true, canEdit: true, canApprove: true });
  });
});

describe("decideGate · fail-closed ve eşikler (IZN-F6a: modül-izni fallback'i YOK)", () => {
  const withGrant = (level: "none" | "view" | "edit", approve = false) =>
    decidePagePermission(me({ [PUANTAJ]: pageGrant(level, approve) }), [PUANTAJ]);
  const withoutGrant = decidePagePermission(me({}), [PUANTAJ]);

  it("IZN-F6a · me yok (yükleniyor) ya da pages boş → her eşikte KAPALI", () => {
    const loading = decidePagePermission(null, [PUANTAJ]);
    for (const need of ["view", "edit", "approve", "sa"] as const) {
      expect(decideGate(withoutGrant, need)).toBe(false);
      expect(decideGate(loading, need)).toBe(false);
    }
    expect(loading).toMatchObject({ canView: false, canEdit: false, canApprove: false });
  });

  it("IZN-F5c · model DEVREDEYKEN kümede hücre yoksa KAPALI (fail-closed)", () => {
    const cellless = decidePagePermission(me({ "ik.personel": pageGrant("edit", true) }), [PUANTAJ]);
    expect(cellless).toMatchObject({ hasGrant: false });
    for (const need of ["view", "edit", "approve", "sa"] as const) {
      expect(decideGate(cellless, need)).toBe(false);
    }
  });

  it("grant varsa sayfa kararı verir", () => {
    expect(decideGate(withGrant("view"), "edit")).toBe(false);
    expect(decideGate(withGrant("edit"), "edit")).toBe(true);
  });

  it("view / edit / approve eşikleri kendi bayrağına bakar", () => {
    expect(decideGate(withGrant("view"), "view")).toBe(true);
    expect(decideGate(withGrant("view"), "edit")).toBe(false);
    expect(decideGate(withGrant("edit"), "approve")).toBe(false);
    expect(decideGate(withGrant("view", true), "approve")).toBe(true);
    expect(decideGate(withGrant("none"), "view")).toBe(false);
  });

  it("sa eşiği: grant varken yalnız sistem yöneticisi geçer (edit + approve yetmez)", () => {
    expect(decideGate(withGrant("edit", true), "sa")).toBe(false);
    const admin = decidePagePermission(me({ [PUANTAJ]: pageGrant("none") }, true), [PUANTAJ]);
    expect(decideGate(admin, "sa")).toBe(true);
  });

  it("sistem yöneticisi grant olmasa da geçer", () => {
    const admin = decidePagePermission(me({}, true), [PUANTAJ]);
    expect(decideGate(admin, "edit")).toBe(true);
    expect(decideGate(admin, "sa")).toBe(true);
  });
});

// ── IZN-F3.2 · proje bağlamlı izin ──────────────────────────────────────────────────────
const PROJECT_A = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_B = "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HAKEDIS: PageKey = "proje.isveren_hakedis";

function projectMe(overrides: Partial<PagePermissionMe> = {}): PagePermissionMe {
  return {
    is_system_admin: false,
    pages: { [HAKEDIS]: pageGrant("view") }, // ANA ROL: yalnız görür
    all_projects: false,
    projects: [{ project_id: PROJECT_A, role_key: "site_chief" }],
    role_pages: { site_chief: { pages: { [HAKEDIS]: pageGrant("edit") } } }, // PROJE ROLÜ: düzenler
    ...overrides,
  };
}

describe("decidePagePermission · proje bağlamı (IZN-F3.2)", () => {
  it("ekipte olduğu projede PROJE ROLÜNÜN izni geçerlidir (ana rol view, proje rolü edit → edit)", () => {
    expect(decidePagePermission(projectMe(), [HAKEDIS], PROJECT_A)).toMatchObject({ canEdit: true, hasGrant: true });
  });

  it("projectId verilmezse ana rol (proje rolü yok sayılır)", () => {
    expect(decidePagePermission(projectMe(), [HAKEDIS])).toMatchObject({ canEdit: false, canView: true });
  });

  it("kişi o projenin ekibinde DEĞİLSE ana rol", () => {
    expect(decidePagePermission(projectMe(), [HAKEDIS], PROJECT_B)).toMatchObject({ canEdit: false, canView: true });
  });

  it("all_projects=true iken proje satırı olsa da ANA ROL (proje içi sayfalar ana rolle açılır)", () => {
    expect(decidePagePermission(projectMe({ all_projects: true }), [HAKEDIS], PROJECT_A).canEdit).toBe(false);
  });

  it("role_pages'te o rol YOKSA (eksik/bayat yük) ana role düşer", () => {
    const result = decidePagePermission(projectMe({ role_pages: {} }), [HAKEDIS], PROJECT_A);
    expect(result).toMatchObject({ canEdit: false, canView: true });
    expect(decidePagePermission(projectMe({ role_pages: undefined }), [HAKEDIS], PROJECT_A).canView).toBe(true);
  });

  it("proje rolü 'none' verirse ana rol view olsa da görmez", () => {
    const me = projectMe({ role_pages: { site_chief: { pages: { [HAKEDIS]: pageGrant("none") } } } });
    expect(decidePagePermission(me, [HAKEDIS], PROJECT_A)).toMatchObject({ canView: false, canEdit: false, hasGrant: true });
  });

  it("IZN-F5c · proje rolünün haritasında anahtar yoksa (model devrede) KAPALI", () => {
    const me = projectMe({ role_pages: { site_chief: { pages: {} } } });
    const permission = decidePagePermission(me, [HAKEDIS], PROJECT_A);
    expect(permission).toMatchObject({ hasGrant: false });
    expect(decideGate(permission, "edit")).toBe(false);
    expect(decideGate(permission, "edit")).toBe(false);
  });

  it("sistem yöneticisi proje bağlamında da her kapıyı geçer", () => {
    const me = projectMe({
      is_system_admin: true,
      role_pages: { site_chief: { pages: { [HAKEDIS]: pageGrant("none") } } },
    });
    expect(decidePagePermission(me, [HAKEDIS], PROJECT_A)).toMatchObject({ canEdit: true, canApprove: true });
  });
});

describe("pagesForProject / isPageVisibleInProject (IZN-F3.2)", () => {
  it("harita seçimi: ekipteyse proje rolü, değilse ana rol", () => {
    expect(pagesForProject(projectMe(), PROJECT_A)[HAKEDIS]?.level).toBe("edit");
    expect(pagesForProject(projectMe(), PROJECT_B)[HAKEDIS]?.level).toBe("view");
    expect(pagesForProject(null, PROJECT_A)).toEqual({});
  });

  it("görünürlük: grant yok → görünür, none → gizli, SA → her zaman görünür", () => {
    const hidden = projectMe({ role_pages: { site_chief: { pages: { [HAKEDIS]: pageGrant("none") } } } });
    expect(isPageVisibleInProject(hidden, HAKEDIS, PROJECT_A)).toBe(false);
    expect(isPageVisibleInProject(hidden, "proje.belgeler", PROJECT_A)).toBe(true);
    expect(isPageVisibleInProject({ ...hidden, is_system_admin: true }, HAKEDIS, PROJECT_A)).toBe(true);
    expect(isPageVisibleInProject(null, HAKEDIS, PROJECT_A)).toBe(true);
  });
});
