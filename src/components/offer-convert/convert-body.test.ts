// @vitest-environment node
import { describe, expect, expectTypeOf, it } from "vitest";

import { BETON, D_DUV_ID, D_KAB_ID, DEMIR, DISCIPLINE_BY_CATALOG, SIVA, makeForm, makeWonRevision } from "./convert-fixtures";
import {
  addFromCatalog,
  renameGroup,
  rowsFromRevision,
  setBf,
  setCode,
  setGroupDiscipline,
  setQty,
  toggleIncluded,
} from "./convert-model";
import type { OfferConvertBody } from "@/lib/api/hooks/useOfferMutations";
import { ConvertBuildError, buildConvertRequest } from "./convert-body";
import type { ConvertDraft, ConvertForm, ConvertRequest } from "./convert-types";

const revision = makeWonRevision();
const FRESH = { ...SIVA, id: "c-fresh", poz_no: "DUV-0099" };

/** Fiyatsız kaleme B.F. girilmiş, geçerli taban taslak. */
const valid = (): ConvertDraft => setBf(rowsFromRevision(revision, DISCIPLINE_BY_CATALOG), "o:it-2", "100");
const build = (form: ConvertForm, draft: ConvertDraft = valid()): ConvertRequest => buildConvertRequest(form, draft, revision);
const flatItems = (body: ConvertRequest) => body.groups.flatMap((group) => group.items);
/** Sunucuda yoktur: `extra="forbid"` şemada tanımsız anahtar 422'dir. */
const PROJECT_KEYS = ["city", "end_date", "name", "start_date"];
const CONTRACT_KEYS_CLOSED = ["contract_no", "has_price_escalation", "signature_date"];

describe("tip bağı", () => {
  it("dönüş tipi openapi ConvertRequest", () => {
    expectTypeOf(buildConvertRequest).returns.toEqualTypeOf<ConvertRequest>();
    expectTypeOf<ConvertRequest>().toEqualTypeOf<OfferConvertBody>();
  });
});

describe("temel gövde (şantiyesiz, fiyat farkı kapalı)", () => {
  it("tam şekil", () => {
    expect(build(makeForm())).toEqual({
      project: { name: "Güneşkent Konut Kompleksi", city: "İstanbul / Kadıköy", start_date: "2026-10-02", end_date: "2027-11-25" },
      contract: { contract_no: "SZL-2026-011", signature_date: "2026-10-02", has_price_escalation: false },
      groups: [
        {
          name: "KABA İNŞAAT",
          items: [
            { catalog_item_id: BETON.id, offer_item_id: "it-1", code: BETON.poz_no, description: BETON.name, unit: BETON.uom, quantity: "10", unit_price: "128.80" },
            { catalog_item_id: DEMIR.id, offer_item_id: "it-2", code: DEMIR.poz_no, description: DEMIR.name, unit: DEMIR.uom, quantity: "2", unit_price: "100" },
          ],
        },
        {
          name: "İNCE İŞLER",
          items: [
            { catalog_item_id: SIVA.id, offer_item_id: "it-3", code: SIVA.poz_no, description: SIVA.name, unit: SIVA.uom, quantity: "100", unit_price: "50.00" },
          ],
        },
      ],
      open_site: false,
    });
  });

  it("sıra = grup sırası × kalem sırası (T15); boş grup gövdede yok", () => {
    const body = build(makeForm());
    expect(body.groups.map((g) => g.name)).toEqual(["KABA İNŞAAT", "İNCE İŞLER"]);
    expect(flatItems(body).map((i) => i.offer_item_id)).toEqual(["it-1", "it-2", "it-3"]);
  });

  it("proje ve sözleşme: yalnız şemadaki çekirdek anahtarlar; metinler kırpılır", () => {
    const body = build(makeForm({ projectName: "  Ad  ", city: " İzmir ", contractNo: " S-1 " }));
    expect(Object.keys(body.project).sort()).toEqual(PROJECT_KEYS);
    expect(Object.keys(body.contract).sort()).toEqual(CONTRACT_KEYS_CLOSED);
    expect(body.project).toMatchObject({ name: "Ad", city: "İzmir" });
    expect(body.contract.contract_no).toBe("S-1");
  });
});

