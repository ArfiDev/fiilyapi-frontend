import { describe, it, expect } from "vitest";

import type {
  ContractDistributionGroup,
  ContractDistributionItem,
} from "@/lib/api/hooks/useContract";

import {
  DISTRIBUTION_ACCENT_COUNT,
  allocationQuantityFor,
  buildUnitByItemCode,
  distributionCellDisplayValue,
  distributionSiteAccent,
  distributionSiteSummaryTitle,
  isRemainingSettled,
  isUndistributedItem,
  resolveSiteItemUnit,
} from "./distribution-derive";

function item(overrides: Partial<ContractDistributionItem> = {}): ContractDistributionItem {
  return {
    id: "ci-1",
    code: "03.001",
    source_code: null,
    description: "Kat Döşemesi Betonu",
    unit: "m³",
    quantity: "3200.000",
    unit_price: "1850.00",
    remaining_quantity: "0.000",
    allocations: [{ site_id: "s-1", quantity: "1900.000", boq_item_id: "ci-1" }],
    ...overrides,
  };
}

function group(items: ContractDistributionItem[]): ContractDistributionGroup {
  return { id: "cg-1", name: "A — Betonarme İşleri", sort_order: 10, items };
}

describe("distributionSiteAccent — dinamik kolon renk sırası (POZ 82-83)", () => {
  it("ilk iki şantiye mockup'ın iki tonunu alır", () => {
    expect(distributionSiteAccent(0)).toBe(0);
    expect(distributionSiteAccent(1)).toBe(1);
  });

  it("mockup'ta çizilmemiş fazladan şantiyelerde palet döngüye girer", () => {
    expect(distributionSiteAccent(DISTRIBUTION_ACCENT_COUNT)).toBe(0);
    expect(distributionSiteAccent(DISTRIBUTION_ACCENT_COUNT + 2)).toBe(2);
  });
});

describe("birim istemci join'i (POZ 172-174 · şemada `unit` YOK)", () => {
  it("özet kaleminin birimi ızgaradaki AYNI POZ KODUNDAN çözülür", () => {
    const unitByCode = buildUnitByItemCode([
      group([item(), item({ id: "ci-3", code: "03.003", unit: "Ton" })]),
    ]);

    expect(resolveSiteItemUnit(unitByCode, "03.001")).toBe("m³");
    expect(resolveSiteItemUnit(unitByCode, "03.003")).toBe("Ton");
  });

  it("kod ızgarada yoksa birim ÇÖZÜLEMEZ ve uydurulmaz (null)", () => {
    const unitByCode = buildUnitByItemCode([group([item()])]);

    expect(resolveSiteItemUnit(unitByCode, "99.999")).toBeNull();
  });

  it("birim boş string ise de null döner (boşluk basılmaz)", () => {
    const unitByCode = buildUnitByItemCode([group([item({ unit: "  " })])]);

    expect(resolveSiteItemUnit(unitByCode, "03.001")).toBeNull();
  });
});

describe("distributionSiteSummaryTitle — POZ 170 sonek artefaktı", () => {
  it("mockup'ın ' Şantiyesi' soneki adda yoksa eklenir", () => {
    expect(distributionSiteSummaryTitle("A-Blok")).toBe("A-Blok Şantiyesi");
  });

  it("ad zaten sonekle bitiyorsa TEKRARLANMAZ", () => {
    expect(distributionSiteSummaryTitle("A-Blok Şantiyesi")).toBe("A-Blok Şantiyesi");
    expect(distributionSiteSummaryTitle("A-Blok ŞANTİYESİ")).toBe("A-Blok ŞANTİYESİ");
  });
});

describe("distributionCellDisplayValue — hücrenin başlangıç metni", () => {
  it("backend Decimal'inin sondaki sıfırları GÖSTERİMDE kırpılır", () => {
    expect(distributionCellDisplayValue("1900.000")).toBe("1900");
    expect(distributionCellDisplayValue("1.500")).toBe("1.5");
  });

  it("kota yoksa hücre boş açılır", () => {
    expect(distributionCellDisplayValue(null)).toBe("");
    expect(distributionCellDisplayValue(undefined)).toBe("");
  });

  it("tam sayı metni olduğu gibi kalır", () => {
    expect(distributionCellDisplayValue("120")).toBe("120");
  });
});

describe("satır türevleri", () => {
  it("kalemin şantiyedeki kotası bulunur, yoksa null döner", () => {
    expect(allocationQuantityFor(item(), "s-1")).toBe("1900.000");
    expect(allocationQuantityFor(item(), "s-2")).toBeNull();
  });

  it("hiç ataması olmayan kalem dağıtılmamış sayılır (POZ 153-155)", () => {
    expect(isUndistributedItem(item({ allocations: [] }))).toBe(true);
    expect(isUndistributedItem(item())).toBe(false);
  });

  it("Kalan rozeti yalnız 0'da yeşil ✓ olur (POZ 100 vs 161)", () => {
    expect(isRemainingSettled("0.000")).toBe(true);
    expect(isRemainingSettled("18400.000")).toBe(false);
    expect(isRemainingSettled("abc")).toBe(false);
  });
});
