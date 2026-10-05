// @vitest-environment node
//
// IZN-F3.2 · test ikizinin (`e2e/mock-backend.ts`) kullanıcı erişimi sözleşmesi (backend IZN-B3):
// `GET/PUT /users/{id}/access` TAM DEĞİŞTİRME + ATOMİK, `GET /users?q=` sunucu araması,
// `UserResponse.all_projects/project_count`, `RoleResponse.user_count` = ana ∪ proje ve eski uçlarda 410.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startMockBackend } from "../../../e2e/mock-backend";

let base = "";
let close: () => Promise<void>;

beforeAll(async () => {
  const started = startMockBackend(0);
  close = started.close;
  await new Promise<void>((resolve) => started.server.once("listening", () => resolve()));
  const address = started.server.address();
  if (address === null || typeof address === "string") throw new Error("ikiz port alamadı");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await close();
});

async function call<T>(method: string, route: string, body?: unknown): Promise<{ status: number; json: T }> {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: (text === "" ? {} : JSON.parse(text)) as T };
}

interface Access {
  role_id: string;
  all_projects: boolean;
  projects: { project_id: string; project_name: string; role_id: string; disciplines: { id: string; code: string }[] }[];
}
interface UserRow {
  id: string;
  full_name: string;
  all_projects: boolean;
  project_count: number;
}
interface UserList {
  items: UserRow[];
  total: number;
}

const access = (userId: string) => call<Access>("GET", `/users/${userId}/access`);

