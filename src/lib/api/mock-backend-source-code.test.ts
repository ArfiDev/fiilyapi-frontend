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

describe("source_code YAZMA gövdesinde → 422 extra_forbidden (null dahil), state değişmez", () => {
  type Violation = { detail: { type: string; loc: (string | number)[]; msg: string }[] };
  const forbidden = (loc: (string | number)[]) => [
    { type: "extra_forbidden", loc, msg: "Extra inputs are not permitted", input: null },
  ];

  it.each([["99.999.9999"], [null]])("işveren PATCH source_code=%j → 422", async (value) => {
    const res = await call<Violation>("PATCH", "/contracts/employer/items/ci-2", { source_code: value });
    expect(res.status).toBe(422);
    expect(res.json.detail[0]).toMatchObject({ type: "extra_forbidden", loc: ["body", "source_code"] });
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
    expect(res.json.detail).toMatchObject(forbidden(["body", "source_code"]));
    expect((await e14Items()).length).toBe(before);
  });

  it("işveren toplu oluşturma → 422 (loc satır indeksli), HİÇBİR kalem eklenmez", async () => {
    const group = await firstGroupId();
    const before = (await e14Items()).length;
    const res = await call<Violation>("POST", "/projects/p-1/contract/items/bulk", {
      items: [entry(group, "B.1"), entry(group, "B.2", { source_code: "1" })],
    });
    expect(res.status).toBe(422);
    expect(res.json.detail[0]).toMatchObject({ type: "extra_forbidden", loc: ["body", "items", 1, "source_code"] });
    expect((await e14Items()).length).toBe(before);
  });

  it("taşeron kalem PATCH → 422, kalem DEĞİŞMEZ", async () => {
    const res = await call<Violation>("PATCH", "/subcontractor-contracts/items/sci-1", { code: "ZZ", source_code: null });
    expect(res.status).toBe(422);
    expect(res.json.detail[0]).toMatchObject({ type: "extra_forbidden", loc: ["body", "source_code"] });
    const detail = (await call<S["SubcontractorContractDetail"]>("GET", "/subcontractor-contracts/sc-1")).json;
    expect(detail.items[0].code).toBe("E.01");
  });

  it("taşeron kalem oluşturma (tekli) → 422", async () => {
    const res = await call<Violation>("POST", "/subcontractor-contracts/sc-2/items", {
      code: "EL.9", description: "x", unit: "m", quantity: "1", unit_price: "1", source_code: "9",
    });
    expect(res.status).toBe(422);
    expect(res.json.detail[0]).toMatchObject({ type: "extra_forbidden", loc: ["body", "source_code"] });
  });

  it("taşeron sözleşme oluşturma gövdesindeki kalemde source_code → 422 (loc satır indeksli)", async () => {
    const res = await call<Violation>("POST", "/projects/p-1/subcontractor-contracts", {
      items: [{ code: "X.1", description: "x", unit: "m", quantity: "1", source_code: "9" }],
    });
    expect(res.status).toBe(422);
    expect(res.json.detail[0]).toMatchObject({ type: "extra_forbidden", loc: ["body", "items", 0, "source_code"] });
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
