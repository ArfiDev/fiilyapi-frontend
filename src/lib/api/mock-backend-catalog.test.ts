// @vitest-environment node
//
// TKL-F1.2 · test ikizinin (`e2e/mock-backend.ts`) çekirdek İş Kalemi Kataloğu uçları
// (`/catalog/*`) ve KAT ile TEK KAYNAK poz no durumu. Backend ikizi: `catalog/service.py`
// (TKL-B2, T21–T24): poz no = disiplin KODU + "-" + 4 hane, disiplin başına MONOTON sayaç
// (max+1 DEĞİL), disiplin değişince yeni numara, disiplin KODU değişince önek yenilenir
// (sayı korunur, sayaç değişmez), `price_updated_at` yalnız `ref_price` değişince ilerler.
//
// ⚠️ Durum bu dosyada testler arası PAYLAŞILIR (tek sunucu) — testler sırayla okunur.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EV_DISCIPLINE_IDS, startMockBackend } from "../../../e2e/mock-backend";
import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";

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

interface Violation {
  detail: { type: string; loc: (string | number)[]; msg: string }[];
}

const KAB = EV_DISCIPLINE_IDS.KAB;
const DUV = EV_DISCIPLINE_IDS.DUV;
const MEK = EV_DISCIPLINE_IDS.MEK;
const ELK = EV_DISCIPLINE_IDS.ELK;

const listItems = async () => (await call<{ items: WorkItemRead[] }>("GET", "/catalog/items")).json.items;
const byName = async (name: string) => {
  const found = (await listItems()).find((item) => item.name === name);
  if (found === undefined) throw new Error(`kalem yok: ${name}`);
  return found;
};
const create = (disciplineId: string, name: string, extra: Record<string, unknown> = {}) =>
  call<WorkItemRead & { detail?: string }>("POST", "/catalog/items", {
    discipline_id: disciplineId,
    name,
    uom: "adet",
    standard_unit_mhr: "1.5",
    default_contractor_type: "own",
    ...extra,
  });

describe("GET /catalog/items · /catalog/disciplines", () => {
  it("poz no sırasıyla WorkItemRead şeklinde döner; fiyat alanları var, bir kısmı null", async () => {
    const items = await listItems();
    expect(items).toHaveLength(16);
    expect(items.map((item) => item.poz_no)).toEqual([...items.map((item) => item.poz_no)].sort());
    expect(items[0].poz_no).toBe("DUV-0001");
    for (const item of items) {
      expect(item).toHaveProperty("ref_price");
      expect(item).toHaveProperty("price_updated_at");
      expect(item.poz_no).toMatch(/^[A-Z]{3}-\d{4}$/);
      expect(item.poz_no.startsWith(`${item.discipline.code}-`)).toBe(true);
    }
    expect(items.some((item) => item.ref_price === null && item.price_updated_at === null)).toBe(true);
    expect(items.filter((item) => item.ref_price !== null).length).toBeGreaterThanOrEqual(3);
  });

  it("182 günden eski bir fiyat tarihi seed'de var (F1.3 görseli)", async () => {
    const stamp = Date.parse("2026-09-24T09:00:00Z");
    const old = (await listItems()).filter(
      (item) => item.price_updated_at !== null && stamp - Date.parse(item.price_updated_at) > 182 * 86_400_000,
    );
    expect(old.length).toBeGreaterThanOrEqual(1);
  });

  it("disiplin listesi sort_order sırasıyla, poz_counter DÖNMEZ", async () => {
    const { status, json } = await call<{ items: WorkDisciplineRead[] }>("GET", "/catalog/disciplines");
    expect(status).toBe(200);
    expect(json.items.map((d) => d.code)).toEqual(["KAB", "DUV", "MEK", "ELK"]);
    expect(Object.keys(json.items[0]).sort()).toEqual(
      ["code", "color", "default_contractor_type", "id", "name", "sort_order"].sort(),
    );
  });

  it("KAT ucu AYNI kalıcı poz no'yu döner (tek kaynak)", async () => {
    const kat = (await call<{ name: string; poz_no: string }[]>("GET", "/earned-value/catalog")).json;
    const core = await listItems();
    for (const row of kat) expect(core.find((item) => item.name === row.name)?.poz_no).toBe(row.poz_no);
    expect(kat.find((row) => row.name === "Kalıp")?.poz_no).toBe("KAB-0001");
  });
});

