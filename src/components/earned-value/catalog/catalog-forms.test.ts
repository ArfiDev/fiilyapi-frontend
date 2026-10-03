import { describe, it, expect } from "vitest";

import { BETON, DUV, INC, KAB, KALIP_WITH_ACTUAL } from "./catalog-test-utils";
import {
  buildCatalogCreateBody,
  buildCatalogUpdateBody,
  catalogFormFromItem,
  catalogOwnHint,
  catalogRateChanged,
  rateToInput,
  unitOptions,
  CATALOG_UNIT_OPTIONS,
  validateCatalogForm,
} from "./catalog-item-form";
import {
  buildDisciplineCreateBody,
  buildDisciplineUpdateBody,
  disciplineColHint,
  disciplineFormFromRead,
  paletteEntries,
  suggestedPaletteColor,
  validateDisciplineForm,
} from "./discipline-form";
import { DISCIPLINE_PALETTE } from "./discipline-palette";

describe("rateToInput — düzenleme kutusu hassasiyet KAYBETMEZ", () => {
  it("sondaki sıfırlar atılır ama gösterim basamağının altına inilmez", () => {
    expect(rateToInput("1.8000")).toBe("1,80");
    expect(rateToInput("11.5000")).toBe("11,5");
    expect(rateToInput("0.1234")).toBe("0,1234");
    expect(rateToInput("12.0000")).toBe("12,0");
  });
});

describe("iş tipi formu", () => {
  it("doğrulama: ad + oran zorunlu, oran > 0, en fazla 4 ondalık", () => {
    const base = { ...catalogFormFromItem(BETON), name: "", rate: "" };
    expect(validateCatalogForm(base)).toEqual({ name: "İş tipi adı zorunlu", rate: "Standart oran zorunlu · 0'dan büyük olmalı" });
    expect(validateCatalogForm({ ...base, name: "x", rate: "0,00001" }).rate).toBe("En fazla 4 ondalık");
    expect(validateCatalogForm({ ...base, name: "x", rate: "1,5" })).toEqual({});
  });

  it("disiplin seçilmemişse (liste boş) hata", () => {
    const form = { ...catalogFormFromItem(BETON), disciplineId: "" };
    expect(validateCatalogForm(form).discipline).toBe("Önce disiplin ekleyin");
  });

  it("ekleme gövdesi: oran ondalık string, boş açıklama null", () => {
    const form = { ...catalogFormFromItem(BETON), name: " Seramik ", rate: "1.234,5", description: "  " };
    expect(buildCatalogCreateBody(form)).toEqual({
      discipline_id: "d-kab",
      name: "Seramik",
      uom: "m³",
      standard_unit_mhr: "1234.5",
      default_contractor_type: "own",
      description: null,
    });
  });

  it("güncelleme gövdesi yalnız değişen alanları taşır; değişiklik yoksa boş", () => {
    const initial = catalogFormFromItem(BETON);
    expect(buildCatalogUpdateBody(initial, initial)).toEqual({});
    expect(buildCatalogUpdateBody(initial, { ...initial, disciplineId: DUV.id, own: "subcon" })).toEqual({
      discipline_id: "d-duv",
      default_contractor_type: "subcon",
    });
  });

  it("birim seçenekleri: KAT örnek birimleri + katalogdakiler + mevcut değer, tekil", () => {
    expect(unitOptions(["m³", "gtr"], "paket")).toEqual([...CATALOG_UNIT_OPTIONS, "gtr", "paket"]);
  });

  it("birim seçeneklerinde kg var (ÜS-11) ve ton'un yanında durur", () => {
    expect(CATALOG_UNIT_OPTIONS).toContain("Kg");
    expect(unitOptions([], "m³")).toEqual([...CATALOG_UNIT_OPTIONS]);
  });

  it("catalogRateChanged: yalnız GEÇERLİ ve orijinalden FARKLI oranda true (KAT:120-122)", () => {
    const form = catalogFormFromItem(KALIP_WITH_ACTUAL);
    expect(catalogRateChanged(KALIP_WITH_ACTUAL, form)).toBe(false);
    expect(catalogRateChanged(KALIP_WITH_ACTUAL, { ...form, rate: "1,00" })).toBe(true);
    // Geçersiz oran (hata) uyarıyı TETİKLEMEZ.
    expect(catalogRateChanged(KALIP_WITH_ACTUAL, { ...form, rate: "0" })).toBe(false);
    expect(catalogRateChanged(KALIP_WITH_ACTUAL, { ...form, rate: "" })).toBe(false);
  });

  it("catalogOwnHint: disiplin yoksa sabit metin; seçiliyken varsayılan + değişiklik notu (KAT:184)", () => {
    expect(catalogOwnHint(null, "own")).toBe("Disiplin seçilince varsayılanı gelir");
    const selected = { code: "KAB", defaultContractorLabel: "Kendi", defaultContractorType: "own" as const };
    expect(catalogOwnHint(selected, "own")).toBe("Varsayılan KAB disiplininden: Kendi");
    expect(catalogOwnHint(selected, "subcon")).toBe("Varsayılan KAB disiplininden: Kendi · bu iş tipinde değiştirildi");
  });
});

