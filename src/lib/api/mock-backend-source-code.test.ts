// @vitest-environment node
//
// KAT-F2.3 · test ikizinin (`e2e/mock-backend.ts`) sözleşme/dağılım okumalarında Bakanlık poz no'su
// (`source_code`, T47/T49) ANLIK GÖRÜNTÜ kuralları:
//   · katalogdan toplu oluşturma → katalog kaleminin source_code'unu KOPYALAR;
//   · elle tekli oluşturma → null; PATCH → ASLA değiştirmez (gövdede olsa bile);
//   · taşeron kalemi işveren kaleminden türerse (load-from-employer) onun kodunu kopyalar;
//   · dağıtım okuması aynı değeri taşır.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startMockBackend } from "../../../e2e/mock-backend";
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

const catalogByName = async (name: string) => {
  const found = (await call<{ items: S["WorkItemRead"][] }>("GET", "/catalog/items")).json.items.find(
    (item) => item.name === name,
  );
  if (found === undefined) throw new Error(`katalog kalemi yok: ${name}`);
  return found;
};
const e14 = async () => (await call<S["EmployerContractItemsResponse"]>("GET", "/projects/p-1/contract/items")).json;
const e14Items = async () => (await e14()).groups.flatMap((g) => g.items);
const firstGroupId = async () => (await e14()).groups[0].id;
const sourceCodeOf = async (code: string) => (await e14Items()).find((item) => item.code === code)?.source_code;
const entry = (group: string, code: string, extra: Record<string, unknown> = {}) => ({
  group_id: group,
  code,
  description: `Kalem ${code}`,
  unit: "m³",
  quantity: "10",
  unit_price: "100.00",
  ...extra,
});

describe("tohum: okuma yanıtları source_code'u kalemden okur", () => {
  it("işveren kalemleri: bazıları Bakanlık no taşır, kalanı null", async () => {
    expect(await sourceCodeOf("03.001")).toBe("15.150.1003");
    expect(await sourceCodeOf("03.002")).toBeNull();
    expect(await sourceCodeOf("03.003")).toBe("35.140.3195-D");
  });

  it("dağılım okuması aynı değeri taşır", async () => {
    const dist = (await call<S["ContractDistributionResponse"]>("GET", "/projects/p-1/contract/distribution")).json;
    const items = dist.groups.flatMap((g) => g.items);
    expect(items.find((item) => item.code === "03.001")?.source_code).toBe("15.150.1003");
    expect(items.find((item) => item.code === "03.002")?.source_code).toBeNull();
  });

  it("taşeron sözleşme detayı kalem source_code'unu taşır", async () => {
    const detail = (await call<S["SubcontractorContractDetail"]>("GET", "/subcontractor-contracts/sc-1")).json;
    expect(detail.items.map((item) => item.source_code)).toEqual(["15.250.1011", null, "35.140.3195-D"]);
  });
});

describe("toplu oluşturma (katalogdan) ve elle oluşturma", () => {
  it("katalog kaleminin source_code'u KOPYALANIR; kodsuz katalog kalemi ve katalogsuz satır null", async () => {
    const beton = await catalogByName("Beton döküm"); // KAB-BET → 15.150.1003
    const demir = await catalogByName("Demir"); // KAB-DEM → null
    const group = await firstGroupId();

    const result = await call<{ items: S["EmployerContractItemResponse"][] }>(
      "POST",
      "/projects/p-1/contract/items/bulk",
      {
        items: [
          entry(group, "SC.1", { catalog_item_id: beton.id }),
          entry(group, "SC.2", { catalog_item_id: demir.id }),
          entry(group, "SC.3"),
        ],
      },
    );

    expect(result.status).toBe(201);
    expect(result.json.items.map((item) => item.source_code)).toEqual(["15.150.1003", null, null]);
    expect(await sourceCodeOf("SC.1")).toBe("15.150.1003");
  });

  it("elle tekli oluşturma null (T49)", async () => {
    const group = await firstGroupId();
    const created = await call<S["EmployerContractItemResponse"]>("POST", "/projects/p-1/contract/items", entry(group, "EL.1"));
    expect(created.status).toBe(201);
    expect(created.json.source_code).toBeNull();
  });
});

