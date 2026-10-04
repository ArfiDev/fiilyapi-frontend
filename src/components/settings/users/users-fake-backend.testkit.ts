/**
 * IZN-F3.2 · Kullanıcılar ekranı testleri için küçük sahte backend (global `fetch` yerine geçen işlev).
 * İstekler `calls`a (yöntem, yol, sorgu, gövde) kaydedilir; yanıtlar `options` ile değiştirilebilir.
 * Bu dosya `vitest` ithal ETMEZ (ürün grafiğine sızma bekçisi): test `vi.stubGlobal("fetch", vi.fn(fake.fetch))` der.
 */
export interface FakeUser {
  id: string;
  email: string;
  full_name: string;
  title: string;
  role_id: string;
  status: "active" | "on_leave" | "passive";
  all_projects: boolean;
  project_count: number;
}

export interface FakeAccess {
  role_id: string;
  all_projects: boolean;
  projects: Array<{
    project_id: string;
    project_name: string;
    role_id: string;
    disciplines: Array<{ id: string; code: string; name: string; color: string }>;
  }>;
}

export interface FakeCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

export const ROLES = [
  { id: "r-admin", key: "system_admin", name: "Sistem Yöneticisi", emoji: "", description: "", is_system: true, is_assignable: true, is_locked: true, user_count: 1 },
  { id: "r-patron", key: "patron", name: "Patron", emoji: "", description: "", is_system: true, is_assignable: true, is_locked: false, user_count: 1 },
  { id: "r-pm", key: "project_manager", name: "Proje Müdürü", emoji: "", description: "", is_system: false, is_assignable: true, is_locked: false, user_count: 1 },
  { id: "r-site", key: "site_chief", name: "Şantiye Şefi", emoji: "", description: "", is_system: false, is_assignable: true, is_locked: false, user_count: 1 },
  { id: "r-field", key: "field_engineer", name: "Saha Mühendisi", emoji: "", description: "", is_system: false, is_assignable: true, is_locked: false, user_count: 1 },
  { id: "r-legacy", key: "legacy", name: "Eski Rol", emoji: "", description: "", is_system: false, is_assignable: false, is_locked: false, user_count: 1 },
];

export const PROJECTS = [
  { id: "p-kule", code: "PRJ-1", name: "Kule A", status: "active", budget: "0", progress_pct: "0" },
  { id: "p-villa", code: "PRJ-2", name: "Villa B", status: "active", budget: "0", progress_pct: "0" },
  { id: "p-avm", code: "PRJ-3", name: "AVM", status: "active", budget: "0", progress_pct: "0" },
];

export const DISCIPLINES = [
  { id: "d-elk", code: "ELK", name: "Elektrik", color: "#cbd5e1", default_contractor_type: "own", sort_order: 1, used_by_item_count: 0, used_by_site_count: 0, user_count: 0 },
  { id: "d-mek", code: "MEK", name: "Mekanik", color: "#64748b", default_contractor_type: "subcon", sort_order: 2, used_by_item_count: 0, used_by_site_count: 0, user_count: 0 },
];

const ELK_REF = { id: "d-elk", code: "ELK", name: "Elektrik", color: "#cbd5e1" };

export const AHMET: FakeUser = {
  id: "u-ahmet",
  email: "ahmet.yilmaz@fiilinsaat.com",
  full_name: "Ahmet Yılmaz",
  title: "Şantiye Şefi",
  role_id: "r-site",
  status: "active",
  all_projects: false,
  project_count: 2,
};
export const AYSE: FakeUser = {
  id: "u-ayse",
  email: "a.demir@fiilinsaat.com",
  full_name: "Ayşe Demir",
  title: "Muhasebe",
  role_id: "r-patron",
  status: "active",
  all_projects: true,
  project_count: 0,
};
export const KADIR: FakeUser = {
  id: "u-kadir",
  email: "k.arslan@fiilinsaat.com",
  full_name: "Kadir Arslan",
  title: "Proje Müdürü",
  role_id: "r-pm",
  status: "on_leave",
  all_projects: false,
  project_count: 0,
};

