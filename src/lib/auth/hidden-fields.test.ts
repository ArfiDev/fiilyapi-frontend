import { describe, expect, it } from "vitest";

import { hiddenCategoriesFor, isCategoryHidden } from "./hidden-fields";
import { meFixture } from "./page-grants.testkit";

const PROJECT = "22222222-2222-2222-2222-222222222222";
const MEMBER = { project_id: PROJECT, role_key: "site_chief" };

describe("isCategoryHidden", () => {
  it("ana rol: me.hidden_fields'taki kategori gizli, olmayan değil", () => {
    const me = meFixture({ hiddenFields: ["maliyet_kar"] });
    expect(isCategoryHidden(me, "maliyet_kar")).toBe(true);
    expect(isCategoryHidden(me, "satis_alici")).toBe(false);
  });

  it("oturum yok / alan yok → gizli değil (null = veri yok, ipucu YOK)", () => {
    expect(isCategoryHidden(null, "maliyet_kar")).toBe(false);
    expect(isCategoryHidden(meFixture(), "maliyet_kar")).toBe(false);
  });

  it("kategori dizisi: biri gizliyse true (para alanı: kendi kategorisi VEYA tum_tutarlar)", () => {
    const me = meFixture({ hiddenFields: ["tum_tutarlar"] });
    expect(isCategoryHidden(me, ["sozlesme_fiyat", "tum_tutarlar"])).toBe(true);
    expect(isCategoryHidden(me, ["sozlesme_fiyat"])).toBe(false);
  });

  it("proje bağlamı: ekip rolünün gizli alanları ana rolünkini EZER", () => {
    const me = meFixture({
      hiddenFields: [],
      projects: [MEMBER],
      rolePages: { site_chief: {} },
      roleHiddenFields: { site_chief: ["maliyet_kar"] },
    });
    expect(isCategoryHidden(me, "maliyet_kar")).toBe(false);
    expect(isCategoryHidden(me, "maliyet_kar", PROJECT)).toBe(true);
  });

  it("proje bağlamı: ana rolde gizli, ekip rolünde açık → proje içinde gizli DEĞİL", () => {
    const me = meFixture({
      hiddenFields: ["maliyet_kar"],
      projects: [MEMBER],
      rolePages: { site_chief: {} },
      roleHiddenFields: { site_chief: [] },
    });
    expect(isCategoryHidden(me, "maliyet_kar", PROJECT)).toBe(false);
  });

  it("all_projects=true, ekipte olmayan ya da role_pages'te rolü olmayan → ana rol", () => {
    const base = { hiddenFields: ["banka_kasa"] as const, roleHiddenFields: { site_chief: [] } };
    const all = meFixture({ ...base, allProjects: true, projects: [MEMBER], rolePages: { site_chief: {} } });
    const outsider = meFixture({ ...base, projects: [{ project_id: "x", role_key: "site_chief" }], rolePages: { site_chief: {} } });
    const noRolePages = meFixture({ ...base, projects: [MEMBER] });
    expect(isCategoryHidden(all, "banka_kasa", PROJECT)).toBe(true);
    expect(isCategoryHidden(outsider, "banka_kasa", PROJECT)).toBe(true);
    expect(isCategoryHidden(noRolePages, "banka_kasa", PROJECT)).toBe(true);
    expect(hiddenCategoriesFor(noRolePages, PROJECT)).toEqual(["banka_kasa"]);
  });
});