describe("test ikizi · kullanıcı erişimi (ana rol + proje ekibi)", () => {
  it("tohum: Kadir iki projede ekipte, proje adına göre sıralı; ana rol role_id'de", async () => {
    const { status, json } = await access("u-4");
    expect(status).toBe(200);
    expect(json.role_id).toBe("role-pm");
    expect(json.all_projects).toBe(false);
    expect(json.projects.map((p) => p.project_name)).toEqual(["Kule A", "Villa B"]);
  });

  it("GET /users all_projects + project_count taşır", async () => {
    const list = (await call<UserList>("GET", "/users")).json;
    const byId = new Map(list.items.map((u) => [u.full_name, u]));
    expect(byId.get("Kadir Arslan")).toMatchObject({ all_projects: false, project_count: 2 });
    expect(byId.get("Ayşe Demir")).toMatchObject({ all_projects: true, project_count: 0 });
  });

  it("GET /users?q= ad, e-posta ve ana rol adında arar (Türkçe duyarsız)", async () => {
    const byName = (await call<UserList>("GET", "/users?q=KADİR")).json;
    expect(byName.items.map((u) => u.full_name)).toEqual(["Kadir Arslan"]);
    expect(byName.total).toBe(1);
    const byRole = (await call<UserList>("GET", "/users?q=muhasebe")).json;
    expect(byRole.items.map((u) => u.full_name)).toContain("Ayşe Demir");
    const none = (await call<UserList>("GET", "/users?q=yokboyle")).json;
    expect(none.total).toBe(0);
  });

  it("PUT TAM DEĞİŞTİRİR ve project_count / user_count türer; sonra eski hâle döner", async () => {
    const before = (await access("u-2")).json;
    const put = await call<Access>("PUT", "/users/u-2/access", {
      role_id: "role-saha",
      all_projects: false,
      projects: [
        { project_id: "p-2", role_id: "role-pm", discipline_ids: [] },
        { project_id: "p-1", role_id: "role-saha", discipline_ids: [] },
      ],
    });
    expect(put.status).toBe(200);
    expect(put.json.projects.map((p) => p.project_id)).toEqual(["p-1", "p-2"]);
    const row = (await call<UserList>("GET", "/users")).json.items.find((u) => u.id === "u-2");
    expect(row?.project_count).toBe(2);
    await call("PUT", "/users/u-2/access", {
      role_id: before.role_id,
      all_projects: before.all_projects,
      projects: before.projects.map((p) => ({ project_id: p.project_id, role_id: p.role_id, discipline_ids: [] })),
    });
  });

  it("all_projects=true iken ekip dolu → 422 ve HİÇBİR şey değişmez (atomik)", async () => {
    const before = (await access("u-2")).json;
    const put = await call<{ detail: string }>("PUT", "/users/u-2/access", {
      role_id: "role-saha",
      all_projects: true,
      projects: [{ project_id: "p-1", role_id: "role-saha", discipline_ids: [] }],
    });
    expect(put.status).toBe(422);
    expect(put.json.detail).toMatch(/ekibi boş/);
    expect((await access("u-2")).json).toEqual(before);
  });

  it("422: aynı proje iki kez, bilinmeyen proje/rol/disiplin, proje rolü Sistem Yöneticisi", async () => {
    const put = (projects: unknown[]) =>
      call<{ detail: string }>("PUT", "/users/u-2/access", { role_id: "role-saha", all_projects: false, projects });
    const member = { project_id: "p-1", role_id: "role-saha", discipline_ids: [] };
    expect((await put([member, member])).status).toBe(422);
    expect((await put([{ ...member, project_id: "p-yok" }])).status).toBe(422);
    expect((await put([{ ...member, role_id: "role-yok" }])).status).toBe(422);
    expect((await put([{ ...member, discipline_ids: ["00000000-0000-0000-0000-00000000dead"] }])).status).toBe(422);
    expect((await put([{ ...member, role_id: "role-admin" }])).json.detail).toMatch(/Sistem Yöneticisi/);
  });

  it("disiplinler DisciplineRef olarak döner ve disiplin user_count'u türer", async () => {
    const [first] = (await call<{ id: string; code: string; user_count: number }[]>("GET", "/earned-value/disciplines")).json;
    const put = await call<Access>("PUT", "/users/u-2/access", {
      role_id: "role-saha",
      all_projects: false,
      projects: [{ project_id: "p-1", role_id: "role-saha", discipline_ids: [first.id] }],
    });
    expect(put.json.projects[0].disciplines).toMatchObject([{ id: first.id, code: first.code }]);
    const counts = (await call<{ id: string; user_count: number }[]>("GET", "/earned-value/disciplines")).json;
    expect(counts.find((d) => d.id === first.id)?.user_count).toBe(1);
    await call("PUT", "/users/u-2/access", {
      role_id: "role-saha",
      all_projects: false,
      projects: [{ project_id: "p-1", role_id: "role-saha", discipline_ids: [] }],
    });
  });

  it("RoleResponse.user_count = ana rol ∪ proje rolü (kişi bir kez sayılır)", async () => {
    const roles = (await call<{ id: string; user_count: number }[]>("GET", "/roles")).json;
    // role-saha: Sercan (ana + proje) + Kadir (yalnız proje p-1) = 2 kişi.
    expect(roles.find((r) => r.id === "role-saha")?.user_count).toBe(2);
    // role-pm: Kadir (ana + p-2) = 1 kişi.
    expect(roles.find((r) => r.id === "role-pm")?.user_count).toBe(1);
  });

  it("eski uçlar 410; bilinmeyen kullanıcı 404", async () => {
    expect((await call("GET", "/users/u-2/disciplines")).status).toBe(410);
    expect((await call("PUT", "/users/u-2/disciplines", { discipline_ids: [] })).status).toBe(410);
    expect((await call("GET", "/users/u-2/project-access")).status).toBe(410);
    expect((await call("GET", "/users/yok/access")).status).toBe(404);
  });

  it("/auth/me IZN-B3 alanlarını taşır (boş ekip → mevcut kareler değişmez)", async () => {
    const me = (await call<{ all_projects: boolean; projects: unknown[]; role_pages: object }>("GET", "/auth/me")).json;
    expect(me).toMatchObject({ all_projects: false, projects: [], role_pages: {} });
  });
});