describe("POST /catalog/items", () => {
  it("gövdede poz_no → 422 (extra forbid) ve hiçbir şey eklenmez", async () => {
    const before = (await listItems()).length;
    const response = await call<Violation>("POST", "/catalog/items", {
      discipline_id: KAB,
      name: "Sızdıran",
      uom: "m",
      standard_unit_mhr: "1",
      default_contractor_type: "own",
      poz_no: "KAB-9999",
    });
    expect(response.status).toBe(422);
    expect(response.json.detail[0].type).toBe("extra_forbidden");
    expect(response.json.detail[0].loc).toEqual(["body", "poz_no"]);
    expect((await listItems()).length).toBe(before);
  });

  it("price_updated_at gövdede de 422", async () => {
    const response = await create(KAB, "Sızdıran 2", { price_updated_at: "2026-01-01T00:00:00Z" });
    expect(response.status).toBe(422);
  });

  it("yeni kalem disiplinin sayacından +1 numara alır (KAB-0007, sonra KAB-0008)", async () => {
    const first = await create(KAB, "Yeni A");
    expect(first.status).toBe(201);
    expect(first.json.poz_no).toBe("KAB-0007");
    expect(first.json.ref_price).toBeNull();
    expect(first.json.price_updated_at).toBeNull();
    expect((await create(KAB, "Yeni B")).json.poz_no).toBe("KAB-0008");
  });

  it("ref_price ile oluşturulursa price_updated_at = şimdi, ondalık korunur", async () => {
    const response = await create(DUV, "Fiyatlı kalem", { ref_price: "1250.50" });
    expect(response.status).toBe(201);
    expect(response.json.poz_no).toBe("DUV-0005");
    expect(response.json.ref_price).toBe("1250.50");
    expect(response.json.price_updated_at).toBe("2026-09-24T09:00:00Z");
  });

  it("KAT'tan eklenen kalem de AYNI sayaçtan numara alır ve çekirdekte görünür", async () => {
    const response = await call<{ poz_no: string }>("POST", "/earned-value/catalog", {
      discipline_id: MEK,
      name: "KAT'tan gelen",
      uom: "m",
      standard_unit_mhr: "0.4",
      default_contractor_type: "subcon",
    });
    expect(response.status).toBe(201);
    expect(response.json.poz_no).toBe("MEK-0004");
    expect((await byName("KAT'tan gelen")).poz_no).toBe("MEK-0004");
    expect((await create(MEK, "Çekirdekten gelen")).json.poz_no).toBe("MEK-0005");
  });

  it("aynı disiplinde ad+birim tekrarı 409 (gerçek backend metni, mevcut yazımla)", async () => {
    const response = await create(KAB, "kalıp", { uom: "M²" });
    expect(response.status).toBe(409);
    expect(response.json.detail).toBe(
      "Ad: bu disiplinde aynı ad ve birimle bir iş tipi zaten var — «Kalıp» (m²). " +
        "Büyük/küçük harf, İ/I ve boşluk farkı ayrı iş tipi sayılmaz",
    );
  });

  it("bilinmeyen disiplin 404; sözleşme ihlali 422 (eksik ad)", async () => {
    expect((await create("00000000-0000-0000-0000-00000000dead", "X")).status).toBe(404);
    const missing = await call<Violation>("POST", "/catalog/items", {
      discipline_id: KAB,
      uom: "m",
      standard_unit_mhr: "1",
      default_contractor_type: "own",
    });
    expect(missing.status).toBe(422);
    expect(missing.json.detail[0].loc).toEqual(["body", "name"]);
  });

  it("başarısız istekler sayacı İLERLETMEZ (409 sonrası sıradaki numara boşluksuz)", async () => {
    await create(KAB, "kalıp", { uom: "M²" }); // 409
    expect((await create(KAB, "Yeni C")).json.poz_no).toBe("KAB-0009");
  });
});