describe("🔴 para ve koşullar GÖNDERİLMEZ (ÜS-F5-12/13)", () => {
  it("amount · advance_pct · retainage_pct · late_penalty_daily · vat_pct hiçbir dalda yok", () => {
    const forms = [makeForm(), makeForm({ hasPriceEscalation: true, indexType: "tufe", baseIndexValue: "1234,5" }), makeForm({ openSite: true })];
    for (const form of forms) {
      for (const key of ["amount", "advance_pct", "retainage_pct", "late_penalty_daily", "vat_pct"]) {
        expect(build(form).contract).not.toHaveProperty(key);
      }
    }
  });
  it("gövdede adam-saat / kod alanı yok: kalem anahtarları sabit", () => {
    expect(Object.keys(flatItems(build(makeForm()))[0] ?? {}).sort()).toEqual(
      ["catalog_item_id", "code", "description", "offer_item_id", "quantity", "unit", "unit_price"],
    );
    expect(build(makeForm()).project).not.toHaveProperty("code");
  });
});

describe("fiyat farkı (SO-47): has_price_escalation HER ZAMAN açık; kapalıyken endeks alanları DÜŞER", () => {
  it.each([
    ["kapalı", makeForm({ hasPriceEscalation: false, indexType: "tufe", baseIndexValue: "1234,5" }), false],
    ["kapalı + boş", makeForm({ hasPriceEscalation: false }), false],
    ["açık", makeForm({ hasPriceEscalation: true, indexType: "ufe", baseIndexValue: "1.234,567" }), true],
  ])("%s", (_name, form, on) => {
    const contract = build(form).contract;
    expect(contract.has_price_escalation).toBe(on);
    expect(typeof contract.has_price_escalation).toBe("boolean");
    if (on) {
      expect(contract.index_type).toBe("ufe");
      expect(contract.base_index_value).toBe("1234.567");
    } else {
      expect(contract).not.toHaveProperty("index_type");
      expect(contract).not.toHaveProperty("base_index_value");
    }
  });
});

describe("şantiye: site_name ve group_disciplines YALNIZ open_site iken", () => {
  const mixedDraft = (): ConvertDraft => {
    const draft = setBf(setQty(addFromCatalog(valid(), "g:g-kaba", [FRESH]), "n:0", "3"), "n:0", "60");
    return setGroupDiscipline(draft, "g:g-kaba", D_DUV_ID);
  };

  it("kapalı: site_name ve group_disciplines gönderilmez (SO-32 uyarısı hiç doğmaz)", () => {
    const body = build(makeForm({ openSite: false, siteName: "A-Blok" }), mixedDraft());
    expect(body.open_site).toBe(false);
    expect(body).not.toHaveProperty("site_name");
    expect(body).not.toHaveProperty("group_disciplines");
  });
  it("açık: site_name kırpılmış gider; boşsa hiç gitmez (sunucu proje adını kullanır)", () => {
    expect(build(makeForm({ openSite: true, siteName: " A-Blok " })).site_name).toBe("A-Blok");
    expect(build(makeForm({ openSite: true, siteName: "  " }))).not.toHaveProperty("site_name");
    expect(build(makeForm({ openSite: true })).open_site).toBe(true);
  });
  it("açık + karışık + seçilmiş grup: {ad: disiplin}", () => {
    expect(build(makeForm({ openSite: true }), mixedDraft()).group_disciplines).toEqual({ "KABA İNŞAAT": D_DUV_ID });
  });
  it("açık ama grup karışık DEĞİL → seçim gönderilmez", () => {
    const draft = setGroupDiscipline(valid(), "g:g-kaba", D_DUV_ID);
    expect(build(makeForm({ openSite: true }), draft)).not.toHaveProperty("group_disciplines");
  });
  it("açık + karışık ama SEÇİLMEMİŞ → gönderilmez (eşleme zorunlu değil)", () => {
    const draft = setBf(setQty(addFromCatalog(valid(), "g:g-kaba", [FRESH]), "n:0", "3"), "n:0", "60");
    expect(build(makeForm({ openSite: true }), draft)).not.toHaveProperty("group_disciplines");
  });
  it("karışıklık çıkarma ile bitince seçim düşer; çıkarılmış grubun seçimi 'grup gövdede yok' 422'sini doğurmaz", () => {
    const unmixed = toggleIncluded(mixedDraft(), "n:0");
    expect(build(makeForm({ openSite: true }), unmixed)).not.toHaveProperty("group_disciplines");
    const gone = ["o:it-1", "o:it-2", "n:0"].reduce(toggleIncluded, mixedDraft());
    const body = build(makeForm({ openSite: true }), setGroupDiscipline(gone, "g:g-kaba", D_KAB_ID));
    expect(body).not.toHaveProperty("group_disciplines");
    expect(body.groups.map((g) => g.name)).toEqual(["İNCE İŞLER"]);
  });
  it("anahtar kırpılmış grup adıdır", () => {
    const draft = renameGroup(mixedDraft(), "g:g-kaba", "  KABA İNŞAAT  ");
    expect(build(makeForm({ openSite: true }), draft).group_disciplines).toEqual({ "KABA İNŞAAT": D_DUV_ID });
  });
});

