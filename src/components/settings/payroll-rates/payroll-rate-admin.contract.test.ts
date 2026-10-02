import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  INCOME_KINDS,
  INCOME_KIND_LABELS,
  MAX_PAYROLL_YEAR,
  MIN_PAYROLL_YEAR,
  NON_PAYROLL_SOURCES,
  PAYROLL_TYPE_SOURCES,
  RATE_FIELDS,
  WORKER_SOURCE_LABELS,
} from "./payroll-rate-admin";

/**
 * 🔴🔴 SÖZLEŞME BEKÇİSİ — "DÖRT bordro tipi" iddiası `openapi.json` OKUNARAK
 * doğrulanır, elle yazılmış bir listeyle DEĞİL.
 *
 * **Neden var:** `WorkerSource` enum'unda BEŞ üye vardır ama biri (`general`)
 * bordro tipi DEĞİLDİR. İki yönlü çürüme mümkündür ve `typecheck` İKİSİNİ DE
 * göremez:
 *   • backend enum'a ALTINCI bir üye eklerse ekran onu sessizce YUTAR
 *     (`Record<WorkerSource, …>` etiketi zorlar ama sekme listesi zorlamaz);
 *   • bir üye enum'dan ÇIKARSA sekme var olmayan bir tipe PUT atardı.
 * `expect(PAYROLL_TYPE_SOURCES).toHaveLength(4)` yazan bir test bu sınıfa
 * KÖRDÜR: sabiti tekrar eder, sözleşmeyi ölçmez.
 */
const OPENAPI = JSON.parse(
  readFileSync(path.join(process.cwd(), "openapi", "openapi.json"), "utf8"),
) as {
  paths: Record<string, Record<string, { parameters?: { name: string; in: string; schema?: Record<string, unknown> }[] }>>;
  components: { schemas: Record<string, { enum?: string[]; required?: string[]; properties?: Record<string, unknown> }> };
};

describe("WorkerSource — dört bordro tipi + bir bordro-DIŞI üye", () => {
  const enumMembers = OPENAPI.components.schemas.WorkerSource!.enum!;

  it("ekranın iki listesi enum'un TAMAMINI kapsar (eksik/fazla üye yok)", () => {
    expect([...PAYROLL_TYPE_SOURCES, ...NON_PAYROLL_SOURCES].sort()).toEqual(
      [...enumMembers].sort(),
    );
  });
  it("iki liste KESİŞMEZ", () => {
    const kesisim = PAYROLL_TYPE_SOURCES.filter((s) => NON_PAYROLL_SOURCES.includes(s));
    expect(kesisim).toEqual([]);
  });
  it("etiket sözlüğü enum'un her üyesini taşır", () => {
    expect(Object.keys(WORKER_SOURCE_LABELS).sort()).toEqual([...enumMembers].sort());
  });
  it("`general` bordro tipi DEĞİLDİR (backend docstring'i, sözleşmeye yansımış)", () => {
    expect(OPENAPI.components.schemas.WorkerSource!.enum).toContain("general");
    expect(PAYROLL_TYPE_SOURCES).not.toContain("general");
  });
});

describe("IncomeKind", () => {
  it("ekranın sekme listesi enum'un TAMAMIDIR", () => {
    expect([...INCOME_KINDS].sort()).toEqual([...OPENAPI.components.schemas.IncomeKind!.enum!].sort());
    expect(Object.keys(INCOME_KIND_LABELS).sort()).toEqual([...INCOME_KINDS].sort());
  });
});

describe("PayrollRateUpdate — TAM SET", () => {
  it("ekranın alan listesi gövdenin `required` kümesiyle BİREBİR aynıdır", () => {
    const required = OPENAPI.components.schemas.PayrollRateUpdate!.required!;
    expect([...RATE_FIELDS].sort()).toEqual([...required].sort());
  });
  it("`is_active` zorunlu DEĞİLDİR (varsayılanı var) ama ekran onu yine de gönderir", () => {
    expect(OPENAPI.components.schemas.PayrollRateUpdate!.required).not.toContain("is_active");
    expect(RATE_FIELDS).not.toContain("is_active" as never);
  });
});

describe("yıl kısıtı — `Path(ge=…, le=…)`", () => {
  it("iki yazma ucunun da yıl aralığı ekrandaki sabitlerle aynıdır", () => {
    for (const yol of ["/payroll/rates/{year}/{source}", "/payroll/tax-brackets/{year}/{income_kind}"]) {
      const param = OPENAPI.paths[yol]!.put!.parameters!.find((p) => p.name === "year" && p.in === "path")!;
      expect(param.schema!.minimum).toBe(MIN_PAYROLL_YEAR);
      expect(param.schema!.maximum).toBe(MAX_PAYROLL_YEAR);
    }
  });
});

describe("uçların VARLIĞI", () => {
  it("dört uç da sözleşmede tanımlıdır", () => {
    expect(OPENAPI.paths["/payroll/rates"]!.get).toBeDefined();
    expect(OPENAPI.paths["/payroll/rates/{year}/{source}"]!.put).toBeDefined();
    expect(OPENAPI.paths["/payroll/tax-brackets"]!.get).toBeDefined();
    expect(OPENAPI.paths["/payroll/tax-brackets/{year}/{income_kind}"]!.put).toBeDefined();
  });
  /**
   * 🔴 "Kopyala" DÜĞMESİNİN UCU YOKTUR — mockup yorumu
   * `POST /settings/payroll-rates/copy` vaat ediyor. Ölçüldü: sözleşmede
   * `copy` içeren TEK BİR yol yok. Ekran kopyalamayı İSTEMCİDE yapar
   * (kaynak yılı okur, hedef yılın FORMUNU doldurur, kullanıcı kaydeder).
   * Bu bekçi, ileride böyle bir uç açılırsa kırmızıya dönüp kararı yeniden
   * açar — sessizce eskimiş bir gerekçe bırakmaz. Kapsam yalnız bordro/ayar kökleri:
   * başka modüllerin kopya uçları (ör. TKL-B5 `/offers/templates/{id}/copy`) bu kararı ilgilendirmez.
   */
  it("bordro/ayar köklerinde `copy` içeren bir uç YOKTUR (istemci-tarafı kopyalamanın gerekçesi)", () => {
    const payrollPaths = Object.keys(OPENAPI.paths).filter((p) => p.startsWith("/payroll") || p.startsWith("/settings"));
    expect(payrollPaths.length).toBeGreaterThan(0);
    expect(payrollPaths.filter((p) => p.includes("copy"))).toEqual([]);
  });
});