describe("PATCH /catalog/items/{id}", () => {
  it("poz_no gövdesi 422 (extra forbid)", async () => {
    const item = await byName("Yeni A");
    const response = await call<Violation>("PATCH", `/catalog/items/${item.id}`, { poz_no: "KAB-0001" });
    expect(response.status).toBe(422);
    expect((await byName("Yeni A")).poz_no).toBe("KAB-0007");
  });

  it("ref_price DEĞİŞİNCE price_updated_at = şimdi; DEĞİŞMEZSE aynen kalır", async () => {
    const old = await byName("Demir"); // seed: eski tarihli fiyat
    expect(old.price_updated_at).not.toBe("2026-09-24T09:00:00Z");
    expect(old.ref_price).not.toBeNull();

    // aynı değer (ondalık gösterimi farklı) + başka alan: tarih DOKUNULMAZ
    const same = await call<WorkItemRead>("PATCH", `/catalog/items/${old.id}`, {
      ref_price: Number(old.ref_price).toString(),
      description: "Yeni açıklama",
    });
    expect(same.status).toBe(200);
    expect(same.json.price_updated_at).toBe(old.price_updated_at);
    expect(same.json.description).toBe("Yeni açıklama");

    const changed = await call<WorkItemRead>("PATCH", `/catalog/items/${old.id}`, { ref_price: "30000" });
    expect(changed.json.ref_price).toBe("30000.00");
    expect(changed.json.price_updated_at).toBe("2026-09-24T09:00:00Z");
  });

  it("ref_price: null fiyatı temizler (backend: değişim sayılır → tarih şimdi)", async () => {
    const item = await byName("Demir");
    const cleared = await call<WorkItemRead>("PATCH", `/catalog/items/${item.id}`, { ref_price: null });
    expect(cleared.json.ref_price).toBeNull();
    expect(cleared.json.price_updated_at).toBe("2026-09-24T09:00:00Z");
  });

  it("fiyatsız kalemde ilk atama tarihi doldurur", async () => {
    const item = await byName("Yeni B");
    expect(item.price_updated_at).toBeNull();
    const set = await call<WorkItemRead>("PATCH", `/catalog/items/${item.id}`, { ref_price: "10" });
    expect(set.json.price_updated_at).toBe("2026-09-24T09:00:00Z");
  });

  it("boş {} PATCH kaydı değiştirmez", async () => {
    const item = await byName("Beton döküm");
    const response = await call<WorkItemRead>("PATCH", `/catalog/items/${item.id}`, {});
    expect(response.status).toBe(200);
    expect(response.json).toEqual(item);
  });

  it("NOT NULL alana açık null → 422; bilinmeyen kalem 404; ad+birim çakışması 409", async () => {
    const item = await byName("Yeni C");
    const nulled = await call<Violation>("PATCH", `/catalog/items/${item.id}`, { name: null });
    expect(nulled.status).toBe(422);
    expect(nulled.json.detail[0].loc).toEqual(["body", "name"]);
    expect(nulled.json.detail[0].msg).toContain("Alan boşaltılamaz");

    expect((await call("PATCH", "/catalog/items/00000000-0000-0000-0000-00000000dead", {})).status).toBe(404);

    const clash = await call<{ detail: string }>("PATCH", `/catalog/items/${item.id}`, { name: "Demir", uom: "ton" });
    expect(clash.status).toBe(409);
    expect(clash.json.detail).toContain("«Demir» (ton)");
  });

  it("kalem başka disipline geçince YENİ disiplinin sayacından yeni numara alır; eski numara boşa düşer, geri gelmez", async () => {
    const kalip = await byName("Kalıp"); // KAB-0001
    expect(kalip.poz_no).toBe("KAB-0001");
    const moved = await call<WorkItemRead>("PATCH", `/catalog/items/${kalip.id}`, { discipline_id: ELK });
    expect(moved.status).toBe(200);
    expect(moved.json.poz_no).toBe("ELK-0004");
    expect(moved.json.discipline.code).toBe("ELK");
    // KAT görünümü aynı numarayı verir
    const kat = (await call<{ name: string; poz_no: string }[]>("GET", "/earned-value/catalog")).json;
    expect(kat.find((row) => row.name === "Kalıp")?.poz_no).toBe("ELK-0004");
    // KAB sayacı geri sarılmaz ve 0001 yeniden kullanılmaz
    const next = await create(KAB, "Yeni D");
    expect(next.json.poz_no).toBe("KAB-0010");
    expect((await listItems()).some((item) => item.poz_no === "KAB-0001")).toBe(false);
  });

  it("aynı disipline 'taşıma' numarayı DEĞİŞTİRMEZ", async () => {
    const item = await byName("Yeni D");
    const same = await call<WorkItemRead>("PATCH", `/catalog/items/${item.id}`, { discipline_id: KAB });
    expect(same.json.poz_no).toBe("KAB-0010");
  });
});

