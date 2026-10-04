import { describe, expect, it } from "vitest";

import { decideDisciplineScope, type DisciplineScopeMe } from "./disciplineScope";

const A = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "33333333-cccc-4ccc-8ccc-cccccccccccc";

const me: DisciplineScopeMe = {
  all_projects: false,
  projects: [
    { project_id: A, discipline_ids: ["d-elk", "d-mek"] },
    { project_id: B, discipline_ids: [] },
  ],
};

describe("decideDisciplineScope (IZN-F3.1c)", () => {
  it("proje bağlamı: O PROJENİN disiplinleri", () => {
    expect(decideDisciplineScope(me, A)).toEqual({ isRestricted: true, disciplineIds: ["d-elk", "d-mek"] });
  });

  it("proje bağlamı: o projede liste boşsa kısıtsız (başka projedeki atama sızmaz)", () => {
    expect(decideDisciplineScope(me, B)).toEqual({ isRestricted: false, disciplineIds: [] });
  });

  it("proje bağlamı: kişi o projenin ekibinde değilse kısıtsız", () => {
    expect(decideDisciplineScope(me, C)).toEqual({ isRestricted: false, disciplineIds: [] });
  });

  it("bağlamsız: herhangi bir projede dolu liste → kısıtlı; kimlikler BİRLEŞİM ve tekil", () => {
    const merged: DisciplineScopeMe = {
      all_projects: false,
      projects: [
        { project_id: A, discipline_ids: ["d-elk"] },
        { project_id: B, discipline_ids: ["d-mek", "d-elk"] },
      ],
    };
    expect(decideDisciplineScope(merged)).toEqual({ isRestricted: true, disciplineIds: ["d-elk", "d-mek"] });
  });

  it("bağlamsız: hiçbir projede disiplin yoksa kısıtsız", () => {
    expect(decideDisciplineScope({ all_projects: false, projects: [{ project_id: A, discipline_ids: [] }] })).toEqual({
      isRestricted: false,
      disciplineIds: [],
    });
  });

  it("all_projects → proje satırı disiplin taşısa da kısıtsız (bağlamlı ve bağlamsız)", () => {
    const all = { ...me, all_projects: true };
    expect(decideDisciplineScope(all).isRestricted).toBe(false);
    expect(decideDisciplineScope(all, A).isRestricted).toBe(false);
  });

  it("oturum yok / alan yok → fail-open kısıtsız", () => {
    expect(decideDisciplineScope(null).isRestricted).toBe(false);
    expect(decideDisciplineScope(undefined, A).isRestricted).toBe(false);
    expect(decideDisciplineScope({}).isRestricted).toBe(false);
  });
});
