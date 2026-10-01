import { describe, expect, it } from "vitest";

import { siteQuotaOf } from "./boq-quota";
import type { BoqItem } from "@/lib/api/hooks/useBoq";

/**
 * GERCEK `BoqItemResponse` sekli kurulur — daraltilmis bir literal degil.
 * Gerekce: `quantity` alanini fiksture KOYMAK bu testin butun anlamidir
 * (fonksiyonun onu OKUMADIGI kanitlanir), dar bir parametre tipi o alani
 * fiksturden dislardi.
 */
function row(fields: Pick<BoqItem, "quantity" | "allocated_quantity" | "unallocated_quantity">): BoqItem {
  return {
    id: "i-1",
    code: "03.001",
    description: "Kat Dosemesi Betonu C25/30",
    unit: "m3",
    unit_price: "1850",
    progress_pct: { available: false, value: null, pending_module: "contracts" },
    sort_order: 0,
    amount: "0",
    contract_item_id: null,
    ...fields,
  };
}

/**
 * BOQ-SEC-F K2 — İKİ ANLAM TUZAĞI'nın bekçisi.
 *
 * Fikstürlerde ÜÇ alanın ÜÇÜ de FARKLIDIR (ayrışma noktası kuralı): eğer
 * `siteQuotaOf` yanlış alandan okursa test kırmızı olur. `quantity`yi döndüren
 * bir uygulama da, `quantity - allocated` hesabı yapan bir uygulama da bu
 * fikstürlerde YANLIŞ sayı üretir.
 */
describe("siteQuotaOf", () => {
  it("santiye kotasini allocated + unallocated toplamindan okur", () => {
    // Süzülmüş yanıt: quantity = bu bölüme tahsis (480), gerçek kota 700.
    expect(
      siteQuotaOf(row({ quantity: "480.000", allocated_quantity: "600.000", unallocated_quantity: "100.000" })),
    ).toBe("700.000");
  });

  it("quantity alanini KULLANMAZ - suzulmus yanitta o bolum payidir", () => {
    // `quantity` burada üç alanın en büyüğü; onu döndüren mutasyon yakalanır.
    expect(
      siteQuotaOf(row({ quantity: "9999", allocated_quantity: "12.500", unallocated_quantity: "7.250" })),
    ).toBe("19.750");
  });

  it("quantity - allocated hesabini YAPMAZ (suzulmus yanitta esitlik BOZULUR)", () => {
    // quantity - allocated = 380, kota 700 — esit DEGIL → yanlış formül burada ayrışır.
    expect(
      siteQuotaOf(row({ quantity: "480", allocated_quantity: "100", unallocated_quantity: "600" })),
    ).toBe("700");
  });

  it("kesirli olcekleri KAYIPSIZ toplar (float yuvarlama YOK)", () => {
    expect(
      siteQuotaOf(row({ quantity: "1", allocated_quantity: "0.1", unallocated_quantity: "0.2" })),
    ).toBe("0.3");
  });

  it("hic tahsis yokken kota unallocated'a esittir", () => {
    expect(
      siteQuotaOf(row({ quantity: "44", allocated_quantity: "0", unallocated_quantity: "44" })),
    ).toBe("44");
  });
});

describe("kapsam maskesi (2026-09-19)", () => {
  it("🔴 metraj MASKELIYSE kota null doner — SAHTE sifir basilmaz", () => {
    // `finance` kapsamindaki rol metraji goremez; alanlar `null` gelir.
    // `sumDecimalStrings([null, null])` "0" dondurseydi ekran pozun kotasini
    // SIFIR diye basar ve kullanici o sayiya dayanarak tahsis yapardi.
    expect(siteQuotaOf({ allocated_quantity: null, unallocated_quantity: null })).toBeNull();
    expect(siteQuotaOf({ allocated_quantity: "5", unallocated_quantity: null })).toBeNull();
    expect(siteQuotaOf({ allocated_quantity: null, unallocated_quantity: "5" })).toBeNull();
  });

  it("🔴 POZITIF KONTROL — maskesiz hesap BOZULMAZ", () => {
    expect(siteQuotaOf({ allocated_quantity: "5", unallocated_quantity: "7" })).toBe("12");
  });

  it("🔴 SIFIR maskeli DEGILDIR", () => {
    expect(siteQuotaOf({ allocated_quantity: "0", unallocated_quantity: "0" })).toBe("0");
  });
});
