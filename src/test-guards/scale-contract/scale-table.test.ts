// @vitest-environment node
//
// TEST-F2 Ajan B — Katman 1 bekçisi (iskelet).
//
// 1) TODO-BACKEND kapısı: tablo backend tarafından doldurulana kadar bu bekçi
//    KIRMIZI kalmalı (emir: "iskelet yanlışlıkla 'boş tablo yeşil' diye merge
//    edilemez"). Şu an SCALE_TABLE'ın 202 satırının hepsi TODO-BACKEND —
//    bu test bu yüzden KIRMIZI, BEKLENEN.
// 2) EŞİTLİK bekçisi: openapi/openapi.json'daki ölçek-şüpheli TÜM şema·alan
//    kümesi ile SCALE_TABLE kümesi birebir aynı olmalı (fazla/eksik iki yön).
import { describe, it, expect } from "vitest";
import { SCALE_TABLE } from "@/lib/api/scale-table";
import { collectScaleSuspectFields, schemaKey } from "./openapi-scale-fields";

/**
 * FAZ 2d (TYPE-F1 madde 2) — `openapi-scale-fields.ts`teki
 * `SCALE_FIELD_NAME_PATTERN` (`pct|ratio|share|rate|percent|band`) AD
 * regex'idir; bu 6 satır AD'a göre DEĞİL, alanın `MetricPlaceholder`e `$ref`
 * VERMESİNE göre (yapısal tespit, `schema-walker.ts` `refsMetricPlaceholder`)
 * bulundu — "physical_progress"/"margin"/"average_margin" gibi adlar regex'e
 * hiç UYMAZ. Bilinçli İSTİSNA: regex'i genişletmek (ör. "progress"/"margin"
 * eklemek) şemanın GENELİNDE ölçülmemiş yeni eşleşmeler doğurur (bu fazın
 * kapsamı DIŞINDA) — bunun yerine bu 6 satır burada AÇIKÇA işaretlenir.
 */
const METRIC_PLACEHOLDER_STRUCTURAL_ROWS = new Set([
  "ContractingCard.financial_progress",
  "ContractingCard.physical_progress",
  "DashboardSummaryResponse.average_margin",
  "InvestmentCard.margin",
  "LandShareCard.construction_progress",
  "LandShareCard.margin",
]);

describe("scale-table · Katman 1 (TEST-F2 Ajan B)", () => {
  it("hiçbir satırda kanıt TODO-BACKEND kalmamalı (tablo doldurulmadan bekçi yeşil olamaz)", () => {
    const pending = SCALE_TABLE.filter((row) => row.kanit === "TODO-BACKEND");
    expect(
      pending.map((r) => schemaKey(r.schema, r.field)),
      `${pending.length} satır hâlâ TODO-BACKEND — backend mühendisi Katman 1 tablosunu doldurmadan bu bekçi yeşil olamaz.`,
    ).toEqual([]);
  });

  it("openapi ölçek-şüpheli alan kümesi == SCALE_TABLE kümesi (iki yön)", () => {
    const openApiKeys = new Set(collectScaleSuspectFields().map((r) => schemaKey(r.schema, r.field)));
    const tableKeys = new Set(SCALE_TABLE.map((r) => schemaKey(r.schema, r.field)));

    const missingFromTable = [...openApiKeys].filter((k) => !tableKeys.has(k)).sort();
    const extraInTable = [...tableKeys]
      .filter((k) => !openApiKeys.has(k) && !METRIC_PLACEHOLDER_STRUCTURAL_ROWS.has(k))
      .sort();

    expect(missingFromTable, "openapi'de var ama tabloda YOK").toEqual([]);
    expect(extraInTable, "tabloda var ama openapi eşleşmesi YOK (yanlış eşleşme/silinmiş alan olabilir)").toEqual(
      [],
    );

    // İSTİSNA listesinin KENDİSİ bayatlamasın: her giriş GERÇEKTEN tabloda
    // olmalı (yoksa "istisna" anlamsız kalır).
    const staleStructuralExceptions = [...METRIC_PLACEHOLDER_STRUCTURAL_ROWS].filter((k) => !tableKeys.has(k));
    expect(staleStructuralExceptions, "METRIC_PLACEHOLDER_STRUCTURAL_ROWS'ta artık tabloda olmayan satır").toEqual(
      [],
    );
  });

  it("tabloda tekrar eden şema·alan satırı yok", () => {
    const keys = SCALE_TABLE.map((r) => schemaKey(r.schema, r.field));
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(duplicates).toEqual([]);
  });
});