describe("PATCH anlık görüntüyü DEĞİŞTİRMEZ", () => {
  it("poz no/fiyat değişse de source_code kalır", async () => {
    const patched = await call<S["EmployerContractItemResponse"]>("PATCH", "/contracts/employer/items/ci-1", {
      code: "03.001-YENI",
      unit_price: "1900.00",
    });
    expect(patched.status).toBe(200);
    expect(patched.json.code).toBe("03.001-YENI");
    expect(patched.json.source_code).toBe("15.150.1003");
    expect(await sourceCodeOf("03.001-YENI")).toBe("15.150.1003");
  });

});

// Backend `model_validator(mode="before")` → pydantic `value_error`; `loc` KAYDIN konumu (alan adı eklenmez).
const MSG_EMPLOYER_ITEM = "Value error, source_code istemciden alınmaz; katalog bağından sunucu kopyalar";
const MSG_SUBCONTRACT_ITEM = "Value error, source_code istemciden alınmaz; kaynak işveren kaleminden sunucu kopyalar";
const MSG_PAYMENT_LINE = "Value error, source_code istemciden alınmaz; sözleşme kaleminden sunucu kopyalar";
const valueError = (loc: (string | number)[], msg: string) => ({ type: "value_error", loc, msg, ctx: { error: {} } });

describe("source_code YAZMA gövdesinde → 422 value_error (null dahil), state değişmez", () => {
  type Violation = { detail: { type: string; loc: (string | number)[]; msg: string }[] };

  it.each([["99.999.9999"], [null]])("işveren PATCH source_code=%j → 422", async (value) => {
    const res = await call<Violation>("PATCH", "/contracts/employer/items/ci-2", { source_code: value });
    expect(res.status).toBe(422);
    expect(res.json.detail[0]).toMatchObject(valueError(["body"], MSG_EMPLOYER_ITEM));
    expect(await sourceCodeOf("03.002")).toBeNull();
  });

  it("işveren PATCH: geçerli alanlarla birlikte gelse de 422; kalem DEĞİŞMEZ", async () => {
    const res = await call<Violation>("PATCH", "/contracts/employer/items/ci-1", { code: "ZZ", source_code: "9" });
    expect(res.status).toBe(422);
    expect(await sourceCodeOf("03.001")).toBe("15.150.1003");
    expect((await e14Items()).some((item) => item.code === "ZZ")).toBe(false);
  });

  it("işveren tekli oluşturma → 422, kalem eklenmez", async () => {
    const group = await firstGroupId();
    const before = (await e14Items()).length;
    const res = await call<Violation>("POST", "/projects/p-1/contract/items", entry(group, "EL.2", { source_code: null }));
    expect(res.status).toBe(422);
    expect(res.json.detail[0]).toMatchObject(valueError(["body"], MSG_EMPLOYER_ITEM));
    expect((res.json.detail[0] as unknown as { input: unknown }).input).toMatchObject({ code: "EL.2", source_code: null });
    expect((await e14Items()).length).toBe(before);
  });

  it("işveren toplu oluşturma → 422 (loc satır indeksli), HİÇBİR kalem eklenmez", async () => {
    const group = await firstGroupId();
    const before = (await e14Items()).length;
    const res = await call<Violation>("POST", "/projects/p-1/contract/items/bulk", {
      items: [entry(group, "B.1"), entry(group, "B.2", { source_code: "1" })],
    });
    expect(res.status).toBe(422);
    expect(res.json.detail[0]).toMatchObject(valueError(["body", "items", 1], MSG_EMPLOYER_ITEM));
    expect((await e14Items()).length).toBe(before);
  });

  it("taşeron kalem PATCH → 422, kalem DEĞİŞMEZ", async () => {
    const res = await call<Violation>("PATCH", "/subcontractor-contracts/items/sci-1", { code: "ZZ", source_code: null });
    expect(res.status).toBe(422);
    expect(res.json.detail[0]).toMatchObject(valueError(["body"], MSG_SUBCONTRACT_ITEM));
    const detail = (await call<S["SubcontractorContractDetail"]>("GET", "/subcontractor-contracts/sc-1")).json;
    expect(detail.items[0].code).toBe("E.01");
  });

  it("taşeron kalem oluşturma (tekli) → 422", async () => {
    const res = await call<Violation>("POST", "/subcontractor-contracts/sc-2/items", {
      code: "EL.9", description: "x", unit: "m", quantity: "1", unit_price: "1", source_code: "9",
    });
    expect(res.status).toBe(422);
    expect(res.json.detail[0]).toMatchObject(valueError(["body"], MSG_SUBCONTRACT_ITEM));
  });

  it("taşeron sözleşme oluşturma gövdesindeki kalemde source_code → 422 (loc satır indeksli)", async () => {
    const res = await call<Violation>("POST", "/projects/p-1/subcontractor-contracts", {
      items: [{ code: "X.1", description: "x", unit: "m", quantity: "1", source_code: "9" }],
    });
    expect(res.status).toBe(422);
    expect(res.json.detail[0]).toMatchObject(valueError(["body", "items", 0], MSG_SUBCONTRACT_ITEM));
  });
});

