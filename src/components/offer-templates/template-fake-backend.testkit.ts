/**
 * TKL-F4.5 · TEST YARDIMCISI — şablon uçlarının durumlu sahte backend'i (jsdom bileşen testleri).
 * `backendClient` mock'larına bağlanır: `vi.mocked(backendClient.GET).mockImplementation((p, i) => fake.handle("GET", p, i))`.
 * Gerçek sözleşme davranışları: varsayılan önce sıralı liste, TAM değiştirme PUT (kalem kimlikleri YENİDEN üretilir),
 * `expected_updated_at` uyuşmazsa 409, tek varsayılan, kopya "(kopya)", silmede 204. Bu dosya `vitest` ithal ETMEZ.
 */
import type { OfferTemplateDetail, OfferTemplateGroupRead, OfferTemplateListItem } from "@/lib/api/hooks/useOfferTemplates";

export const STALE_DETAIL = "Şablon başka biri tarafından değiştirildi; sayfayı yenileyin";

export interface FakeTemplate {
  id: string;
  name: string;
  description: string | null;
  overhead_pct: string | null;
  profit_pct: string | null;
  is_default: boolean;
  usage_count: number;
  groups: { name: string; items: string[] }[];
}

export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

type Init = { params?: { path?: Record<string, string>; query?: Record<string, unknown> }; body?: unknown } | undefined;

export interface FakeOptions {
  templates: FakeTemplate[];
  catalog?: Record<string, unknown>[];
  disciplines?: { id: string; name: string }[];
  offers?: Record<string, unknown>[];
  settings?: { default_overhead_pct: string; default_profit_pct: string };
  /** `"PUT /offers/templates/{template_id}/content"` → bu yanıt (durum + gövde) — bir kez tüketilir. */
  failures?: Record<string, { status: number; detail: string }>;
}

