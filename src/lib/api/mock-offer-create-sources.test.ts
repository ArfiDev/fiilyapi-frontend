// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- yanıt gövdesi gezinmesi (emsal: mock-offers.test.ts). */
//
// 🔴🔴 `POST /offers` KAYNAKLARI — `template_id` / `copy_from` — `e2e/mock-offer-create-sources.ts` + `mock-offer-service.ts`
// ↔ backend `offer_service.create_offer_with_origin` (:176-293) · `offer_seed.py` · `offer_schemas.py:84-137`.
// Oran önceliği gövde ?? şablon ?? ayar; kopyada gövde alanı kaynağı EZER, verilmeyen koşullar kaynaktan; `template_id`
// miras alınmaz (SO-23). Ortak donanım: `mock-offer-templates.testkit.ts`.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CAT_A, CAT_B, CAT_C, EMP_1, EMP_2, MISSING_ID, TEMPLATE_MISSING, api, ctx, openServer, closeServer } from "./mock-offer-templates.testkit";

beforeEach(openServer);
afterEach(closeServer);

const TPL = "/offers/templates";

async function newTemplate(over: Record<string, unknown> = {}): Promise<any> {
  const reply = await api("POST", TPL, { name: "Kaba İnşaat Şablonu", ...over });
  expect(reply.status, JSON.stringify(reply.json)).toBe(201);
  return reply.json;
}

async function putContent(template: any, groups: unknown[]): Promise<any> {
  const reply = await api("PUT", `${TPL}/${template.id}/content`, { groups, expected_updated_at: template.updated_at });
  expect(reply.status, JSON.stringify(reply.json)).toBe(200);
  return reply.json;
}

async function listTemplates(): Promise<any> {
  const reply = await api("GET", TPL);
  expect(reply.status).toBe(200);
  return reply.json;
}