describe("taşeron kalemi işveren kaleminden türer", () => {
  it("load-from-employer işveren kaleminin source_code'unu KOPYALAR; elle ekleme null", async () => {
    const loaded = await call<{ created_count: number }>("POST", "/subcontractor-contracts/sc-2/items/load-from-employer");
    expect(loaded.status).toBe(200);
    expect(loaded.json.created_count).toBeGreaterThan(0);

    const detail = (await call<S["SubcontractorContractDetail"]>("GET", "/subcontractor-contracts/sc-2")).json;
    const byCode = Object.fromEntries(detail.items.map((item) => [item.code, item.source_code]));
    expect(byCode["03.001"]).toBe("15.150.1003");
    expect(byCode["03.002"]).toBeNull();
    expect(byCode["03.003"]).toBe("35.140.3195-D");

    const manual = await call<S["SubcontractorContractItemResponse"]>("POST", "/subcontractor-contracts/sc-2/items", {
      code: "EL.9",
      description: "Elle",
      unit: "m",
      quantity: "1",
      unit_price: "1",
    });
    expect(manual.status).toBe(201);
    expect(manual.json.source_code).toBeNull();
  });

  it("taşeron kalemi PATCH'i source_code'u değiştirmez", async () => {
    const patched = await call<S["SubcontractorContractItemResponse"]>("PATCH", "/subcontractor-contracts/items/sci-1", {
      code: "E.01-X",
      unit_price: "50",
    });
    expect(patched.status).toBe(200);
    expect(patched.json.code).toBe("E.01-X");
    expect(patched.json.source_code).toBe("15.250.1011");
  });
});

// ─── KAT-F2.4 · hakediş satırı anlık görüntüsü + dönüştürme portu ───

type PaymentLines = { lines: { contract_item_id: string | null; source_code: string | null }[] };
type Violation2 = { detail: { type: string; loc: (string | number)[] }[] };
const linesOf = (detail: PaymentLines) =>
  Object.fromEntries(detail.lines.map((line) => [line.contract_item_id, line.source_code]));

