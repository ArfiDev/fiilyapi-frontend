// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- yanıt gövdesi gezinmesi (emsal: mock-offers.test.ts). */
//
// 🔴 TKL-F5.1 · GERÇEK `mock-backend` — dönüştürmenin ANA SAHTE DURUMA yazımı (proje · sözleşme · kalemler · şantiye +
// tam dağıtım) ve "Sözleşmeden doldur" ucu. Kurallar (hata sırası, Σ, uyarılar) `mock-offer-convert.test.ts`tedir.
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startMockBackend } from "../../../e2e/mock-backend";
import type { components } from "@/lib/api/schema";

type S = components["schemas"];

let backend: ReturnType<typeof startMockBackend>;
let url = "";

beforeEach(async () => {
  backend = startMockBackend(0);
  await new Promise<void>((resolve) => backend.server.once("listening", () => resolve()));
  url = `http://127.0.0.1:${(backend.server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await backend.close();
});

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, json: text === "" ? {} : JSON.parse(text) };
}

const catalogItems = async (): Promise<Array<Record<string, any>>> => (await call("GET", "/catalog/items")).json.items;

/** Kazanılmış teklif: tek grup, verilen katalog kalemleri (miktar 10). */
async function wonOffer(catalogNames: string[], over: Record<string, unknown> = {}): Promise<{ id: string; offerNo: string; items: any[] }> {
  const catalog = await catalogItems();
  const created = (await call("POST", "/offers", { employer_id: "emp-1", title: "Konut Kaba İnşaat", ...over })).json;
  const group = (await call("POST", `/offers/${created.id}/revisions/0/groups`, { name: "Kaba" })).json;
  for (const name of catalogNames) {
    const entry = catalog.find((item) => item.name === name) as Record<string, any>;
    const reply = await call("POST", `/offers/${created.id}/revisions/0/items`, { catalog_item_id: entry.id, group_id: group.id, quantity: "10", cost_unit_price: "100.00" });
    expect(reply.status, JSON.stringify(reply.json)).toBe(201);
  }
  await call("POST", `/offers/${created.id}/revisions/0/send`);
  await call("POST", `/offers/${created.id}/revisions/0/win`);
  const revision = (await call("GET", `/offers/${created.id}/revisions/0`)).json;
  return { id: created.id, offerNo: created.offer_no, items: revision.groups.flatMap((g: any) => g.items) };
}

async function bodyFor(offer: { items: any[] }, over: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return {
    project: { name: "Konut Kaba İnşaat Projesi", city: "Bursa", start_date: "2026-11-01", end_date: "2027-10-31", category: "Konut" },
    contract: { contract_no: "SZL-2026-77", signature_date: "2026-10-30", has_price_escalation: false },
    groups: [
      {
        name: "Temel",
        items: [{ catalog_item_id: offer.items[0].catalog_item_id, offer_item_id: offer.items[0].id, code: "T-1", description: "Temel kalem", unit: "m³", quantity: "12.5", unit_price: "2300.00" }],
      },
      {
        name: "Kaba",
        items: [
          { catalog_item_id: offer.items[1].catalog_item_id, offer_item_id: offer.items[1].id, code: "K-1", description: "Kaba kalem", unit: "m²", quantity: "100", unit_price: "10.00" },
          { catalog_item_id: offer.items[0].catalog_item_id, code: "K-2", description: "Yeni satır", unit: "m³", quantity: "0.005", unit_price: "1.00" },
        ],
      },
    ],
    open_site: false,
    ...over,
  };
}

const NAMES = ["Beton döküm", "Kalıp"];

describe("🔴 dönüştürme ana sahte duruma YAZAR (proje · sözleşme · kalemler)", () => {
  it("proje: PRJ-{yıl}-{NNN} max+1, taahhüt, slug, il/tarih/kategori, işveren, sözleşme özeti; GET /projects ve /projects/{id} okur", async () => {
    const offer = await wonOffer(NAMES);
    const reply = await call("POST", `/offers/${offer.id}/convert`, await bodyFor(offer));
    expect(reply.status, JSON.stringify(reply.json)).toBe(200);
    const year = new Date().getFullYear();
    expect(reply.json).toMatchObject({ project_code: `PRJ-${year}-001`, project_slug: "konut-kaba-insaat-projesi", site_id: null, contract_item_count: 3, warnings: [] });

    const listed = (await call("GET", "/projects")).json.items.find((p: any) => p.id === reply.json.project_id);
    expect(listed).toMatchObject({
      project_type: "taahhut",
      status: "active",
      code: `PRJ-${year}-001`,
      name: "Konut Kaba İnşaat Projesi",
      city: "Bursa",
      category: "Konut",
      employer_name: "Güneşkent Gayrimenkul A.Ş.",
      contract_no: "SZL-2026-77",
      start_date: "2026-11-01",
      end_date: "2027-10-31",
    });
    expect((await call("GET", `/projects/${reply.json.project_slug}`)).json.id).toBe(reply.json.project_id); // slug çözümü
  });

  it("proje kodu max+1 (ikinci dönüştürme -002) ve slug çakışmasında -2", async () => {
    const first = await wonOffer(NAMES);
    const second = await wonOffer(NAMES);
    const a = await call("POST", `/offers/${first.id}/convert`, await bodyFor(first));
    const b = await call("POST", `/offers/${second.id}/convert`, await bodyFor(second));
    const year = new Date().getFullYear();
    expect([a.json.project_code, b.json.project_code]).toEqual([`PRJ-${year}-001`, `PRJ-${year}-002`]);
    expect(b.json.project_slug).toBe("konut-kaba-insaat-projesi-2");
  });

  it("sözleşme: bedel = Σ SATIR BAŞINA yuvarlama (12,5×2300 + 100×10 + 0,005×1,00 = 28750,00 + 1000,00 + 0,01), KDV revizyondan, avans %20, teminat %5", async () => {
    const offer = await wonOffer(NAMES, { vat_pct: "18" });
    const reply = await call("POST", `/offers/${offer.id}/convert`, await bodyFor(offer));
    const contract = (await call("GET", `/projects/${reply.json.project_id}/contract`)).json as S["EmployerContractDetail"];
    expect(contract).toMatchObject({
      project_id: reply.json.project_id,
      contract_no: "SZL-2026-77",
      signature_date: "2026-10-30",
      amount: "29750.01",
      items_total: "29750.01",
      items_total_diff: "0.00",
      vat_pct: "18.00",
      advance_pct: "20.00",
      retainage_pct: "5.00",
      has_price_escalation: false,
      index_type: null,
      start_date: "2026-11-01",
      end_date: "2027-10-31",
    });
    expect((await call("GET", `/projects/${reply.json.project_id}`)).json.contract_amount).toBe("29750.01");
  });

  it("sözleşme kalemleri: grup adı/sırası = gövde, kalem sırası = gövde, katalog bağı; şantiyesiz → dağıtım 0", async () => {
    const offer = await wonOffer(NAMES);
    const reply = await call("POST", `/offers/${offer.id}/convert`, await bodyFor(offer));
    const items = (await call("GET", `/projects/${reply.json.project_id}/contract/items`)).json as S["EmployerContractItemsResponse"];
    expect(items.groups.map((g) => g.name)).toEqual(["Temel", "Kaba"]);
    expect(items.groups.map((g) => g.items.map((i) => i.code))).toEqual([["T-1"], ["K-1", "K-2"]]);
    expect(items.groups[1]?.items[0]).toMatchObject({ quantity: "100.000", unit_price: "10.00", distributed_quantity: "0.000", remaining_quantity: "100.000" });
    expect(items.groups[0]?.items[0]?.catalog_item_id).toBe(offer.items[0].catalog_item_id);
  });

  it("fikstür projeleri bozulmaz: p-1 sözleşmesi ve kalemleri değişmeden", async () => {
    const before = (await call("GET", "/projects/p-1/contract/items")).json;
    const offer = await wonOffer(NAMES);
    await call("POST", `/offers/${offer.id}/convert`, await bodyFor(offer));
    expect((await call("GET", "/projects/p-1/contract/items")).json).toEqual(before);
    expect((await call("GET", "/projects/p-1/contract")).json.contract_no).toBe("SZL-2025-01");
  });

  it("dönüştürülmemiş proje sözleşmesi yine 404; PRJ listesi / zaman çizelgesi yeni projeyi de taşır", async () => {
    const offer = await wonOffer(NAMES);
    const reply = await call("POST", `/offers/${offer.id}/convert`, await bodyFor(offer));
    expect((await call("GET", "/projects/p-2/contract")).status).toBe(404);
    const timeline = (await call("GET", "/projects/timeline")).json;
    expect(timeline.items.some((p: any) => p.id === reply.json.project_id && p.code.startsWith("PRJ-"))).toBe(true);
  });

  it("ikinci deneme 409 'Teklif zaten dönüştürüldü' ve proje sayısı ARTMAZ", async () => {
    const offer = await wonOffer(NAMES);
    await call("POST", `/offers/${offer.id}/convert`, await bodyFor(offer));
    const before = (await call("GET", "/projects")).json.counts.all;
    const again = await call("POST", `/offers/${offer.id}/convert`, await bodyFor(offer));
    expect(again).toMatchObject({ status: 409, json: { detail: "Teklif zaten dönüştürüldü" } });
    expect((await call("GET", "/projects")).json.counts.all).toBe(before);
  });

  it("hata → HİÇBİR yazma: statik 422 sonrası proje sayısı ve teklif durumu değişmez, teklif tekrar dönüştürülebilir", async () => {
    const offer = await wonOffer(NAMES);
    const before = (await call("GET", "/projects")).json.counts.all;
    const bad = await bodyFor(offer, { groups: [{ name: "G", items: [{ catalog_item_id: offer.items[0].catalog_item_id, code: "X", description: "d", unit: "m", quantity: "1", unit_price: "1" }, { catalog_item_id: offer.items[1].catalog_item_id, code: "X", description: "d", unit: "m", quantity: "1", unit_price: "1" }] }] });
    expect((await call("POST", `/offers/${offer.id}/convert`, bad)).status).toBe(422);
    expect((await call("GET", "/projects")).json.counts.all).toBe(before);
    expect((await call("GET", `/offers/${offer.id}`)).json.conversion_state).toBe("won_not_converted");
    expect((await call("POST", `/offers/${offer.id}/convert`, await bodyFor(offer))).status).toBe(200);
  });
});

describe("🔴 open_site: şantiye + TAM dağıtım (S-D2)", () => {
  it("şantiye açılır (ad = site_name ya da proje adı), kalemler tam miktarla dağıtılır; /projects/{id}/sites ve /sites/{id} okur", async () => {
    const offer = await wonOffer(NAMES);
    const reply = await call("POST", `/offers/${offer.id}/convert`, await bodyFor(offer, { open_site: true, site_name: "A-Blok Şantiyesi" }));
    expect(reply.status, JSON.stringify(reply.json)).toBe(200);
    expect(reply.json.site_id).toBeTruthy();

    const sites = (await call("GET", `/projects/${reply.json.project_id}/sites`)).json.items;
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({ id: reply.json.site_id, name: "A-Blok Şantiyesi", status: "active", city: "Bursa" });
    expect((await call("GET", `/sites/${reply.json.site_id}`)).json).toMatchObject({ id: reply.json.site_id, name: "A-Blok Şantiyesi" });

    const items = (await call("GET", `/projects/${reply.json.project_id}/contract/items`)).json as S["EmployerContractItemsResponse"];
    for (const item of items.groups.flatMap((g) => g.items)) {
      expect(item.distributed_quantity).toBe(item.quantity);
      expect(item.remaining_quantity).toBe("0.000");
    }
  });

  it("site_name yoksa şantiye adı = proje adı", async () => {
    const offer = await wonOffer(NAMES);
    const reply = await call("POST", `/offers/${offer.id}/convert`, await bodyFor(offer, { open_site: true }));
    const sites = (await call("GET", `/projects/${reply.json.project_id}/sites`)).json.items;
    expect(sites[0].name).toBe("Konut Kaba İnşaat Projesi");
  });

  it("karışık disiplinli grup (iki farklı disiplinden katalog kalemi) uyarısı gerçek katalog disiplinlerinden türer; elle eşleme uyarıyı kaldırır; olmayan disiplin 404", async () => {
    const catalog = await catalogItems();
    const disciplineCount = new Set(catalog.map((item) => item.discipline.id)).size;
    expect(disciplineCount).toBeGreaterThan(1); // katalog ≥ 2 disiplin taşır (aksi hâlde bu vaka ölçüm yapmaz)
    const different = catalog.find((item) => item.discipline.id !== catalog[0]?.discipline.id) as Record<string, any>;
    const first = catalog[0] as Record<string, any>;
    const created = (await call("POST", "/offers", { employer_id: "emp-1", title: "Karışık" })).json;
    const group = (await call("POST", `/offers/${created.id}/revisions/0/groups`, { name: "G" })).json;
    for (const entry of [first, different]) await call("POST", `/offers/${created.id}/revisions/0/items`, { catalog_item_id: entry.id, group_id: group.id, quantity: "1", cost_unit_price: "1.00" });
    await call("POST", `/offers/${created.id}/revisions/0/send`);
    await call("POST", `/offers/${created.id}/revisions/0/win`);
    const mixed = {
      project: { name: "K", city: "C", start_date: "2026-11-01", end_date: "2026-11-02" },
      contract: { contract_no: "S", signature_date: "2026-10-30", has_price_escalation: false },
      groups: [{ name: "Karışık", items: [{ catalog_item_id: first.id, code: "1", description: "a", unit: "m", quantity: "1", unit_price: "1" }, { catalog_item_id: different.id, code: "2", description: "b", unit: "m", quantity: "1", unit_price: "1" }] }],
      open_site: true,
    };
    const disciplines = (await call("GET", "/catalog/disciplines")).json.items;
    expect((await call("POST", `/offers/${created.id}/convert`, { ...mixed, group_disciplines: { Karışık: "d1000000-0000-4000-8000-0000000000ff" } })).json.detail).toBe("Disiplin bulunamadı");
    const mapped = await call("POST", `/offers/${created.id}/convert`, { ...mixed, group_disciplines: { Karışık: disciplines[0].id } });
    expect(mapped.status, JSON.stringify(mapped.json)).toBe(200);
    expect(mapped.json.warnings).toEqual([]);

    const again = (await call("POST", "/offers", { employer_id: "emp-1", title: "Karışık 2" })).json;
    const g2 = (await call("POST", `/offers/${again.id}/revisions/0/groups`, { name: "G" })).json;
    for (const entry of [first, different]) await call("POST", `/offers/${again.id}/revisions/0/items`, { catalog_item_id: entry.id, group_id: g2.id, quantity: "1", cost_unit_price: "1.00" });
    await call("POST", `/offers/${again.id}/revisions/0/send`);
    await call("POST", `/offers/${again.id}/revisions/0/win`);
    const unmapped = await call("POST", `/offers/${again.id}/convert`, mixed);
    expect(unmapped.json.warnings.map((w: any) => [w.code, w.group_name])).toEqual([["mixed_discipline_group", "Karışık"]]);
  });
});

describe("🔴 okuma türevleri gerçek mock'ta", () => {
  it("won_not_converted_count: tohum 1 kazanılmış → yeni kazanılan +1 → dönüştürünce -1; liste satırı converted + project_id", async () => {
    const baseline = (await call("GET", "/offers")).json.summary.won_not_converted_count;
    expect(baseline).toBe(1);
    const offer = await wonOffer(NAMES);
    expect((await call("GET", "/offers")).json.summary.won_not_converted_count).toBe(2);
    const reply = await call("POST", `/offers/${offer.id}/convert`, await bodyFor(offer));
    const list = (await call("GET", "/offers")).json;
    expect(list.summary.won_not_converted_count).toBe(1);
    expect(list.items.find((item: any) => item.id === offer.id)).toMatchObject({ conversion_state: "converted", project_id: reply.json.project_id });
  });
});

describe("🔴 POST /sites/{id}/earned-value/budget/fill-from-contract (ayrı sahte uç)", () => {
  const FILL = (site: string) => `/sites/${site}/earned-value/budget/fill-from-contract`;

  it("taslaklı şantiyede boş yaprakları doldurur (FillFromContractOut); ikinci çağrı doldurulacak şey bulamaz", async () => {
    const first = await call("POST", FILL("s-1"));
    expect(first.status, JSON.stringify(first.json)).toBe(200);
    expect(first.json).toMatchObject({ linked_item_count: 0, mapped_group_count: 0, warnings: [] });
    expect(first.json.filled_leaf_count).toBeGreaterThan(0);
    const second = await call("POST", FILL("s-1"));
    expect(second.json).toMatchObject({ filled_item_count: 0, filled_leaf_count: 0 });
  });

  it("tamamlanmış şantiye → 409 (bütçe salt okunur)", async () => {
    expect(await call("POST", FILL("s-2"))).toMatchObject({ status: 409, json: { detail: "Tamamlanmış şantiyenin bütçesi salt okunurdur" } });
  });

  it("🔴 aktif revizyon var + taslak YOK → 409 'Açık taslak revizyon yok' (SO-57)", async () => {
    const revisions = (await call("GET", "/sites/s-1/earned-value/budget/revisions")).json as Array<{ id: string; status: string }>;
    const draft = revisions.find((revision) => revision.status === "draft") as { id: string };
    expect((await call("DELETE", `/sites/s-1/earned-value/budget/revisions/${draft.id}`)).status).toBe(204);
    expect(await call("POST", FILL("s-1"))).toMatchObject({ status: 409, json: { detail: "Açık taslak revizyon yok" } });
  });

  it("olmayan şantiye → 404", async () => {
    expect((await call("POST", FILL("s-99"))).status).toBe(404);
  });

  it("GET → 405", async () => {
    expect((await call("GET", FILL("s-1"))).status).toBe(405);
  });
});