describe("disiplin KODU değişimi (T22) — EV ucundan", () => {
  it("o disiplinin TÜM kalemlerinin öneki yenilenir, sayı korunur; diğer disiplinler dokunulmaz", async () => {
    const before = await listItems();
    const kab = before.filter((item) => item.discipline.id === KAB).map((item) => item.poz_no);
    const others = before.filter((item) => item.discipline.id !== KAB).map((item) => item.poz_no);
    expect(kab.length).toBeGreaterThan(5);

    const response = await call("PATCH", `/earned-value/disciplines/${KAB}`, { code: "KBA" });
    expect(response.status).toBe(200);

    const after = await listItems();
    const kabAfter = after.filter((item) => item.discipline.id === KAB);
    expect(kabAfter.map((item) => item.poz_no).sort()).toEqual(kab.map((no) => no.replace("KAB-", "KBA-")).sort());
    for (const item of kabAfter) expect(item.discipline.code).toBe("KBA");
    expect(after.filter((item) => item.discipline.id !== KAB).map((item) => item.poz_no).sort()).toEqual([...others].sort());
  });

  it("sayaç değişmez: sıradaki numara eski sayıdan devam eder (yeni önekle)", async () => {
    expect((await create(KAB, "Yeni E")).json.poz_no).toBe("KBA-0011");
  });

  it("ad/renk güncellemesi (kod aynı) numaraları DEĞİŞTİRMEZ", async () => {
    const before = (await listItems()).map((item) => item.poz_no);
    await call("PATCH", `/earned-value/disciplines/${DUV}`, { name: "Duvar ve Sıva", code: "DUV" });
    expect((await listItems()).map((item) => item.poz_no)).toEqual(before);
  });
});