describe("disiplin formu", () => {
  const list = [KAB, DUV, INC];

  it("palet 10 renk (KAT-F1b · ilk 5 Bütçe:523, son 5 kullanıcı onaylı genişleme); öneri disiplin sayısına göre başa döner", () => {
    expect(DISCIPLINE_PALETTE).toHaveLength(10);
    expect(suggestedPaletteColor(3)).toBe(DISCIPLINE_PALETTE[3]);
    // 6.-10. disiplinler yeni (6.-10.) renkleri önerir.
    expect(suggestedPaletteColor(5)).toBe(DISCIPLINE_PALETTE[5]);
    expect(suggestedPaletteColor(9)).toBe(DISCIPLINE_PALETTE[9]);
    // 11. disiplinde palet başa döner (belgelenmiş tekrar davranışı).
    expect(suggestedPaletteColor(10)).toBe(DISCIPLINE_PALETTE[0]);
    expect(suggestedPaletteColor(11)).toBe(DISCIPLINE_PALETTE[1]);
  });

  it("bekçi: 10 renk SIRAYLA sabit (kullanıcı kararı KAT-F1b (b), 2026-09-27: 7 belirgin ton öne, 3 açık ton sona) — sıra/değer değişirse KIRMIZI", () => {
    expect(DISCIPLINE_PALETTE).toEqual([
      "#2563eb",
      "#dc2626",
      "#64748b",
      "#7c3aed",
      "#0f766e",
      "#16a34a",
      "#d97706",
      "#93c5fd",
      "#cbd5e1",
      "#e2e8f0",
    ]);
  });

  it("bekçi: 10 renk hepsi benzersiz — biri silinirse/eşleşirse KIRMIZI", () => {
    expect(new Set(DISCIPLINE_PALETTE).size).toBe(10);
  });

  it("kod tekrarı yalnız BAŞKA kayıtla karşılaştırılır (düzenlenen hariç)", () => {
    const own = disciplineFormFromRead(KAB);
    expect(validateDisciplineForm(own, list, KAB.id)).toEqual({});
    expect(validateDisciplineForm({ ...own, code: "duv" }, list, KAB.id).code).toBe("Bu kod zaten var: Duvar & Sıva");
  });

  it("boş kod / ad / renk", () => {
    expect(validateDisciplineForm({ code: " ", name: "", color: null, own: "own" }, list, null)).toEqual({
      code: "Kod zorunlu",
      name: "Disiplin adı zorunlu",
      color: "Grafik rengi seçin",
    });
  });

  it("gövdeler: kod büyük harf; güncelleme kısmi", () => {
    const form = { code: "mek", name: " Mekanik ", color: "#64748b", own: "subcon" as const };
    expect(buildDisciplineCreateBody(form, list)).toEqual({
      code: "MEK",
      name: "Mekanik",
      color: "#64748b",
      default_contractor_type: "subcon",
      sort_order: 4,
    });
    expect(buildDisciplineUpdateBody(KAB, { ...disciplineFormFromRead(KAB), code: "kba" })).toEqual({ code: "KBA" });
  });

  it("paletteEntries: oluşturmada sıradaki renk etiketlenir, kullanılan diğerleri kodla (M6:314-320)", () => {
    // KAB #2563eb · DUV #93c5fd · INC #e2e8f0 kullanımda; existing.length=3 → sıradaki DISCIPLINE_PALETTE[3]=#7c3aed
    // (KAT-F1b (b) sırası: #2563eb, #dc2626, #64748b, #7c3aed, #0f766e, #16a34a, #d97706, #93c5fd, #cbd5e1, #e2e8f0).
    const entries = paletteEntries(DISCIPLINE_PALETTE, list, null);
    expect(entries).toEqual([
      { color: "#2563eb", label: "KAB", isNext: false },
      { color: "#dc2626", label: "", isNext: false },
      { color: "#64748b", label: "", isNext: false },
      { color: "#7c3aed", label: "sıradaki", isNext: true },
      { color: "#0f766e", label: "", isNext: false },
      { color: "#16a34a", label: "", isNext: false },
      { color: "#d97706", label: "", isNext: false },
      { color: "#93c5fd", label: "DUV", isNext: false },
      { color: "#cbd5e1", label: "", isNext: false },
      { color: "#e2e8f0", label: "INC", isNext: false },
    ]);
  });

  it("paletteEntries: düzenlemede KENDİ rengi etiketsiz kalır, 'sıradaki' hiç basılmaz", () => {
    const entries = paletteEntries(DISCIPLINE_PALETTE, list, KAB);
    expect(entries.find((e) => e.color === "#2563eb")).toEqual({ color: "#2563eb", label: "", isNext: false });
    expect(entries.find((e) => e.color === "#93c5fd")).toEqual({ color: "#93c5fd", label: "DUV", isNext: false });
    expect(entries.every((e) => !e.isNext)).toBe(true);
  });

  it("disciplineColHint: oluşturmada sıra numarası + döngü notu, düzenlemede sabit metin (M6:351)", () => {
    expect(disciplineColHint(3, false)).toBe("Sıradaki palet rengi önceden seçildi (4. disiplin) · 11. disiplinde palet başa döner");
    expect(disciplineColHint(3, true)).toBe("Panel ve raporlardaki grafiklerde bu renk kullanılır");
  });
});
