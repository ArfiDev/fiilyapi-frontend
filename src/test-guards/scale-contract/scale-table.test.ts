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
    const extraInTable = [...tableKeys].filter((k) => !openApiKeys.has(k)).sort();

    expect(missingFromTable, "openapi'de var ama tabloda YOK").toEqual([]);
    expect(extraInTable, "tabloda var ama openapi eşleşmesi YOK (yanlış eşleşme/silinmiş alan olabilir)").toEqual(
      [],
    );
  });

  it("tabloda tekrar eden şema·alan satırı yok", () => {
    const keys = SCALE_TABLE.map((r) => schemaKey(r.schema, r.field));
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(duplicates).toEqual([]);
  });
});