describe("grup ve kalem kümesi", () => {
  it("🔴 tamamen çıkarılmış grup gövdeye GİRMEZ (SO-46 'boş grup' 422'si üretilmez)", () => {
    const draft = toggleIncluded(toggleIncluded(valid(), "o:it-1"), "o:it-2");
    const body = build(makeForm(), draft);
    expect(body.groups.map((g) => g.name)).toEqual(["İNCE İŞLER"]);
    expect(body.groups.every((g) => g.items.length >= 1)).toBe(true);
  });
  it("çıkarılan kalem gövdede yok; kalan sırası bozulmaz", () => {
    expect(flatItems(build(makeForm(), toggleIncluded(valid(), "o:it-2"))).map((i) => i.offer_item_id)).toEqual(["it-1", "it-3"]);
  });
  it("🔴 offer_item_id YALNIZ tekliften gelen satırda; katalogdan eklenen satırda anahtar HİÇ yok", () => {
    const draft = setBf(setQty(addFromCatalog(valid(), "g:g-ince", [FRESH]), "n:0", "5"), "n:0", "60");
    const items = flatItems(build(makeForm(), draft));
    const added = items.find((item) => item.catalog_item_id === "c-fresh");
    expect(added).toBeDefined();
    expect(added).not.toHaveProperty("offer_item_id");
    expect(items.filter((item) => item.offer_item_id).length).toBe(3);
    expect(added).toMatchObject({ code: "DUV-0099", quantity: "5", unit_price: "60" });
  });
  it("düzenlenen miktar ve fiyat gövdeye T30 okunmuş METİN olarak gider", () => {
    const draft = setBf(setQty(valid(), "o:it-1", "1.250,5"), "o:it-1", "28.500,75");
    expect(flatItems(build(makeForm(), draft))[0]).toMatchObject({ quantity: "1250.5", unit_price: "28500.75" });
  });
  it("çakışma çözülmüş: yeniden adlandırılan grup ve düzeltilen kod gider", () => {
    const draft = setCode(renameGroup(valid(), "g:g-ince", "KABA İNŞAAT 2"), "o:it-3", "DUV-X");
    const body = build(makeForm(), draft);
    expect(body.groups[1]?.name).toBe("KABA İNŞAAT 2");
    expect(body.groups[1]?.items[0]?.code).toBe("DUV-X");
  });
});