export const AHMET_ACCESS: FakeAccess = {
  role_id: "r-site",
  all_projects: false,
  projects: [
    { project_id: "p-avm", project_name: "AVM", role_id: "r-field", disciplines: [] },
    { project_id: "p-kule", project_name: "Kule A", role_id: "r-site", disciplines: [ELK_REF] },
  ],
};
export const AYSE_ACCESS: FakeAccess = { role_id: "r-patron", all_projects: true, projects: [] };

export interface FakeBackendOptions {
  users?: FakeUser[];
  access?: Record<string, FakeAccess>;
  /** `PUT /users/{id}/access` yanıtı; verilmezse gövde 200 ile yankılanır. */
  putAccess?: (body: unknown) => { status: number; json: unknown };
  /** `POST /users` yanıtı. */
  postUser?: (body: unknown) => { status: number; json: unknown };
  patchUser?: (body: unknown) => { status: number; json: unknown };
}

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function createUsersBackend(options: FakeBackendOptions = {}) {
  const users = options.users ?? [AHMET, AYSE];
  const access = options.access ?? { [AHMET.id]: AHMET_ACCESS, [AYSE.id]: AYSE_ACCESS };
  const calls: FakeCall[] = [];

  const fetchFake = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/backend/, "");
    const method = request.method;
    const raw = method === "GET" || method === "DELETE" ? "" : await request.clone().text();
    const body: unknown = raw === "" ? undefined : JSON.parse(raw);
    calls.push({ method, path, query: url.searchParams, body });

    if (method === "GET" && path === "/users") {
      const q = (url.searchParams.get("q") ?? "").toLocaleLowerCase("tr");
      const items = users.filter(
        (user) => q === "" || user.full_name.toLocaleLowerCase("tr").includes(q) || user.email.includes(q),
      );
      return json({ items, total: items.length, limit: 20, offset: 0 });
    }
    if (method === "POST" && path === "/users") {
      const reply = options.postUser?.(body) ?? {
        status: 201,
        json: { ...AYSE, id: "u-new", full_name: "Yeni Kişi", email: "yeni@fiilinsaat.com", all_projects: false, project_count: 0 },
      };
      return json(reply.json, reply.status);
    }
    const accessMatch = path.match(/^\/users\/([^/]+)\/access$/);
    if (accessMatch && method === "GET") {
      const found = access[accessMatch[1]];
      return found ? json(found) : json({ detail: "Kullanıcı bulunamadı" }, 404);
    }
    if (accessMatch && method === "PUT") {
      const reply = options.putAccess?.(body) ?? { status: 200, json: { ...(body as object), projects: [] } };
      return json(reply.json, reply.status);
    }
    if (/^\/users\/[^/]+$/.test(path) && method === "PATCH") {
      const reply = options.patchUser?.(body) ?? { status: 200, json: { ...AHMET, ...(body as object) } };
      return json(reply.json, reply.status);
    }
    if (/^\/users\/[^/]+$/.test(path) && method === "DELETE") return json(null, 204);
    if (/\/password$/.test(path) && method === "PATCH") return json(null, 204);
    if (path === "/roles") return json(ROLES);
    if (path === "/projects") {
      return json({ counts: { all: 3, taahhut: 3, kendi_yatirim: 0, kat_karsiligi: 0, completed: 0 }, items: PROJECTS, total: 3 });
    }
    if (path === "/earned-value/disciplines") return json(DISCIPLINES);
    return json({ detail: `testkit: tanımsız uç ${method} ${path}` }, 404);
  };

  return {
    fetch: fetchFake,
    calls,
    /** Belirli yöntem + yol için kayıtlı çağrılar. */
    callsTo: (method: string, pathPattern: RegExp) =>
      calls.filter((call) => call.method === method && pathPattern.test(call.path)),
  };
}