describe("işveren hakediş satırı: source_code kalemden KOPYALANAN anlık görüntüdür", () => {
  it("tohum pp-6: bağlı kalemin kodunu taşır (ci-1 dolu, ci-2 null)", async () => {
    const detail = (await call<PaymentLines>("GET", "/progress-payments/pp-6")).json;
    expect(linesOf(detail)).toEqual({ "ci-1": "15.150.1003", "ci-2": null });
  });

  it("tohum pp-hk-1: ci-3 satırı 35.140.3195-D; kalemsiz özet satırı null", async () => {
    expect(linesOf((await call<PaymentLines>("GET", "/progress-payments/pp-hk-1")).json)).toEqual({ "ci-3": "35.140.3195-D" });
    const orphan = (await call<PaymentLines>("GET", "/progress-payments/pp-5")).json;
    expect(orphan.lines.every((line) => line.contract_item_id === null && line.source_code === null)).toBe(true);
  });

  it("PUT lines: yeni satır kalemden KOPYALAR, gövdeden OKUNMAZ; mevcut satır kendi değerini korur", async () => {
    const res = await call<PaymentLines>("PUT", "/progress-payments/pp-6/lines", {
      lines: [
        { contract_item_id: "ci-1", site_id: "s-1", quantity: "5" },
        { contract_item_id: "ci-4", site_id: "s-1", quantity: "7" },
      ],
    });
    expect(res.status).toBe(200);
    expect(linesOf(res.json)).toEqual({ "ci-1": "15.150.1003", "ci-4": "15.250.1011" });
  });

  it("PUT lines gövdesinde source_code → 422 value_error (null dahil), satırlar DEĞİŞMEZ", async () => {
    const res = await call<Violation2>("PUT", "/progress-payments/pp-6/lines", {
      lines: [{ contract_item_id: "ci-1", site_id: "s-1", quantity: "5", source_code: null }],
    });
    expect(res.status).toBe(422);
    expect(res.json.detail[0]).toMatchObject(valueError(["body", "lines", 0], MSG_PAYMENT_LINE));
    expect(linesOf((await call<PaymentLines>("GET", "/progress-payments/pp-6")).json)).toEqual({ "ci-1": "15.150.1003", "ci-2": null });
  });

  it("refresh-prices: satırın source_code'unu kalemden tazeler", async () => {
    const res = await call<{ refreshed_count: number }>("POST", "/progress-payments/pp-6/refresh-prices");
    expect(res.status).toBe(200);
    expect(linesOf((await call<PaymentLines>("GET", "/progress-payments/pp-6")).json)).toEqual({ "ci-1": "15.150.1003", "ci-2": null });
  });
});

describe("taşeron hakediş satırı: source_code kalemden KOPYALANAN anlık görüntüdür", () => {
  it("tohum scpp-1: sci-1 / sci-2 / sci-3", async () => {
    const detail = (await call<PaymentLines>("GET", "/subcontractor-progress-payments/scpp-1")).json;
    expect(linesOf(detail)).toEqual({ "sci-1": "15.250.1011", "sci-2": null, "sci-3": "35.140.3195-D" });
  });

  it("PUT lines: gövdeden okunmaz, kalemden kopyalanır; gövdede source_code → 422", async () => {
    const bad = await call<Violation2>("PUT", "/subcontractor-progress-payments/scpp-1/lines", {
      lines: [{ contract_item_id: "sci-1", quantity: "1", source_code: "9" }],
    });
    expect(bad.status).toBe(422);
    expect(bad.json.detail[0]).toMatchObject(valueError(["body", "lines", 0], MSG_PAYMENT_LINE));
  });
});

