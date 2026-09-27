// TYPE-F1 SPIKE — bekçi: `DeepScale`in ad-tabanlı eşlemesi TABLODAN türer
// (elle liste yok), ve tablodaki ÇAKIŞAN adlar (aynı ad, birden fazla farklı
// `scale`) BİREBİR `SCALE_NAME_EXCEPTIONS`e eşit olmalı — aksi hâlde DeepScale
// yanlış bir alanı (ör. `CatalogActualSite.rate` birim fiyatını) sessizce
// `Percent` diye işaretler (bkz. emir §3 "Çakışan adlar").
import { describe, it, expect } from "vitest";

import { SCALE_TABLE } from "./scale-table";
import { SCALE_NAME_EXCEPTIONS } from "./scale";

function computeScaleNameCollisions(): string[] {
  const scalesByField = new Map<string, Set<string>>();
  for (const row of SCALE_TABLE) {
    const scales = scalesByField.get(row.field) ?? new Set<string>();
    scales.add(row.scale);
    scalesByField.set(row.field, scales);
  }
  return [...scalesByField.entries()].filter(([, scales]) => scales.size > 1).map(([field]) => field);
}

describe("DeepScale ad çakışmaları · tablodan türetilen küme == SCALE_NAME_EXCEPTIONS", () => {
  it("tabloda birden fazla farklı `scale` taşıyan alan adları istisna listesiyle BİREBİR eşleşir", () => {
    const derived = computeScaleNameCollisions().sort();
    const exceptions = [...SCALE_NAME_EXCEPTIONS].sort();
    expect(derived).toEqual(exceptions);
  });
});