const grp = (name: string, ...catalogIds: string[]) => ({ name, items: catalogIds.map((id) => ({ catalog_item_id: id })) });

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// POST /offers — template_id / copy_from (offer_service.create_offer_with_origin · offer_seed.py)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("POST /offers + template_id", () => {
  it("gruplar + kalemler (şablon sırasıyla); MİKTAR null; maliyet = son fiyat → referans → boş; unit_mhr katalogdan; template_id set", async () => {
    ctx.external.set(CAT_A, { price: "120.00" }); // son fiyat referansı (100) ezer
    const t = await newTemplate({ name: "Şb" });
    await putContent(t, [grp("Kaba", CAT_A, CAT_B), grp("Duvar", CAT_C), grp("Boş")]);
    const offer = (await api("POST", "/offers", { employer_id: EMP_1, title: "Şablonlu", template_id: t.id })).json;
    expect(offer.template_id).toBe(t.id);
    expect(offer.status).toBe("draft");
    const revision = (await api("GET", `/offers/${offer.id}/revisions/0`)).json;
    expect(revision.groups.map((g: any) => g.name)).toEqual(["Kaba", "Duvar", "Boş"]);
    const items = revision.groups.flatMap((g: any) => g.items);
    expect(items.map((i: any) => i.poz_no)).toEqual(["KAB-0001", "KAB-0002", "DUV-0001"]);
    for (const item of items) expect(item.quantity).toBeNull();
    const byPoz = Object.fromEntries(items.map((i: any) => [i.poz_no, i]));
    expect(byPoz["KAB-0001"].cost_unit_price).toBe("120.00"); // son fiyat
    expect(byPoz["DUV-0001"].cost_unit_price).toBe("10.00"); // referans
    expect(byPoz["KAB-0002"].cost_unit_price).toBeNull(); // ikisi de yok → boş
    expect(byPoz["KAB-0002"]).toMatchObject({ unit: "ton", description: "Demir", unit_mhr: "11.5000", catalog_item_id: CAT_B });
    expect(byPoz["KAB-0001"].cost_unit_price).not.toBe("100.00");
  });

  it("usage_count artar (şablon listesi); şablon ve içeriği DEĞİŞMEZ (updated_at dahil)", async () => {
    const t = await putContent(await newTemplate(), [grp("G", CAT_A)]);
    await api("POST", "/offers", { employer_id: EMP_1, title: "T", template_id: t.id });
    await api("POST", "/offers", { employer_id: EMP_1, title: "T2", template_id: t.id });
    const row = (await listTemplates()).items[0];
    expect(row.usage_count).toBe(2);
    expect(row.updated_at).toBe(t.updated_at);
  });

  it("şablon yok → 404 'Teklif şablonu bulunamadı'; reddedilen oluşturma teklif numarası HARCAMAZ", async () => {
    const reply = await api("POST", "/offers", { employer_id: EMP_1, title: "T", template_id: MISSING_ID });
    expect(reply.status).toBe(404);
    expect(reply.json).toEqual({ detail: TEMPLATE_MISSING });
    const next = (await api("POST", "/offers", { employer_id: EMP_1, title: "T" })).json;
    expect(next.offer_no).toBe("TKL-2026-0001");
  });

  it("ORAN ÖNCELİĞİ gövde ?? şablon ?? ayar (üç dal, her oran ayrı ayrı)", async () => {
    const full = await newTemplate({ name: "Tam", overhead_pct: "8", profit_pct: "9" });
    const half = await newTemplate({ name: "Yarım", overhead_pct: "7" }); // kâr yok → ayar (15)
    const none = await newTemplate({ name: "Boş" }); // ikisi de yok → ayar (12 / 15)
    const rev = async (over: Record<string, unknown>) => {
      const offer = (await api("POST", "/offers", { employer_id: EMP_1, title: "O", ...over })).json;
      const r = (await api("GET", `/offers/${offer.id}/revisions/0`)).json;
      return [r.overhead_pct, r.profit_pct];
    };
    expect(await rev({ template_id: full.id })).toEqual(["8.00", "9.00"]); // şablon
    expect(await rev({ template_id: full.id, overhead_pct: "5" })).toEqual(["5.00", "9.00"]); // gövde ezer (yalnız verilen)
    expect(await rev({ template_id: full.id, overhead_pct: "5", profit_pct: "6" })).toEqual(["5.00", "6.00"]);
    expect(await rev({ template_id: half.id })).toEqual(["7.00", "15.00"]); // şablonda yok → ayar
    expect(await rev({ template_id: none.id })).toEqual(["12.00", "15.00"]); // ayar
    expect(await rev({ template_id: none.id, profit_pct: "3" })).toEqual(["12.00", "3.00"]);
    expect(await rev({})).toEqual(["12.00", "15.00"]); // kaynaksız: ayar
  });

  it("template_id + copy_from → 422 value_error 'template_id ve copy_from birlikte verilemez' (loc ['body'])", async () => {
    const t = await newTemplate();
    const src = (await api("POST", "/offers", { employer_id: EMP_1, title: "Kaynak" })).json;
    const reply = await api("POST", "/offers", { employer_id: EMP_1, title: "X", template_id: t.id, copy_from: { offer_id: src.id, rev_no: 0 } });
    expect(reply.status).toBe(422);
    expect(reply.json.detail[0]).toMatchObject({ type: "value_error", loc: ["body"], msg: "Value error, template_id ve copy_from birlikte verilemez" });
  });
});

describe("POST /offers — kaynaksız: employer_id / title ZORUNLU (copy_from yokken)", () => {
  it("employer_id yok → 422 'İşveren zorunludur'; title yok → 422 'İş adı zorunludur' (value_error, loc ['body'])", async () => {
    const noEmployer = await api("POST", "/offers", { title: "T" });
    expect(noEmployer.status).toBe(422);
    expect(noEmployer.json.detail[0]).toMatchObject({ type: "value_error", loc: ["body"], msg: "Value error, employer_id: İşveren zorunludur" });
    const noTitle = await api("POST", "/offers", { employer_id: EMP_1 });
    expect(noTitle.status).toBe(422);
    expect(noTitle.json.detail[0]).toMatchObject({ type: "value_error", loc: ["body"], msg: "Value error, title: İş adı zorunludur" });
  });
});