describe("dönüştürme portu: kalem source_code'u ana mock'a YAZILIR", () => {
  it("tohum kazanılmış teklifin kalemleri kodu taşır, teklifsiz (katalogdan eklenen) satır KATALOG kodunu alır", async () => {
    const offers = (await call<{ items: { id: string; title: string; current_revision_no?: number }[] }>("GET", "/offers")).json.items;
    const seeded = offers.find((o) => o.title === "A Blok Kaba İnşaat");
    if (seeded === undefined) throw new Error("tohum teklif yok");
    const detail = (await call<{ revisions: { rev_no: number; status: string }[] }>("GET", `/offers/${seeded.id}`)).json;
    const won = detail.revisions.find((r) => r.status === "won");
    if (won === undefined) throw new Error("kazanılmış revizyon yok");
    const revision = (await call<{ groups: { items: { id: string; catalog_item_id: string; source_code: string | null }[] }[] }>(
      "GET", `/offers/${seeded.id}/revisions/${won.rev_no}`,
    )).json;
    const offerItem = revision.groups.flatMap((g) => g.items).find((item) => item.source_code !== null);
    if (offerItem === undefined) throw new Error("kodlu teklif kalemi yok");

    const catalogEntry = (await call<{ items: S["WorkItemRead"][] }>("GET", "/catalog/items")).json.items.find(
      (item) => item.id === offerItem.catalog_item_id,
    );
    if (catalogEntry === undefined || catalogEntry.source_code === null) throw new Error("kodlu katalog kalemi yok");

    const converted = await call<{ project_id: string }>("POST", `/offers/${seeded.id}/convert`, {
      project: { name: "Dönüşüm Kod Projesi", city: "Bursa", start_date: "2026-11-01", end_date: "2027-10-31", category: "Konut" },
      contract: { contract_no: "SZL-KOD-1", signature_date: "2026-10-30", has_price_escalation: false },
      groups: [{
        name: "Kaba",
        items: [
          { catalog_item_id: offerItem.catalog_item_id, offer_item_id: offerItem.id, code: "K-1", description: "Teklifli", unit: "m³", quantity: "10", unit_price: "10.00" },
          { catalog_item_id: offerItem.catalog_item_id, code: "K-2", description: "Teklifsiz", unit: "m³", quantity: "1", unit_price: "1.00" },
        ],
      }],
      open_site: false,
    });
    expect(converted.status, JSON.stringify(converted.json)).toBe(200);
    const items = (await call<S["EmployerContractItemsResponse"]>("GET", `/projects/${converted.json.project_id}/contract/items`)).json
      .groups.flatMap((g) => g.items);
    expect(Object.fromEntries(items.map((item) => [item.code, item.source_code]))).toEqual({ "K-1": offerItem.source_code, "K-2": catalogEntry.source_code ?? null });
  });
});

// ─── KAT-F2.4 onarım · teklif kalemi katalogdan kod kopyalar; dönüştürmede katalog satırı da ───

describe("teklife katalogdan eklenen kalem Bakanlık no'sunu katalogdan KOPYALAR (O2)", () => {
  const draftOffer = async () => {
    const offer = (await call<{ id: string }>("POST", "/offers", { employer_id: "emp-1", title: "Kod kopya testi" })).json;
    const group = (await call<{ id: string }>("POST", `/offers/${offer.id}/revisions/0/groups`, { name: "Kaba" })).json;
    return { offerId: offer.id, groupId: group.id };
  };

  it("tekli ekleme: Kalıp → source_code 15.100.1001; kodsuz katalog kalemi null", async () => {
    const { offerId, groupId } = await draftOffer();
    const kalip = await catalogByName("Kalıp");
    const demir = await catalogByName("Demir");
    const a = await call<{ source_code: string | null }>("POST", `/offers/${offerId}/revisions/0/items`, {
      catalog_item_id: kalip.id, group_id: groupId, quantity: "1", cost_unit_price: "10.00",
    });
    expect(a.status).toBe(201);
    expect(a.json.source_code).toBe("15.100.1001");
    const b = await call<{ source_code: string | null }>("POST", `/offers/${offerId}/revisions/0/items`, {
      catalog_item_id: demir.id, group_id: groupId, quantity: "1", cost_unit_price: "10.00",
    });
    expect(b.json.source_code).toBe(demir.source_code ?? null);
  });

  it("PATCH gövdesinde source_code → 422 value_error, backend metniyle", async () => {
    const { offerId, groupId } = await draftOffer();
    const kalip = await catalogByName("Kalıp");
    const item = (await call<{ id: string }>("POST", `/offers/${offerId}/revisions/0/items`, {
      catalog_item_id: kalip.id, group_id: groupId, quantity: "1", cost_unit_price: "10.00",
    })).json;
    const res = await call<{ detail: { type: string; loc: unknown[]; msg: string }[] }>(
      "PATCH", `/offers/${offerId}/revisions/0/items/${item.id}`, { source_code: "9" },
    );
    expect(res.status).toBe(422);
    expect(res.json.detail[0]).toMatchObject({
      type: "value_error",
      loc: ["body"],
      msg: "Value error, source_code: katalogdan gelen alan değiştirilemez; kalemi silip katalogdan yeniden ekleyin",
    });
  });
});
