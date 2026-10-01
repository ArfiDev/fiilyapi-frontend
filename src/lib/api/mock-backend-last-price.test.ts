// @vitest-environment node
//
// TKL-F2.2 · test ikizinin (`e2e/mock-backend.ts`) katalog-sözleşme bağı ve SON FİYAT türetmesi.
// Backend ikizi (TKL-B3, dal `tkl-b3-son-fiyat`):
//   · `contracts/service.py::create_employer_items_bulk` — HEP YA HİÇ; doğrulama sırası
//     grup (422) → katalog (404) → gövde içi kod tekrarı (409) → DB kod çakışması (409);
//   · `contracts/last_price_provider.py` (SZL) · `progress_payments/last_price_provider.py` (HK)
//     · `core/last_price.py` (birleştirme) — T28/T29.
//
// İki katman: (1) HTTP — tohum + toplu uç + tekli uç + kaynak akışı; (2) SAF türetme
// (`lastPricesByCatalogItem`) — kural tabloları, her testte taze durum.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { lastPricesByCatalogItem, startMockBackend } from "../../../e2e/mock-backend";
import type { components } from "@/lib/api/schema";

type S = components["schemas"];

let base = "";
let close: () => Promise<void>;

beforeEach(async () => {
  const started = startMockBackend(0);
  close = started.close;
  await new Promise<void>((resolve) => started.server.once("listening", () => resolve()));
  const address = started.server.address();
  if (address === null || typeof address === "string") throw new Error("ikiz port alamadı");
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
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

interface Plain {
  detail?: unknown;
}

const catalog = async () => (await call<{ items: S["WorkItemRead"][] }>("GET", "/catalog/items")).json.items;
const catalogByName = async (name: string) => {
  const found = (await catalog()).find((item) => item.name === name);
  if (found === undefined) throw new Error(`katalog kalemi yok: ${name}`);
  return found;
};
const e14 = async (projectId = "p-1") =>
  (await call<S["EmployerContractItemsResponse"]>("GET", `/projects/${projectId}/contract/items`)).json;
const e14Items = async (projectId = "p-1") => (await e14(projectId)).groups.flatMap((g) => g.items);
const groupId = async (name: string) => {
  const found = (await e14()).groups.find((g) => g.name === name);
  if (found === undefined) throw new Error(`grup yok: ${name}`);
  return found.id;
};

const entry = (group: string, code: string, extra: Record<string, unknown> = {}) => ({
  group_id: group,
  code,
  description: `Kalem ${code}`,
  unit: "m³",
  quantity: "10.5",
  unit_price: "100.00",
  ...extra,
});
const bulk = (items: unknown[], projectId = "p-1") =>
  call<{ items: S["EmployerContractItemResponse"][] } & Plain>("POST", `/projects/${projectId}/contract/items/bulk`, { items });

const lastPriceOf = async (name: string) => (await catalogByName(name)).last_price;
const asTime = (iso: string | undefined) => Date.parse(iso ?? "");

/* ═══════════════════════════ 1 · TOHUM ═══════════════════════════════════ */

describe("GET /catalog/items · last_price tohumu", () => {
  it("her kalemde `last_price` anahtarı var; kaynaksız kalem null", async () => {
    const items = await catalog();
    for (const item of items) expect(item).toHaveProperty("last_price");
    expect((await catalogByName("Beton döküm")).last_price).toBeNull();
    expect((await catalogByName("Kablo çekimi")).last_price).toBeNull();
  });

  it("SZL'li kalem: sözleşme kalemi fiyatı, proje kodu etiketi, proje id belge kimliği", async () => {
    const price = await lastPriceOf("Kalıp");
    expect(price).toEqual({
      price: "185.00",
      at: "2026-09-15T09:00:00Z",
      source: "SZL",
      doc_no: "PRJ-1",
      doc_id: "p-1",
    });
  });

  it("HK'li kalem: onaylı işveren hakedişi, B.F. x katsayı (2 hane), HK-{proje kodu}-{sıra}", async () => {
    const price = await lastPriceOf("Demir");
    expect(price).toEqual({
      price: "24553.00", // 21500.00 x 1.142 (ELLE)
      at: "2026-09-12T10:00:00Z",
      source: "HK",
      doc_no: "HK-PRJ-1-7",
      doc_id: "pp-hk-1",
    });
  });

  it("tohum tam üç durumu taşır: iki kaynaklı, kalanı null", async () => {
    const sourced = (await catalog()).filter((item) => item.last_price !== null).map((item) => item.name);
    expect(sourced.sort()).toEqual(["Demir", "Kalıp"]);
  });

  it("onay GERİ ALINIRSA hakediş kaynak olmaz: HK düşer, SZL fiyatı kalır", async () => {
    const undone = await call<Plain>("POST", "/progress-payments/pp-hk-1/unapprove");
    expect(undone.status).toBe(200);
    const price = await lastPriceOf("Demir");
    expect(price?.source).toBe("SZL");
    expect(price?.price).toBe("21500.00");
    expect(price?.doc_no).toBe("PRJ-1");
  });

  it("HK satırının tabanı güncel sözleşme fiyatından FARKLIYSA (bayat taban) HK kaynak olmaz; fiyat değişimi SZL'yi yeniler", async () => {
    const before = await lastPriceOf("Demir");
    expect(before?.source).toBe("HK");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const patched = await call<Plain>("PATCH", "/contracts/employer/items/ci-3", { unit_price: "23000.00" });
    expect(patched.status).toBe(200);
    const after = await lastPriceOf("Demir");
    expect(after?.source).toBe("SZL");
    expect(after?.price).toBe("23000.00");
    expect(asTime(after?.at)).toBeGreaterThan(asTime("2026-09-24T09:00:00Z"));
  });

  it("fiyatı DEĞİŞMEYEN PATCH `at`i ilerletmez (1850.5 == 1850.50 değişim sayılmaz)", async () => {
    const before = await lastPriceOf("Kalıp");
    const patched = await call<Plain>("PATCH", "/contracts/employer/items/ci-4", { unit_price: "185", description: "Yeni" });
    expect(patched.status).toBe(200);
    expect((await lastPriceOf("Kalıp"))?.at).toBe(before?.at);
  });

  it("POST/PATCH /catalog/items yanıtı da last_price taşır", async () => {
    const kalip = await catalogByName("Kalıp");
    const patched = await call<S["WorkItemRead"]>("PATCH", `/catalog/items/${kalip.id}`, { description: "x" });
    expect(patched.status).toBe(200);
    expect(patched.json.last_price?.price).toBe("185.00");
    const created = await call<S["WorkItemRead"]>("POST", "/catalog/items", {
      discipline_id: kalip.discipline.id,
      name: "Yepyeni kalem",
      uom: "adet",
      standard_unit_mhr: "1.5",
      default_contractor_type: "own",
    });
    expect(created.status).toBe(201);
    expect(created.json.last_price).toBeNull();
  });
});

/* ═══════════════════════════ 2 · TOPLU UÇ ════════════════════════════════ */

describe("POST /projects/{id}/contract/items/bulk", () => {
  it("201 + EmployerContractItemsBulkResponse: istek sırası, catalog_item_id taşınır, dağıtım 0", async () => {
    const beton = await catalogByName("Beton döküm");
    const tugla = await catalogByName("Tuğla duvar");
    const group = await groupId("Kalıp İşleri");
    const before = (await e14Items()).length;

    const result = await bulk([
      entry(group, "K.001", { catalog_item_id: beton.id, quantity: "12.5", unit_price: "2450.00" }),
      entry(group, "K.002", { catalog_item_id: tugla.id, quantity: "3", unit_price: "310.50" }),
      entry(group, "K.003"),
    ]);

    expect(result.status).toBe(201);
    expect(result.json.items.map((item) => item.code)).toEqual(["K.001", "K.002", "K.003"]);
    expect(result.json.items.map((item) => item.catalog_item_id)).toEqual([beton.id, tugla.id, null]);
    expect(result.json.items.map((item) => item.group_id)).toEqual([group, group, group]);
    expect(result.json.items.map((item) => item.distributed_quantity)).toEqual(["0.000", "0.000", "0.000"]);
    expect(result.json.items.map((item) => item.remaining_quantity)).toEqual(["12.500", "3.000", "10.500"]);
    expect(result.json.items[0].unit_price).toBe("2450.00");
    expect((await e14Items()).length).toBe(before + 3);
    const listed = (await e14Items()).find((item) => item.code === "K.001");
    expect(listed?.catalog_item_id).toBe(beton.id);
  });

  it("tohum kalemleri catalog_item_id'yi E14 listesinde taşır (bağlı olanlar) — diğerleri null", async () => {
    const items = await e14Items();
    const byCode = Object.fromEntries(items.map((item) => [item.code, item.catalog_item_id]));
    expect(byCode["03.001"]).toBeNull();
    expect(byCode["03.002"]).toBeNull();
    expect(byCode["03.003"]).toBe((await catalogByName("Demir")).id);
    expect(byCode["03.010"]).toBe((await catalogByName("Kalıp")).id);
  });

  it("HEP YA HİÇ: gövde içi kod tekrarı → 409 (kod metinde), HİÇBİR kalem eklenmez", async () => {
    const group = await groupId("Kalıp İşleri");
    const before = await e14Items();
    const result = await bulk([entry(group, "D.1"), entry(group, "D.2"), entry(group, "D.1")]);
    expect(result.status).toBe(409);
    expect(result.json.detail).toBe("Bu poz numarası bu sözleşmede zaten kullanılıyor: D.1");
    expect(await e14Items()).toEqual(before);
  });

  it("HEP YA HİÇ: sözleşmede VAR OLAN kodla çakışma → 409; çakışmadan ÖNCEKİ kalemler de eklenmez", async () => {
    const group = await groupId("Kalıp İşleri");
    const before = await e14Items();
    const result = await bulk([entry(group, "E.1"), entry(group, "E.2"), entry(group, "03.001")]);
    expect(result.status).toBe(409);
    expect(result.json.detail).toBe("Bu poz numarası bu sözleşmede zaten kullanılıyor: 03.001");
    expect(await e14Items()).toEqual(before);
  });

  it("DB çakışmasında İLK çakışan KALEM (istek sırası) bildirilir", async () => {
    const group = await groupId("Kalıp İşleri");
    const result = await bulk([entry(group, "03.010"), entry(group, "03.001")]);
    expect(result.status).toBe(409);
    expect(result.json.detail).toBe("Bu poz numarası bu sözleşmede zaten kullanılıyor: 03.010");
  });

  it("HEP YA HİÇ: bilinmeyen katalog kalemi → 404 `Katalog iş tipi bulunamadı`, hiçbiri eklenmez", async () => {
    const beton = await catalogByName("Beton döküm");
    const group = await groupId("Kalıp İşleri");
    const before = await e14Items();
    const result = await bulk([
      entry(group, "N.1", { catalog_item_id: beton.id }),
      entry(group, "N.2", { catalog_item_id: "00000000-0000-4000-8000-000000000999" }),
    ]);
    expect(result.status).toBe(404);
    expect(result.json.detail).toBe("Katalog iş tipi bulunamadı");
    expect(await e14Items()).toEqual(before);
  });

  it("başka sözleşmenin / olmayan grup → 422 `Poz grubu bu sözleşmeye ait değil`, hiçbiri eklenmez", async () => {
    const group = await groupId("Kalıp İşleri");
    const before = await e14Items();
    const result = await bulk([entry(group, "G.1"), entry("00000000-0000-4000-8000-000000000777", "G.2")]);
    expect(result.status).toBe(422);
    expect(result.json.detail).toBe("Poz grubu bu sözleşmeye ait değil");
    expect(await e14Items()).toEqual(before);
  });

  it("doğrulama SIRASI: grup (422) → katalog (404) → gövde içi tekrar (409) → DB çakışması (409)", async () => {
    const group = await groupId("Kalıp İşleri");
    const ghostGroup = "00000000-0000-4000-8000-000000000777";
    const ghostCatalog = "00000000-0000-4000-8000-000000000999";
    // dört ihlalin HEPSİ aynı gövdede
    const all = [
      entry(group, "03.001", { catalog_item_id: ghostCatalog }),
      entry(group, "03.001"),
      entry(ghostGroup, "Z.1"),
    ];
    expect((await bulk(all)).status).toBe(422);
    expect((await bulk(all.slice(0, 2))).status).toBe(404); // grup ihlali yok → katalog
    const noCatalog = [entry(group, "03.001"), entry(group, "03.001")];
    const dup = await bulk(noCatalog);
    expect(dup.status).toBe(409); // hem gövde içi hem DB: ilki bildirilir
    expect(dup.json.detail).toBe("Bu poz numarası bu sözleşmede zaten kullanılıyor: 03.001");
    const dbOnly = await bulk([entry(group, "ZZ.1"), entry(group, "03.002")]);
    expect(dbOnly.json.detail).toBe("Bu poz numarası bu sözleşmede zaten kullanılıyor: 03.002");
  });

  it("şema: boş liste → 422 too_short, 201 kalem → 422 too_long, `items` yok → 422 missing", async () => {
    const group = await groupId("Kalıp İşleri");
    const empty = await bulk([]);
    expect(empty.status).toBe(422);
    expect((empty.json.detail as { type: string; loc: unknown[] }[])[0]).toMatchObject({ type: "too_short", loc: ["body", "items"] });
    const many = await bulk(Array.from({ length: 201 }, (_, index) => entry(group, `M.${index}`)));
    expect(many.status).toBe(422);
    expect((many.json.detail as { type: string }[])[0].type).toBe("too_long");
    const missing = await call<{ detail: { type: string; loc: unknown[] }[] }>("POST", "/projects/p-1/contract/items/bulk", {});
    expect(missing.status).toBe(422);
    expect(missing.json.detail[0]).toMatchObject({ type: "missing", loc: ["body", "items"] });
  });

  it("şema: tam üst sınır (200 kalem) kabul edilir", async () => {
    const group = await groupId("Kalıp İşleri");
    const result = await bulk(Array.from({ length: 200 }, (_, index) => entry(group, `U.${index}`)));
    expect(result.status).toBe(201);
    expect(result.json.items).toHaveLength(200);
  });

  it("şema: kalem alanı ihlali tam yolla (`body.items.1.quantity`) 422 — miktar 0, negatif fiyat, uzun kod, eksik alan", async () => {
    const group = await groupId("Kalıp İşleri");
    const cases: [Record<string, unknown>, string, string][] = [
      [entry(group, "S.1", { quantity: "0" }), "quantity", "greater_than"],
      [entry(group, "S.1", { unit_price: "-1" }), "unit_price", "greater_than_equal"],
      [entry(group, "S.1", { code: "x".repeat(51) }), "code", "string_too_long"],
      [{ ...entry(group, "S.1"), unit: undefined }, "unit", "missing"],
    ];
    for (const [bad, field, type] of cases) {
      const result = await call<{ detail: { type: string; loc: unknown[] }[] }>("POST", "/projects/p-1/contract/items/bulk", {
        items: [entry(group, "S.0"), bad],
      });
      expect(result.status).toBe(422);
      expect(result.json.detail[0]).toMatchObject({ type, loc: ["body", "items", 1, field] });
    }
    expect((await e14Items()).some((item) => item.code === "S.0")).toBe(false);
  });

  it("şema ihlali 404'ten ÖNCE gelir (FastAPI gövde doğrulaması işleyiciden önce): olmayan projede boş liste 422", async () => {
    expect((await bulk([], "p-999")).status).toBe(422);
  });

  it("bilinmeyen proje ve sözleşmesiz proje → 404 `Sözleşme bulunamadı`", async () => {
    const group = await groupId("Kalıp İşleri");
    for (const projectId of ["p-999", "p-2"]) {
      const result = await bulk([entry(group, "P.1")], projectId);
      expect(result.status).toBe(404);
      expect(result.json.detail).toBe("Sözleşme bulunamadı");
    }
  });

  it("boş sözleşme projesi (p-4): kendi grubuyla toplu ekleme çalışır; p-1 grubu p-4'e yabancıdır (422)", async () => {
    const created = await call<{ id: string }>("POST", "/projects/p-4/contract/groups", { name: "Yeni grup", sort_order: 0 });
    expect(created.status).toBe(201);
    const foreign = await bulk([entry(await groupId("Kalıp İşleri"), "Q.1")], "p-4");
    expect(foreign.status).toBe(422);
    const ok = await bulk([entry(created.json.id, "Q.1")], "p-4");
    expect(ok.status).toBe(201);
    expect((await e14Items("p-4")).map((item) => item.code)).toEqual(["Q.1"]);
    expect((await e14Items("p-1")).some((item) => item.code === "Q.1")).toBe(false);
  });

  it("kod tekilliği SÖZLEŞME (proje) içindedir: p-1'de kullanılan kod p-4'te serbest", async () => {
    const created = await call<{ id: string }>("POST", "/projects/p-4/contract/groups", { name: "Grup", sort_order: 0 });
    const result = await bulk([entry(created.json.id, "03.001")], "p-4");
    expect(result.status).toBe(201);
  });
});

/* ═══════════════════════════ 3 · TEKLİ UÇLAR ═════════════════════════════ */

describe("tekli ekleme/güncelleme · catalog_item_id", () => {
  it("POST: catalog_item_id OPSİYONEL; verilirse kalem bağlanır ve yanıt taşır", async () => {
    const group = await groupId("Kalıp İşleri");
    const beton = await catalogByName("Beton döküm");
    const plain = await call<S["EmployerContractItemResponse"]>("POST", "/projects/p-1/contract/items", entry(group, "T.1"));
    expect(plain.status).toBe(201);
    expect(plain.json.catalog_item_id).toBeNull();
    const linked = await call<S["EmployerContractItemResponse"]>(
      "POST",
      "/projects/p-1/contract/items",
      entry(group, "T.2", { catalog_item_id: beton.id }),
    );
    expect(linked.status).toBe(201);
    expect(linked.json.catalog_item_id).toBe(beton.id);
  });

  it("POST: bilinmeyen katalog → 404 ve kalem YAZILMAZ", async () => {
    const group = await groupId("Kalıp İşleri");
    const before = await e14Items();
    const result = await call<Plain>(
      "POST",
      "/projects/p-1/contract/items",
      entry(group, "T.3", { catalog_item_id: "00000000-0000-4000-8000-000000000999" }),
    );
    expect(result.status).toBe(404);
    expect(result.json.detail).toBe("Katalog iş tipi bulunamadı");
    expect(await e14Items()).toEqual(before);
  });

  it("PATCH: gövdede `catalog_item_id` anahtarı (null dahil) → 422 `Katalog bağı sonradan değiştirilemez`, bağ ve diğer alanlar DEĞİŞMEZ", async () => {
    const beton = await catalogByName("Beton döküm");
    const kalip = await catalogByName("Kalıp");
    for (const value of [beton.id, null]) {
      const result = await call<{ detail: { type: string; loc: unknown[]; msg: string }[] }>(
        "PATCH",
        "/contracts/employer/items/ci-4",
        { catalog_item_id: value, description: "Değişmemeli" },
      );
      expect(result.status).toBe(422);
      expect(result.json.detail[0]).toMatchObject({
        type: "value_error",
        loc: ["body"],
        msg: "Value error, Katalog bağı sonradan değiştirilemez",
      });
    }
    const item = (await e14Items()).find((entryItem) => entryItem.id === "ci-4");
    expect(item?.catalog_item_id).toBe(kalip.id);
    expect(item?.description).toBe("Döşeme Kalıbı");
  });

  it("PATCH: başka alan bağı KORUR", async () => {
    const kalip = await catalogByName("Kalıp");
    const result = await call<S["EmployerContractItemResponse"]>("PATCH", "/contracts/employer/items/ci-4", {
      description: "Yeni açıklama",
      unit_price: "200.00",
    });
    expect(result.status).toBe(200);
    expect(result.json.catalog_item_id).toBe(kalip.id);
  });
});

/* ═══════════════════════════ 4 · SZL KAYNAĞI (HTTP) ══════════════════════ */

describe("son fiyat · SZL akışı", () => {
  it("toplu eklenen bağlı kalem kaynak olur: fiyat, ŞİMDİ damgası, proje kodu etiketi", async () => {
    const beton = await catalogByName("Beton döküm");
    expect(beton.last_price).toBeNull();
    const group = await groupId("Kalıp İşleri");
    const before = Date.now();
    await bulk([entry(group, "B.1", { catalog_item_id: beton.id, unit_price: "2600.00" })]);
    const price = await lastPriceOf("Beton döküm");
    expect(price).toMatchObject({ price: "2600.00", source: "SZL", doc_no: "PRJ-1", doc_id: "p-1" });
    expect(asTime(price?.at)).toBeGreaterThanOrEqual(before - 1000);
  });

  it("katalogsuz (bağsız) kalem kaynak OLMAZ", async () => {
    const group = await groupId("Kalıp İşleri");
    await bulk([entry(group, "B.2")]);
    expect((await catalog()).filter((item) => item.last_price !== null).map((item) => item.name).sort()).toEqual(["Demir", "Kalıp"]);
  });

  it.each([
    ["düşük sonra yüksek", ["90.00", "120.00"]],
    ["yüksek sonra düşük", ["120.00", "90.00"]],
  ])("T29: aynı projede aynı kalemde birden çok fiyat → EN YÜKSEK, zaman MAX(price_changed_at) (%s)", async (_label, prices) => {
    const beton = await catalogByName("Beton döküm");
    const group = await groupId("Kalıp İşleri");
    await bulk([entry(group, "H.1", { catalog_item_id: beton.id, unit_price: prices[0] })]);
    await new Promise((resolve) => setTimeout(resolve, 8));
    const second = await call<Plain>("POST", "/projects/p-1/contract/items", entry(group, "H.2", { catalog_item_id: beton.id, unit_price: prices[1] }));
    expect(second.status).toBe(201);
    const price = await lastPriceOf("Beton döküm");
    expect(price?.price).toBe("120.00");
    expect(price?.doc_no).toBe("PRJ-1");
    // zaman = MAX(price_changed_at): İKİNCİ kalemin damgası (ilkinden sonra), en yüksek fiyatınki DEĞİL
    expect(asTime(price?.at)).toBeGreaterThan(Date.now() - 60_000);
    expect((await e14Items()).filter((item) => item.catalog_item_id === beton.id)).toHaveLength(2);
  });
});

/* ═══════════════════════════ 5 · SAF TÜRETME ═════════════════════════════ */

type DeriveInput = Parameters<typeof lastPricesByCatalogItem>[0];

const T0 = Date.parse("2026-03-01T09:00:00Z");
const iso = (days: number) => new Date(T0 + days * 86_400_000).toISOString();

function item(id: string, projectId: string, catalogId: string | null, price: string, at: string) {
  return {
    id,
    projectId,
    code: id,
    description: id,
    unit: "m3",
    quantity: "10.000",
    unit_price: price,
    groupName: "G",
    groupSortOrder: 0,
    allocations: [],
    catalogItemId: catalogId,
    priceChangedAt: at,
  };
}

function line(itemId: string, base: string, coefficient: string, site = "s-1") {
  return {
    id: `l-${itemId}-${site}-${coefficient}`,
    contract_item_id: itemId,
    site_id: site,
    contract_unit_price: base,
    coefficient,
  };
}

function payment(
  id: string,
  projectId: string,
  seq: number,
  status: string,
  approvedAt: string | null,
  lines: ReturnType<typeof line>[],
) {
  return { id, project_id: projectId, sequence_no: seq, status, approved_at: approvedAt, lines };
}

const projects = [
  { id: "pA", code: "PRJ-A" },
  { id: "pB", code: "PRJ-B" },
];

function derive(
  contractItems: ReturnType<typeof item>[],
  payments: ReturnType<typeof payment>[] = [],
  projectList = projects,
) {
  return lastPricesByCatalogItem({ projects: projectList, contractItems, progressPayments: payments } as unknown as DeriveInput);
}

describe("lastPricesByCatalogItem · SZL", () => {
  it("iki projede EN YENİ zaman kazanır", () => {
    const result = derive([item("a", "pA", "c1", "100.00", iso(0)), item("b", "pB", "c1", "130.00", iso(5))]);
    expect(result.get("c1")).toEqual({ price: "130.00", at: iso(5), source: "SZL", doc_no: "PRJ-B", doc_id: "pB" });
  });

  it.each([false, true])("eşit zamanda küçük proje kodu kazanır, kayıt sırasından bağımsız (ters=%s)", (ters) => {
    const rows = [item("a", "pA", "c1", "100.00", iso(0)), item("b", "pB", "c1", "130.00", iso(0))];
    const result = derive(ters ? [...rows].reverse() : rows);
    expect(result.get("c1")).toMatchObject({ doc_no: "PRJ-A", price: "100.00" });
  });

  it.each([false, true])("T29: aynı projede aynı kalemde iki fiyat → EN YÜKSEK (yeni değil), zaman MAX (ters=%s)", (ters) => {
    const rows = [item("a", "pA", "c1", "120.00", iso(0)), item("b", "pA", "c1", "90.00", iso(1))];
    const result = derive(ters ? [...rows].reverse() : rows);
    expect(result.get("c1")).toEqual({ price: "120.00", at: iso(1), source: "SZL", doc_no: "PRJ-A", doc_id: "pA" });
  });

  it("T29 yüksek fiyat ESKİ projede, düşük fiyat YENİ projede → yeni PROJE kazanır (en yüksek yalnız belge İÇİ)", () => {
    const result = derive([item("a", "pA", "c1", "500.00", iso(0)), item("b", "pB", "c1", "90.00", iso(3))]);
    expect(result.get("c1")).toMatchObject({ price: "90.00", doc_no: "PRJ-B" });
  });

  it("bağsız kalem kaynak olmaz; sonuçta kaynaksız kalem YOKTUR", () => {
    const result = derive([item("a", "pA", null, "100.00", iso(0))]);
    expect(result.size).toBe(0);
  });

  it("MAX ondalık karşılaştırır (metin sırası DEĞİL): 99.00 < 1000.00", () => {
    const result = derive([item("a", "pA", "c1", "99.00", iso(0)), item("b", "pA", "c1", "1000.00", iso(0))]);
    expect(result.get("c1")?.price).toBe("1000.00");
  });

  it("fiyat 2 haneye kanonlanır (`185` → `185.00`); büyük fiyat Number() ile bozulmaz", () => {
    expect(derive([item("a", "pA", "c1", "185", iso(0))]).get("c1")?.price).toBe("185.00");
    expect(derive([item("a", "pA", "c1", "1234567890123456.78", iso(0))]).get("c1")?.price).toBe("1234567890123456.78");
  });
});

describe("lastPricesByCatalogItem · HK", () => {
  const base = item("a", "pA", "c1", "100.00", iso(0));

  it("YALNIZ onaylı/ödenmiş hakediş kaynak olur (taslak ve onay bekleyen DEĞİL, tutarsız damga olsa bile)", () => {
    for (const status of ["draft", "pending_approval"]) {
      const result = derive([base], [payment("h1", "pA", 1, status, iso(30), [line("a", "100.00", "1.400")])]);
      expect(result.get("c1")?.source).toBe("SZL");
    }
    for (const status of ["approved", "paid"]) {
      const result = derive([base], [payment("h1", "pA", 3, status, iso(10), [line("a", "100.00", "1.400")])]);
      expect(result.get("c1")).toEqual({ price: "140.00", at: iso(10), source: "HK", doc_no: "HK-PRJ-A-3", doc_id: "h1" });
    }
  });

  it("onaylı ama approved_at NULL hakediş DIŞLANIR", () => {
    const result = derive([base], [payment("h1", "pA", 1, "approved", null, [line("a", "100.00", "1.400")])]);
    expect(result.get("c1")?.source).toBe("SZL");
  });

  it.each([
    ["0.01", "1.500", "0.02"], // 0.015 → yarım kuruş YUKARI
    ["10.05", "1.500", "15.08"], // 15.075
    ["0.10", "1.050", "0.11"], // 0.105
    ["1.01", "1.005", "1.02"], // 1.01505
    ["0.99", "1.005", "0.99"], // 0.99495 → aşağı
    ["1234.56", "1.037", "1280.24"], // 1280.23872
  ])("B.F. x katsayı ROUND_HALF_UP 2 hane: %s x %s = %s", (price, coefficient, expected) => {
    const result = derive(
      [item("a", "pA", "c1", price, iso(0))],
      [payment("h1", "pA", 1, "approved", iso(1), [line("a", price, coefficient)])],
    );
    expect(result.get("c1")).toMatchObject({ source: "HK", price: expected });
  });

  it.each([false, true])("T29: aynı hakedişte iki satır (iki şantiye) → EN YÜKSEK düzeltilmiş B.F. (ters=%s)", (ters) => {
    const lines = [line("a", "100.00", "1.000", "s-1"), line("a", "100.00", "1.500", "s-2")];
    const result = derive([base], [payment("h1", "pA", 1, "approved", iso(10), ters ? [...lines].reverse() : lines)]);
    expect(result.get("c1")).toMatchObject({ source: "HK", price: "150.00", doc_id: "h1" });
  });

  it("T29/S6 bayat taban: taslak 100'le açıldı, sözleşme 150 oldu → HK satırı kaynak DEĞİL (SZL 150 kalır); taban eşitlenince HK kaynak", () => {
    const current = item("a", "pA", "c1", "150.00", iso(5));
    const stale = derive([current], [payment("h1", "pA", 1, "approved", iso(10), [line("a", "100.00", "1.000")])]);
    expect(stale.get("c1")).toMatchObject({ source: "SZL", price: "150.00" });
    const fresh = derive([current], [payment("h1", "pA", 1, "approved", iso(10), [line("a", "150.00", "1.000")])]);
    expect(fresh.get("c1")).toMatchObject({ source: "HK", price: "150.00" });
  });

  it("bayat satır DIŞLANIR ama aynı hakedişin taze satırı kaynak kalır", () => {
    const current = item("a", "pA", "c1", "150.00", iso(5));
    const result = derive(
      [current],
      [payment("h1", "pA", 1, "approved", iso(10), [line("a", "100.00", "2.000", "s-1"), line("a", "150.00", "1.000", "s-2")])],
    );
    expect(result.get("c1")).toMatchObject({ source: "HK", price: "150.00" });
  });

  it("taban karşılaştırması 2 hane ölçeğinde: `150` == `150.00`", () => {
    const result = derive([item("a", "pA", "c1", "150", iso(0))], [payment("h1", "pA", 1, "approved", iso(10), [line("a", "150.00", "1.000")])]);
    expect(result.get("c1")?.source).toBe("HK");
  });

  it("hakedişler arası EN YENİ approved_at kazanır (fiyat yüksek olsa da eski hakediş DEĞİL)", () => {
    const result = derive(
      [base],
      [
        payment("h1", "pA", 1, "approved", iso(10), [line("a", "100.00", "3.000")]),
        payment("h2", "pA", 2, "paid", iso(20), [line("a", "100.00", "1.100")]),
      ],
    );
    expect(result.get("c1")).toMatchObject({ doc_no: "HK-PRJ-A-2", price: "110.00" });
  });

  it.each([false, true])("eşit onay zamanında küçük hakediş id kazanır, kayıt sırasından bağımsız (ters=%s)", (ters) => {
    const rows = [
      payment("h-b", "pA", 2, "approved", iso(10), [line("a", "100.00", "1.300")]),
      payment("h-a", "pA", 1, "approved", iso(10), [line("a", "100.00", "1.100")]),
    ];
    const result = derive([base], ters ? [...rows].reverse() : rows);
    expect(result.get("c1")).toMatchObject({ doc_id: "h-a", price: "110.00" });
  });

  it("katalog bağsız kalemin hakediş satırı kaynak olmaz; olmayan sözleşme kalemine işaret eden satır yok sayılır", () => {
    const unlinked = item("a", "pA", null, "100.00", iso(0));
    const result = derive(
      [unlinked],
      [payment("h1", "pA", 1, "approved", iso(10), [line("a", "100.00", "1.200"), line("ghost", "1.00", "1.000")])],
    );
    expect(result.size).toBe(0);
  });

  it("hakedişin proje kodu HAKEDİŞİN projesinden gelir", () => {
    const result = derive([base], [payment("h1", "pB", 4, "approved", iso(10), [line("a", "100.00", "1.000")])]);
    expect(result.get("c1")?.doc_no).toBe("HK-PRJ-B-4");
  });
});

describe("lastPricesByCatalogItem · SZL ile HK birleştirme", () => {
  it.each([
    [10, "HK"],
    [-10, "SZL"],
  ])("hangisi yeniyse o (HK %s gün) → %s", (days, expected) => {
    const result = derive(
      [item("a", "pA", "c1", "100.00", iso(0))],
      [payment("h1", "pA", 1, "approved", iso(days), [line("a", "100.00", "1.400")])],
    );
    expect(result.get("c1")?.source).toBe(expected);
  });

  it("EŞİT zamanda HK önce gelir (SOURCE_ORDER: HK, SZL)", () => {
    const result = derive(
      [item("a", "pA", "c1", "100.00", iso(4))],
      [payment("h1", "pA", 1, "approved", iso(4), [line("a", "100.00", "1.400")])],
    );
    expect(result.get("c1")?.source).toBe("HK");
  });

  it("TAŞERON hakedişi kaynak DEĞİL: girdi yalnız `progressPayments` (işveren) — taşeron koleksiyonu okunmaz", () => {
    const withSubcontractor = {
      projects,
      contractItems: [item("a", "pA", "c1", "100.00", iso(0))],
      progressPayments: [],
      subcontractorProgressPayments: [
        { id: "s1", status: "approved", approved_at: iso(50), lines: [{ contract_item_id: "a", contract_unit_price: "100.00", coefficient: "9.000" }] },
      ],
    } as unknown as DeriveInput;
    expect(lastPricesByCatalogItem(withSubcontractor).get("c1")?.source).toBe("SZL");
  });
});
