import { describe, expect, it } from "vitest";

import {
  draftFromAccess,
  isSameAccess,
  toAccessInput,
  validateAccess,
  withAllProjects,
  withMember,
  withMemberDiscipline,
  withMemberRole,
  withoutMember,
  withoutMemberDiscipline,
  type AccessDraft,
} from "./user-access-draft";

const ELK = { id: "d-elk", code: "ELK", name: "Elektrik", color: "#cbd5e1" };
const MEK = { id: "d-mek", code: "MEK", name: "Mekanik", color: "#64748b" };

const base: AccessDraft = draftFromAccess({
  role_id: "r-site",
  all_projects: false,
  projects: [
    { project_id: "p-a", project_name: "AVM", role_id: "r-field", disciplines: [] },
    { project_id: "p-k", project_name: "Kule A", role_id: "r-site", disciplines: [ELK] },
  ],
});

describe("user-access-draft", () => {
  it("toAccessInput: ekip + disiplin kimlikleri; all_projects iken projects BOŞ", () => {
    expect(toAccessInput(base)).toEqual({
      role_id: "r-site",
      all_projects: false,
      projects: [
        { project_id: "p-a", role_id: "r-field", discipline_ids: [] },
        { project_id: "p-k", role_id: "r-site", discipline_ids: ["d-elk"] },
      ],
    });
    expect(toAccessInput(withAllProjects(base, true))).toEqual({ role_id: "r-site", all_projects: true, projects: [] });
  });

  it("güncellemeler YENİ nesne üretir, girdiyi değiştirmez (değişmezlik)", () => {
    const snapshot = JSON.stringify(base);
    withMember(base, { projectId: "p-v", projectName: "Villa B", roleId: "r-pm", disciplines: [] });
    withoutMember(base, "p-a");
    withMemberRole(base, "p-a", "r-pm");
    withMemberDiscipline(base, "p-a", MEK);
    withoutMemberDiscipline(base, "p-k", "d-elk");
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it("aynı proje/disiplin ikinci kez eklenmez", () => {
    const again = withMember(base, { projectId: "p-a", projectName: "AVM", roleId: "r-pm", disciplines: [] });
    expect(again).toBe(base);
    const twice = withMemberDiscipline(withMemberDiscipline(base, "p-a", MEK), "p-a", MEK);
    expect(twice.members.find((m) => m.projectId === "p-a")?.disciplines).toEqual([MEK]);
  });

  it("isSameAccess: sıra önemsiz, içerik önemli; all_projects iken ekip karşılaştırılmaz", () => {
    const reordered: AccessDraft = { ...base, members: [...base.members].reverse() };
    expect(isSameAccess(base, reordered)).toBe(true);
    expect(isSameAccess(base, withMemberRole(base, "p-a", "r-pm"))).toBe(false);
    expect(isSameAccess(base, withoutMemberDiscipline(base, "p-k", "d-elk"))).toBe(false);
    expect(isSameAccess(withAllProjects(base, true), withAllProjects(withoutMember(base, "p-a"), true))).toBe(true);
  });

  it("validateAccess: ana rol ve her proje rolü zorunlu (all_projects iken satırlar aranmaz)", () => {
    expect(validateAccess(base)).toBeNull();
    expect(validateAccess({ ...base, roleId: "" })).toBe("Ana rol seçin.");
    const noRole = withMemberRole(base, "p-a", "");
    expect(validateAccess(noRole)).toBe("Her proje için bir rol seçin.");
    expect(validateAccess(withAllProjects(noRole, true))).toBeNull();
  });
});