// TKL-F1.3.1-8 · KAT (EV) yolu da gerçek backend'in UZUN `CATALOG_ITEM_TAKEN_AS` metnini döner
// (`earned_value/catalog_service.py` aynı sabiti kullanır); kısa eski metin gerçeği saklıyordu.
describe("KAT 409 metni gerçek backend'le aynı (VAR OLAN kaydın yazımı gösterilir)", () => {
  const taken = (name: string, uom: string) =>
    `Ad: bu disiplinde aynı ad ve birimle bir iş tipi zaten var — «${name}» (${uom}). ` +
    "Büyük/küçük harf, İ/I ve boşluk farkı ayrı iş tipi sayılmaz";

  it("POST /earned-value/catalog tekrarı → uzun metin, VAR OLAN kaydın yazımıyla", async () => {
    const existing = await create(KAB, "EV tekrar Deneme");
    expect(existing.status).toBe(201);
    const duplicate = await call<{ detail: string }>("POST", "/earned-value/catalog", {
      discipline_id: KAB,
      name: " ev TEKRAR deneme ",
      uom: "ADET",
      standard_unit_mhr: "1",
      default_contractor_type: "own",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.json.detail).toBe(taken("EV tekrar Deneme", "adet"));
  });

  it("PATCH /earned-value/catalog/{id} çakışması → aynı uzun metin", async () => {
    const other = await create(KAB, "EV çakışma deneme");
    const response = await call<{ detail: string }>("PATCH", `/earned-value/catalog/${other.json.id}`, {
      name: "ev tekrar deneme",
      uom: "adet",
    });
    expect(response.status).toBe(409);
    expect(response.json.detail).toBe(taken("EV tekrar Deneme", "adet"));
  });
});

// TKL-F1.3.1-9 · `ref_price` KAYIPSIZ ondalık dize (`Number(raw).toFixed(2)` 16+2 haneli fiyatı bozuyordu).
describe("ref_price kayıpsız ondalık dize olarak saklanır", () => {
  it("16 tam + 2 kesir hane aynen; tamsayı '.00'a, tek kesir hane '0'a tamamlanır", async () => {
    const big = await create(KAB, "Kayıpsız fiyat A", { ref_price: "1234567890123456.78" });
    expect(big.json.ref_price).toBe("1234567890123456.78");
    expect((await create(KAB, "Kayıpsız fiyat B", { ref_price: "28500" })).json.ref_price).toBe("28500.00");
    expect((await create(KAB, "Kayıpsız fiyat C", { ref_price: "28.5" })).json.ref_price).toBe("28.50");
    expect((await create(KAB, "Kayıpsız fiyat D", { ref_price: "0.05" })).json.ref_price).toBe("0.05");
  });

  it("PATCH de kayıpsız; aynı büyük değer tekrar gönderilince price_updated_at DEĞİŞMEZ", async () => {
    const item = await byName("Kayıpsız fiyat A");
    const same = await call<WorkItemRead>("PATCH", `/catalog/items/${item.id}`, { ref_price: "1234567890123456.78" });
    expect(same.json.ref_price).toBe("1234567890123456.78");
    expect(same.json.price_updated_at).toBe(item.price_updated_at);
    const near = await call<WorkItemRead>("PATCH", `/catalog/items/${item.id}`, { ref_price: "1234567890123456.79" });
    expect(near.json.ref_price).toBe("1234567890123456.79");
  });
});

describe("KAT-B1 · source_code + ref_price_date (üç durum tohumda görünür)", () => {
  it("tohum: ikisi dolu · yalnız tarih · ikisi de null; alanlar HER yanıtta var (null dahil)", async () => {
    const items = await listItems();
    const both = items.filter((i) => i.source_code && i.ref_price_date);
    const dateOnly = items.filter((i) => !i.source_code && i.ref_price_date);
    const neither = items.filter((i) => !i.source_code && !i.ref_price_date);
    expect(both.length).toBeGreaterThan(0);
    expect(dateOnly.length).toBeGreaterThan(0);
    expect(neither.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item).toHaveProperty("source_code");
      expect(item).toHaveProperty("ref_price_date");
    }
  });

  it("POST gövdesindeki source_code + ref_price_date yanıta yazılır", async () => {
    const created = await create(KAB, "Bakanlık kaynaklı kalem", {
      source_code: "15.999.9001",
      ref_price_date: "2026-01-01",
    });
    expect(created.status).toBe(201);
    expect(created.json.source_code).toBe("15.999.9001");
    expect(created.json.ref_price_date).toBe("2026-01-01");
  });
});
