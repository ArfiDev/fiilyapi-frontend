import { describe, expect, it } from "vitest";

import { makeOffer } from "@/components/offers/offer-fixtures";

import { checkCreateForm, initialCreateForm, previewText, switchSource, type CreateContext } from "./template-create-form";
import { makeTemplateListItem } from "./template-fixtures";

const ctx: CreateContext = {
  offers: [makeOffer({ offer_no: "TKL-2026-0014", rev_no: 2 }), makeOffer({ offer_no: "TKL-2026-0013" })],
  templates: [
    makeTemplateListItem({ id: "t-1", name: "Kaba", group_count: 3, item_count: 10, overhead_pct: "12.00", profit_pct: "15.50" }),
    makeTemplateListItem({ id: "t-2", name: "Cephe", group_count: 1, item_count: 4, overhead_pct: null, profit_pct: "14.00" }),
  ],
  disciplines: [
    { id: "d-1", name: "Betonarme" },
    { id: "d-2", name: "Kalıp" },
  ],
};
const defaults = { overhead: "12", profit: "18,5" };
const named = (state: ReturnType<typeof initialCreateForm>) => ({ ...state, name: "  Yeni şablon " });

describe("initialCreateForm", () => {
  it("oranlar dokunulmamışken ayar varsayılanıdır; başlangıç grupları seçimsiz (ÜS-F4-8)", () => {
    const state = initialCreateForm("blank");
    expect(state.groupIds).toEqual([]);
    const check = checkCreateForm(named(state), ctx, defaults);
    expect(check).toMatchObject({ ok: true, input: { overhead: "12", profit: "18.5", makeDefault: false } });
  });
});

describe("doğrulama", () => {
  it("ad boş → 'Şablon adı zorunlu' + 1 alan eksik", () => {
    expect(checkCreateForm(initialCreateForm("blank"), ctx, defaults)).toEqual({
      ok: false,
      errors: { name: "Şablon adı zorunlu" },
      count: 1,
    });
  });

  it("oran hataları da sayılır (T30 belirsiz nokta)", () => {
    const state = { ...named(initialCreateForm("blank")), overhead: "12.5", profit: "1000" };
    const check = checkCreateForm(state, ctx, defaults);
    expect(check).toMatchObject({ ok: false, count: 2 });
    if (!check.ok) {
      expect(check.errors.overhead).toBe("Ondalık için virgül kullanın (ör. 28,50)");
      expect(check.errors.profit).toBe("0–999,99 arasında olmalı");
    }
  });

  it("ad kırpılır", () => {
    const check = checkCreateForm(named(initialCreateForm("blank")), ctx, defaults);
    expect(check.ok && check.input.name).toBe("Yeni şablon");
  });
});

describe("kaynaklar", () => {
  it("Boş: seçili disiplin adları SEÇİM SIRASIYLA grup olur (ilk tıklanan A)", () => {
    const state = { ...named(initialCreateForm("blank")), groupIds: ["d-2", "d-1"] };
    const check = checkCreateForm(state, ctx, defaults);
    expect(check.ok && check.input.source).toEqual({ kind: "blank", groupNames: ["Kalıp", "Betonarme"] });
  });

  it("Tekliften: seçim yoksa ilk teklif, kaynak = SON revizyon (rev_no); toast mockup metni", () => {
    const check = checkCreateForm(named(initialCreateForm("offer")), ctx, defaults);
    expect(check.ok && check.input.source).toEqual({ kind: "offer", offerId: "id-TKL-2026-0014", revNo: 2, offerNo: "TKL-2026-0014" });
    expect(check.ok && check.toast).toBe("TKL-2026-0014 kalemlerinden şablon oluşturuldu · miktarlar alınmadı");
  });

  it("Tekliften: teklif yoksa 'Kaynak seçin' ve oluşturulamaz", () => {
    const check = checkCreateForm(named(initialCreateForm("offer")), { ...ctx, offers: [] }, defaults);
    expect(check).toMatchObject({ ok: false, errors: { source: "Kaynak seçin" } });
  });

  it("Kopya: ilk şablon seçilir ve oranları forma gelir; oran boşsa boş kalır", () => {
    const state = switchSource(named(initialCreateForm("blank")), "template", ctx);
    expect(state.templateId).toBe("t-1");
    const check = checkCreateForm(state, ctx, defaults);
    expect(check.ok && check.input).toMatchObject({ overhead: "12", profit: "15.5", source: { kind: "template", templateId: "t-1" } });
    const second = switchSource({ ...state, source: "template" }, "template", ctx, "t-2");
    const check2 = checkCreateForm(second, ctx, defaults);
    expect(check2.ok && check2.input.overhead).toBeNull();
    expect(check2.ok && check2.toast).toBe("Yeni şablon şablonu oluşturuldu");
  });
});

describe("previewText (TS:285)", () => {
  it("Boş: grup sayısı · 0 kalem · oranlar", () => {
    const state = { ...initialCreateForm("blank"), groupIds: ["d-1", "d-2"] };
    expect(previewText(state, ctx, defaults)).toBe("2 grup · 0 kalem · GG %12 · Kâr %18,5");
  });

  it("Kopya: kaynak şablonun grup/kalem sayısı", () => {
    const state = switchSource(initialCreateForm("blank"), "template", ctx);
    expect(previewText(state, ctx, defaults)).toBe("3 grup · 10 kalem · GG %12 · Kâr %15,5");
  });

  it("Tekliften: sayılar listede yok → yalnız oranlar", () => {
    expect(previewText(initialCreateForm("offer"), ctx, defaults)).toBe("GG %12 · Kâr %18,5");
  });
});