export function createFakeBackend(options: FakeOptions) {
  let clock = 0;
  let idSeq = 0;
  const stamp = () => new Date(Date.UTC(2026, 8, 12, 9, 30, (clock += 1))).toISOString();
  const rows = new Map<string, FakeTemplate & { updated_at: string }>();
  const order: string[] = [];
  const failures = { ...(options.failures ?? {}) };
  const calls: RecordedCall[] = [];

  const add = (template: FakeTemplate) => {
    rows.set(template.id, { ...template, updated_at: stamp() });
    order.push(template.id);
  };
  options.templates.forEach(add);

  const itemCount = (t: FakeTemplate) => t.groups.reduce((sum, g) => sum + g.items.length, 0);
  const catalogOf = (id: string) =>
    (options.catalog ?? []).find((c) => c.id === id) as { poz_no?: string; name?: string; uom?: string } | undefined;

  function groupsRead(t: FakeTemplate): OfferTemplateGroupRead[] {
    return t.groups.map((g, gi) => ({
      id: `g-${t.id}-${(idSeq += 1)}`,
      name: g.name,
      sort_order: gi,
      items: g.items.map((catalogId, ii) => ({
        id: `i-${(idSeq += 1)}`,
        sort_order: ii,
        catalog_item_id: catalogId,
        poz_no: catalogOf(catalogId)?.poz_no ?? catalogId,
        description: catalogOf(catalogId)?.name ?? `Kalem ${catalogId}`,
        unit: catalogOf(catalogId)?.uom ?? "m²",
      })),
    }));
  }

  const detailOf = (t: FakeTemplate & { updated_at: string }): OfferTemplateDetail => ({
    id: t.id,
    name: t.name,
    description: t.description,
    overhead_pct: t.overhead_pct,
    profit_pct: t.profit_pct,
    is_default: t.is_default,
    group_count: t.groups.length,
    item_count: itemCount(t),
    // Gerçekte detay önbelleği teklif oluşturunca bayat kalır: bilerek LİSTEDEN farklı.
    usage_count: 0,
    created_at: "2026-09-01T08:00:00Z",
    updated_at: t.updated_at,
    groups: groupsRead(t),
  });

  const listItemOf = (t: FakeTemplate & { updated_at: string }): OfferTemplateListItem => ({
    id: t.id,
    name: t.name,
    description: t.description,
    overhead_pct: t.overhead_pct,
    profit_pct: t.profit_pct,
    is_default: t.is_default,
    group_count: t.groups.length,
    item_count: itemCount(t),
    usage_count: t.usage_count,
    updated_at: t.updated_at,
  });

  const ok = (data: unknown, status = 200) => ({ data, error: undefined, response: new Response(null, { status }) }) as never;
  const fail = (status: number, detail: string) =>
    ({ data: undefined, error: { detail }, response: new Response(null, { status }) }) as never;

  function sortedList() {
    return order
      .map((id) => rows.get(id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined)
      .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name, "tr"));
  }

  function writeGuard(method: string, path: string, id: string | undefined, body: unknown) {
    const injected = failures[`${method} ${path}`];
    if (injected !== undefined) {
      delete failures[`${method} ${path}`];
      return fail(injected.status, injected.detail);
    }
    const row = id === undefined ? undefined : rows.get(id);
    if (id !== undefined && row === undefined) return fail(404, "Teklif şablonu bulunamadı");
    const expected = (body as { expected_updated_at?: string } | undefined)?.expected_updated_at;
    if (row !== undefined && expected !== undefined && expected !== row.updated_at) return fail(409, STALE_DETAIL);
    return null;
  }

  function newRow(base: Partial<FakeTemplate> & { name: string }) {
    idSeq += 1;
    const row: FakeTemplate = {
      id: `tpl-new-${idSeq}`,
      description: null,
      overhead_pct: null,
      profit_pct: null,
      is_default: false,
      usage_count: 0,
      groups: [],
      ...base,
    };
    add(row);
    return rows.get(row.id) as FakeTemplate & { updated_at: string };
  }

  function handle(method: string, path: string, init: Init) {
    const id = init?.params?.path?.template_id;
    const body = init?.body;
    calls.push({ method, path, body });
    if (method === "GET") return handleGet(path, id);
    return handleWrite(method, path, id, body);
  }

  function handleGet(path: string, id: string | undefined) {
    if (path === "/offers/templates") return ok({ items: sortedList().map(listItemOf), total: rows.size });
    if (path === "/offers/templates/{template_id}") {
      const row = id === undefined ? undefined : rows.get(id);
      return row === undefined ? fail(404, "Teklif şablonu bulunamadı") : ok(detailOf(row));
    }
    if (path === "/catalog/items") return ok({ items: options.catalog ?? [], total: (options.catalog ?? []).length });
    if (path === "/catalog/disciplines") return ok({ items: options.disciplines ?? [] });
    if (path === "/offers/settings") {
      return ok({ default_overhead_pct: "12.00", default_profit_pct: "18.50", default_vat_pct: "20.00", ...options.settings });
    }
    if (path === "/offers") {
      const offers = options.offers ?? [];
      return ok({ items: offers, total: offers.length, limit: 8, offset: 0, summary: { by_status: [], expired_count: 0, win_rate: null, won_not_converted_count: 0 } });
    }
    throw new Error(`beklenmeyen GET ${path}`);
  }

  function handleWrite(method: string, path: string, id: string | undefined, body: unknown) {
    const blocked = writeGuard(method, path, id, body);
    if (blocked !== null) return blocked;
    const row = id === undefined ? undefined : rows.get(id);
    const b = (body ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- istek gövdesi gezinmesi
    if (method === "POST" && path === "/offers/templates") {
      return ok(detailOf(newRow({ name: b.name, description: b.description ?? null, overhead_pct: b.overhead_pct ?? null, profit_pct: b.profit_pct ?? null })), 201);
    }
    if (method === "POST" && path === "/offers/templates/from-offer") {
      return ok(detailOf(newRow({ name: b.name, description: b.description ?? null, overhead_pct: "10.00", profit_pct: "14.00", groups: [{ name: "Betonarme", items: ["cat-1"] }] })), 201);
    }
    if (row === undefined) throw new Error(`beklenmeyen ${method} ${path}`);
    if (method === "POST" && path.endsWith("/copy")) {
      const { id: _id, ...source } = row;
      void _id;
      const copy = newRow({ ...source, name: b.name ?? `${row.name} (kopya)`, is_default: false, usage_count: 0, groups: row.groups.map((g) => ({ ...g, items: [...g.items] })) });
      return ok(detailOf(copy), 201);
    }
    if (method === "POST" && path.endsWith("/default")) {
      rows.forEach((r) => {
        r.is_default = r.id === row.id;
        r.updated_at = r.id === row.id ? stamp() : r.updated_at;
      });
      return ok(detailOf(row));
    }
    if (method === "PATCH") {
      const { expected_updated_at: _ignored, ...fields } = b;
      void _ignored;
      Object.assign(row, fields);
      row.updated_at = stamp();
      return ok(detailOf(row));
    }
    if (method === "PUT") {
      row.groups = b.groups.map((g: { name: string; items?: { catalog_item_id: string }[] }) => ({ name: g.name, items: (g.items ?? []).map((i) => i.catalog_item_id) }));
      row.updated_at = stamp();
      return ok(detailOf(row));
    }
    if (method === "DELETE") {
      rows.delete(row.id);
      order.splice(order.indexOf(row.id), 1);
      return ok(undefined, 204);
    }
    throw new Error(`beklenmeyen ${method} ${path}`);
  }

  return {
    handle,
    calls,
    row: (id: string) => rows.get(id),
    count: () => rows.size,
    callsTo: (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path),
  };
}

export type FakeBackend = ReturnType<typeof createFakeBackend>;