describe("POST /offers + copy_from (SO-8)", () => {
  /** Kaynak: Rev.0 `lost` → Rev.1 taslak (içerik farklı) — kopya Rev.0'dan (bilinçli son OLMAYAN revizyon). */
  async function source(): Promise<{ offer: any; rev0: any }> {
    const offer = (
      await api("POST", "/offers", {
        employer_id: EMP_2,
        title: "Kaynak İş",
        scope_summary: "Kaynak kapsam",
        offer_date: "2026-01-15",
        validity_days: 45,
        overhead_pct: "10",
        profit_pct: "20",
        vat_pct: "10",
        payment_terms: "Kaynak ödeme",
        delivery_days: 90,
        price_escalation: "tuik",
        price_index_type: "ufe",
        notes: "Kaynak not",
        template_id: (await newTemplate({ name: "Kaynak şablonu" })).id,
      })
    ).json;
    const g1 = (await api("POST", `/offers/${offer.id}/revisions/0/groups`, { name: "B grubu", sort_order: 5 })).json;
    const g2 = (await api("POST", `/offers/${offer.id}/revisions/0/groups`, { name: "A grubu", sort_order: 2 })).json;
    const specs: Array<[any, string, Record<string, unknown>]> = [
      [g1, CAT_A, { quantity: "10.5", cost_unit_price: "80", overhead_pct: "7", profit_pct: "11" }],
      [g1, CAT_B, { quantity: null, cost_unit_price: "50" }], // miktarsız fiyatlı
      [g2, CAT_C, { quantity: "3", cost_unit_price: "9", offer_unit_price: "20", unit_mhr: "0.9" }], // elle B.F. + a-s
      [g2, CAT_A, { quantity: "2", cost_unit_price: null }], // fiyatsız
    ];
    for (const [group, cat, extra] of specs) {
      const made = await api("POST", `/offers/${offer.id}/revisions/0/items`, { catalog_item_id: cat, group_id: group.id, ...extra });
      expect(made.status, JSON.stringify(made.json)).toBe(201);
    }
    // gönderilemez (miktarsız var): miktarı doldur → gönder → kaybet → Rev.1 aç → içeriği değiştir
    const rev0 = (await api("GET", `/offers/${offer.id}/revisions/0`)).json;
    const nullQty = rev0.groups.flatMap((g: any) => g.items).find((i: any) => i.quantity === null);
    expect((await api("PATCH", `/offers/${offer.id}/revisions/0/items/${nullQty.id}`, { quantity: "4" })).status).toBe(200);
    expect((await api("POST", `/offers/${offer.id}/revisions/0/send`)).status).toBe(200);
    expect((await api("POST", `/offers/${offer.id}/revisions/0/lose`, { lost_reason: "x" })).status).toBe(200);
    expect((await api("POST", `/offers/${offer.id}/revisions`)).status).toBe(201);
    const rev1Group = (await api("POST", `/offers/${offer.id}/revisions/1/groups`, { name: "Rev1 yeni" })).json;
    await api("POST", `/offers/${offer.id}/revisions/1/items`, { catalog_item_id: CAT_B, group_id: rev1Group.id, quantity: "1", cost_unit_price: "1" });
    return { offer: (await api("GET", `/offers/${offer.id}`)).json, rev0: (await api("GET", `/offers/${offer.id}/revisions/0`)).json };
  }

  const shape = (revision: any) =>
    revision.groups.map((g: any) => ({
      name: g.name,
      sort_order: g.sort_order,
      items: g.items.map((i: any) => ({
        catalog_item_id: i.catalog_item_id,
        sort_order: i.sort_order,
        quantity: i.quantity,
        unit_mhr: i.unit_mhr,
        overhead_pct: i.overhead_pct,
        profit_pct: i.profit_pct,
        cost: i.cost_unit_price,
        manual: i.offer_unit_price,
      })),
    }));

  it("içerik KAYNAK revizyondan BİREBİR (fiyat, kalem oranı, elle B.F., a-s, miktar null dahil, sıra); yeni kimlikler; kaynak DEĞİŞMEZ", async () => {
    const { offer, rev0 } = await source();
    const created = await api("POST", "/offers", { copy_from: { offer_id: offer.id, rev_no: 0 } });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const copy = (await api("GET", `/offers/${created.json.id}/revisions/0`)).json;
    expect(shape(copy)).toEqual(shape(rev0));
    expect(copy.groups.flatMap((g: any) => g.items).map((i: any) => i.quantity)).toContain("4.000");
    const ids = new Set(rev0.groups.flatMap((g: any) => [g.id, ...g.items.map((i: any) => i.id)]));
    for (const g of copy.groups) {
      expect(ids.has(g.id)).toBe(false);
      for (const i of g.items) expect(ids.has(i.id)).toBe(false);
    }
    expect(shape((await api("GET", `/offers/${offer.id}/revisions/0`)).json)).toEqual(shape(rev0)); // kaynak aynı
    expect(created.json.latest_rev_no).toBe(0);
    expect(created.json.status).toBe("draft");
  });

  it("miktarsız (null) kalem kopyada null KALIR; fiyatsız kalem fiyatsız KALIR", async () => {
    const offer = (await api("POST", "/offers", { employer_id: EMP_1, title: "K" })).json;
    const g = (await api("POST", `/offers/${offer.id}/revisions/0/groups`, { name: "G" })).json;
    await api("POST", `/offers/${offer.id}/revisions/0/items`, { catalog_item_id: CAT_B, group_id: g.id, cost_unit_price: "50" });
    await api("POST", `/offers/${offer.id}/revisions/0/items`, { catalog_item_id: CAT_B, group_id: g.id, quantity: "2", cost_unit_price: null });
    const created = (await api("POST", "/offers", { copy_from: { offer_id: offer.id, rev_no: 0 } })).json;
    const items = (await api("GET", `/offers/${created.id}/revisions/0`)).json.groups[0].items;
    expect(items.map((i: any) => i.quantity)).toEqual([null, "2.000"]);
    expect(items.map((i: any) => i.cost_unit_price)).toEqual(["50.00", null]);
  });

  it("verilmeyen künye + KOŞULLAR kaynaktan; teklif tarihi BUGÜN (kaynağınki değil); template_id MİRAS ALINMAZ (SO-23)", async () => {
    const { offer } = await source();
    expect(offer.template_id).not.toBeNull(); // kaynak şablondan doğmuştu
    const created = (await api("POST", "/offers", { copy_from: { offer_id: offer.id, rev_no: 0 } })).json;
    expect(created).toMatchObject({ title: "Kaynak İş", employer_id: EMP_2, employer_name: "Çelik Holding A.Ş.", scope_summary: "Kaynak kapsam", template_id: null });
    expect(created.offer_no).not.toBe(offer.offer_no);
    const rev = (await api("GET", `/offers/${created.id}/revisions/0`)).json;
    expect(rev).toMatchObject({
      offer_date: "2026-10-02",
      validity_days: 45,
      overhead_pct: "10.00",
      profit_pct: "20.00",
      vat_pct: "10.00",
      payment_terms: "Kaynak ödeme",
      delivery_days: 90,
      price_escalation: "tuik",
      price_index_type: "ufe",
      notes: "Kaynak not",
      status: "draft",
    });
  });

  it("GÖVDE ALANI KAYNAĞI EZER (verilen alan); VERİLMEYEN koşullar kaynaktan; açık null = boşalt", async () => {
    const { offer } = await source();
    const created = (
      await api("POST", "/offers", {
        copy_from: { offer_id: offer.id, rev_no: 0 },
        employer_id: EMP_1,
        title: "Yeni iş",
        scope_summary: null,
        overhead_pct: "5",
        payment_terms: "Yeni ödeme",
        notes: null,
        offer_date: "2026-11-01",
        validity_days: 10,
      })
    ).json;
    expect(created).toMatchObject({ title: "Yeni iş", employer_id: EMP_1, employer_name: "Güneşkent Gayrimenkul A.Ş.", scope_summary: null });
    const rev = (await api("GET", `/offers/${created.id}/revisions/0`)).json;
    expect(rev).toMatchObject({
      overhead_pct: "5.00", // gövde
      profit_pct: "20.00", // kaynak
      vat_pct: "10.00", // kaynak
      payment_terms: "Yeni ödeme", // gövde
      notes: null, // açık null → boşalt
      delivery_days: 90, // kaynak
      price_escalation: "tuik", // kaynak
      price_index_type: "ufe", // kaynak
      offer_date: "2026-11-01",
      validity_days: 10,
    });
  });

  it("açık payment_terms: null → ödeme koşulu BOŞ (kaynaktan DEĞİL); price_escalation 'fixed' verilirse endeks türü kaynaktan GELMEZ", async () => {
    const { offer } = await source();
    const created = (await api("POST", "/offers", { copy_from: { offer_id: offer.id, rev_no: 0 }, payment_terms: null, price_escalation: "fixed" })).json;
    const rev = (await api("GET", `/offers/${created.id}/revisions/0`)).json;
    expect(rev.payment_terms).toBeNull();
    expect(rev).toMatchObject({ price_escalation: "fixed", price_index_type: null });
    const bad = await api("POST", "/offers", { copy_from: { offer_id: offer.id, rev_no: 0 }, price_escalation: "tuik", price_index_type: null });
    expect(bad.status).toBe(422);
    expect(bad.json).toEqual({ detail: "Fiyat farkı «TÜİK endeksli» iken endeks türü zorunludur" });
  });

  it("kaynak revizyon SON OLMAK ZORUNDA DEĞİL (rev 0 kopyalanır, rev 1 içeriği DEĞİL); kaynak kazanılmış/kaybedilmiş olabilir", async () => {
    const { offer, rev0 } = await source();
    expect(offer.latest_rev_no).toBe(1);
    const created = (await api("POST", "/offers", { copy_from: { offer_id: offer.id, rev_no: 0 } })).json;
    const copy = (await api("GET", `/offers/${created.id}/revisions/0`)).json;
    expect(copy.groups.map((g: any) => g.name)).toEqual(rev0.groups.map((g: any) => g.name));
    expect(copy.groups.map((g: any) => g.name)).not.toContain("Rev1 yeni");
  });

  it("404'ler: kaynak teklif 'Teklif bulunamadı'; revizyon 'Teklif revizyonu bulunamadı'; işveren 'İşveren bulunamadı'; numara HARCANMAZ", async () => {
    const src = (await api("POST", "/offers", { employer_id: EMP_1, title: "S" })).json;
    const noOffer = await api("POST", "/offers", { copy_from: { offer_id: MISSING_ID, rev_no: 0 } });
    expect(noOffer.status).toBe(404);
    expect(noOffer.json).toEqual({ detail: "Teklif bulunamadı" });
    const noRev = await api("POST", "/offers", { copy_from: { offer_id: src.id, rev_no: 3 } });
    expect(noRev.status).toBe(404);
    expect(noRev.json).toEqual({ detail: "Teklif revizyonu bulunamadı" });
    const noEmployer = await api("POST", "/offers", { copy_from: { offer_id: src.id, rev_no: 0 }, employer_id: "yok" });
    expect(noEmployer.status).toBe(404);
    expect(noEmployer.json).toEqual({ detail: "İşveren bulunamadı" });
    const next = (await api("POST", "/offers", { copy_from: { offer_id: src.id, rev_no: 0 } })).json;
    expect(next.offer_no).toBe("TKL-2026-0002"); // 0001 kaynak; reddedilenler harcamadı
  });

  it("copy_from gövdesi şema kapısı: rev_no eksik / fazla alan → 422", async () => {
    const src = (await api("POST", "/offers", { employer_id: EMP_1, title: "S" })).json;
    expect((await api("POST", "/offers", { copy_from: { offer_id: src.id } })).status).toBe(422);
    expect((await api("POST", "/offers", { copy_from: { offer_id: src.id, rev_no: 0, x: 1 } })).status).toBe(422);
  });
});