describe("🔴 backend'in statik 422 dalları gönderim ÖNCESİ önlenir (istemci gövde KURMAZ)", () => {
  const refuses = (form: ConvertForm, draft: ConvertDraft): ConvertBuildError => {
    try {
      build(form, draft);
    } catch (error) {
      expect(error).toBeInstanceOf(ConvertBuildError);
      return error as ConvertBuildError;
    }
    throw new Error("gövde kurulmamalıydı");
  };

  it("aynı adlı grup", () => {
    expect(Object.keys(refuses(makeForm(), renameGroup(valid(), "g:g-ince", "KABA İNŞAAT")).step2.groups)).toHaveLength(2);
  });
  it("kalem kodu tekrarı", () => {
    expect(refuses(makeForm(), setCode(valid(), "o:it-3", BETON.poz_no)).step2.rows["o:it-3"]?.code).toMatch(/^Kalem kodu tekrar ediyor/);
  });
  it("offer_item_id son revizyonda yok / katalog bağı uyuşmuyor", () => {
    const base = valid();
    const ghost = { ...base, rows: base.rows.map((r) => (r.key === "o:it-3" ? { ...r, offerItemId: "silinmis" } : r)) };
    expect(refuses(makeForm(), ghost).step2.rows["o:it-3"]?.offerItem).toBe("Kalem teklifin son revizyonunda bulunamadı");
    const swapped = { ...base, rows: base.rows.map((r) => (r.key === "o:it-3" ? { ...r, catalogItemId: BETON.id } : r)) };
    expect(refuses(makeForm(), swapped).step2.rows["o:it-3"]?.offerItem).toBe("Teklif kaleminin katalog bağı gövdedekiyle uyuşmuyor");
  });
  it("hiç kalem kalmadı (boş grup listesi)", () => {
    expect(refuses(makeForm(), ["o:it-1", "o:it-2", "o:it-3"].reduce(toggleIncluded, valid())).step2.general.noItems).toBeDefined();
  });
  it("2000 kalem tavanı aşıldı", () => {
    const entries = Array.from({ length: 2000 - 3 + 1 }, (_, i) => ({ ...SIVA, id: `c${i}`, poz_no: `P-${i}`, ref_price: "1.00" }));
    const full = addFromCatalog(valid(), "g:g-ince", entries);
    const filled = { ...full, rows: full.rows.map((r) => (r.isNew ? { ...r, contract: { qtyRaw: "1", bfRaw: "1" } } : r)) };
    expect(refuses(makeForm(), filled).step2.general.tooMany).toBe("En fazla 2000 kalem dönüştürülebilir");
  });
  it("tarih sırası", () => {
    expect(refuses(makeForm({ startDate: "2026-10-02", endDate: "2026-10-01" }), valid()).step1.endDate).toBe(
      "Bitiş tarihi başlangıçtan önce olamaz.",
    );
  });
  it("fiyat farkı açık ama endeks türü / baz endeks eksik", () => {
    const step1 = refuses(makeForm({ hasPriceEscalation: true }), valid()).step1;
    expect(Object.keys(step1).sort()).toEqual(["baseIndexValue", "indexType"]);
  });
  it("Σ ≥ 10^16 (amount gönderilmediği için sunucu reddederdi)", () => {
    const huge = setBf(setQty(valid(), "o:it-1", "1.000.000.000"), "o:it-1", "1.000.000.000.000");
    expect(refuses(makeForm(), huge).step2.general.amountLimit).toBeDefined();
  });
  it("miktar 0 / B.F. boş (şema 422'si: gt=0, ≤3 ondalık, ≤2 ondalık)", () => {
    expect(refuses(makeForm(), setQty(valid(), "o:it-1", "0")).step2.rows["o:it-1"]?.qty).toBeDefined();
    expect(refuses(makeForm(), rowsFromRevision(revision)).step2.rows["o:it-2"]?.bf).toBe("Birim fiyat girin");
    expect(refuses(makeForm(), setQty(valid(), "o:it-1", "1,2345")).step2.rows["o:it-1"]?.qty).toBe("En fazla 3 ondalık");
    expect(refuses(makeForm(), setBf(valid(), "o:it-1", "1,234")).step2.rows["o:it-1"]?.bf).toBe("En fazla 2 ondalık");
  });
  it("alan uzunluğu / boş zorunlu alan (ad, il, sözleşme no)", () => {
    const step1 = refuses(makeForm({ projectName: "", city: "x".repeat(101), contractNo: " " }), valid()).step1;
    expect(Object.keys(step1).sort()).toEqual(["city", "contractNo", "projectName"]);
  });
  it("geçerli girdide hata fırlatmaz", () => {
    expect(() => build(makeForm())).not.toThrow();
  });
});
