import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EvQtyTreeRow } from "@/lib/api/models";
import { formatPf } from "@/lib/earned-value";

import { pct, qty, rate, wholeHours } from "./daily-columns";
import { DAILY_REPORT_FIXTURE_DRAFT } from "./daily-fixtures";
import { DAILY_MIXED_DISCIPLINE, DAILY_RESTRICTED_APPROVED, DAILY_RESTRICTED_LIVE } from "./daily-scope-fixtures";
import { DailyPrintView } from "./DailyPrintView";

const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

/**
 * PLN-F3.4-düzeltme (lider eki 4) · Ondalık kanonu — `footer.undistributed_day`/
 * `unallocated_day` (backend Decimal → string) `Number(x) > 0` YERİNE
 * `compareDecimalStrings(x, "0") > 0` ile karşılaştırılır (CEO bulgusu,
 * QURR'da da çıktı; `lib/earned-value/decimal-input.ts` başlığındaki
 * `0.945 * 100 === 94.49999999999999` kanonu). `.ev-print-reconciliation__warn`
 * sınıfı BUNU okur — "Σ harcanan… + dağıtılmamış…" özet satırı AYRI ve HER
 * ZAMAN basılır, "dağıtılmamış" sözcüğüyle sorgulamak o satırla ÇAKIŞIR, bu
 * yüzden burada sınıf sorgusu kullanılır.
 */
describe("DailyPrintView — mutabakat uyarı satırı ondalık kanonu (GİR:371-379)", () => {
  it("undistributed_day > 0 iken uyarı satırı basılır ve değeri taşır", () => {
    const report = {
      ...DAILY_REPORT_FIXTURE_DRAFT,
      draft_diary_dates: [],
      unrated_entries: [],
      footer: { ...DAILY_REPORT_FIXTURE_DRAFT.footer!, undistributed_day: "16" },
    };
    const { container } = render(<DailyPrintView report={report} eyebrow="FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi" />);
    const warn = container.querySelector(".ev-print-reconciliation__warn");
    expect(warn).not.toBeNull();
    expect(warn?.textContent).toContain("16 a-s dağıtılmamış");
  });

  it("undistributed_day tam 0 iken (ve taslak/oransız girdi de yoksa) uyarı satırı basılmaz", () => {
    const report = {
      ...DAILY_REPORT_FIXTURE_DRAFT,
      draft_diary_dates: [],
      unrated_entries: [],
      footer: { ...DAILY_REPORT_FIXTURE_DRAFT.footer!, undistributed_day: "0" },
    };
    const { container } = render(<DailyPrintView report={report} eyebrow="FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi" />);
    expect(container.querySelector(".ev-print-reconciliation__warn")).toBeNull();
  });

  it("undistributed_day '0.00' (sıfıra kanonik eşit, farklı yazım) iken de uyarı satırı basılmaz", () => {
    const report = {
      ...DAILY_REPORT_FIXTURE_DRAFT,
      draft_diary_dates: [],
      unrated_entries: [],
      footer: { ...DAILY_REPORT_FIXTURE_DRAFT.footer!, undistributed_day: "0.00" },
    };
    const { container } = render(<DailyPrintView report={report} eyebrow="FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi" />);
    expect(container.querySelector(".ev-print-reconciliation__warn")).toBeNull();
  });

  it("F3.6b lider denetimi (5. tur) — 'ekran ≡ baskı': taslak tarihleri 'gg.aa' + 've' bağlacı basar, virgül+yıl DEĞİL", () => {
    const report = {
      ...DAILY_REPORT_FIXTURE_DRAFT,
      draft_diary_dates: ["2026-09-21", "2026-09-23"],
      unrated_entries: [],
      footer: { ...DAILY_REPORT_FIXTURE_DRAFT.footer!, undistributed_day: "0" },
    };
    const { container } = render(<DailyPrintView report={report} eyebrow="FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi" />);
    const warn = container.querySelector(".ev-print-reconciliation__warn");
    expect(warn?.textContent).toContain("21.09 ve 23.09 günlükleri gönderilmedi");
  });

  it("CEO ölçümü (7. tur, madde G3, 'ekran ≡ baskı') — oransız giriş satırı BÖLÜM adını (section_name) taşır", () => {
    const { container } = render(
      <DailyPrintView report={DAILY_REPORT_FIXTURE_DRAFT} eyebrow="FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi" />,
    );
    const warn = container.querySelector(".ev-print-reconciliation__warn");
    expect(warn?.textContent).toContain("Buat/priz montajı · Çatı oransız");
  });
});

/**
 * PLN-F3.4-düzeltme (F3.6b lider denetimi c) · Yazdırma sayfa 1'de "2 · 7
 * günlük trend" bölümü (GİR:331-347) ÖNCEDEN HİÇ BASILMIYORDU. Mini grafik
 * OPSİYONEL DEĞİL — `buildTrendChart` geometrisiyle iki çizgi (planlı/gerçek).
 */
describe("DailyPrintView — sayfa 1 '2 · 7 günlük trend' (GİR:331-347)", () => {
  it("başlık + 7 günlük tablo + iki çizgili mini grafik basılır", () => {
    const { container, getByText } = render(
      <DailyPrintView report={DAILY_REPORT_FIXTURE_DRAFT} eyebrow="FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi" />,
    );
    expect(getByText("2 · 7 günlük trend")).toBeInTheDocument();
    const table = container.querySelector(".ev-print-trend__table");
    expect(table).not.toBeNull();
    expect(container.querySelectorAll(".ev-print-trend__head--day")).toHaveLength(7);
    const chart = container.querySelector(".ev-print-trend__chart svg");
    expect(chart).not.toBeNull();
    expect(container.querySelector(".ev-print-trend__line--planned")).not.toBeNull();
    expect(container.querySelector(".ev-print-trend__line--actual")).not.toBeNull();
  });

  it("trend boşsa (tüm günler gelecek) grafik BASILMAZ, tablo yine basılır", () => {
    const futureTrend = DAILY_REPORT_FIXTURE_DRAFT.trend.map((t) => ({ ...t, is_future: true }));
    const report = { ...DAILY_REPORT_FIXTURE_DRAFT, trend: futureTrend };
    const { container } = render(<DailyPrintView report={report} eyebrow="FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi" />);
    expect(container.querySelector(".ev-print-trend__table")).not.toBeNull();
    expect(container.querySelector(".ev-print-trend__chart svg")).toBeNull();
  });
});

/**
 * PLN-F3.4-düzeltme (F3.6b lider denetimi, 2. tur) · Yazdırmadaki miktar
 * tablosu mockup GİR:352-386'nın TAM 12 kolonuyla BİREBİR olmalı — önceki
 * 7 kolonluk "sade" satır bir SAPMAYDI. Hücre metinleri `daily-columns.tsx`
 * (ekran) ile AYNI `rate`/`qty`/`pct` biçimleyicilerinden gelir ("ekran ≡
 * baskı" — QURR'daki `qurrCellText` dersi).
 */
describe("DailyPrintView — miktar tablosu 12 kolon BİREBİR (GİR:352-386)", () => {
  it("başlık satırı mockup'ın 12 etiketini SIRAYLA taşır", () => {
    const { container } = render(
      <DailyPrintView report={DAILY_REPORT_FIXTURE_DRAFT} eyebrow="FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi" />,
    );
    const head = container.querySelector(".ev-print-qty__head-row");
    expect(head).not.toBeNull();
    const labels = Array.from(head?.querySelectorAll("span") ?? []).map((el) => el.textContent);
    expect(labels).toEqual([
      "İş tipi",
      "Birim",
      "Plan oran",
      "Gerç. gün",
      "Gerç. küm.",
      "Plan miktar",
      "Gün miktar",
      "Küm miktar",
      "Kalan",
      "Gün PF",
      "Gün harc.",
      "İlerleme",
    ]);
  });

  it("yaprak satırı TAM 12 alanı, SIRAYLA, ekranla AYNI biçimleyicilerle basar (ör. 'Kalıp')", () => {
    const { container } = render(
      <DailyPrintView report={DAILY_REPORT_FIXTURE_DRAFT} eyebrow="FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi" />,
    );
    const kalip = DAILY_REPORT_FIXTURE_DRAFT.quantities.find((r) => r.name === "Kalıp")!;
    const row = Array.from(container.querySelectorAll(".ev-print-qty__row")).find((el) => el.textContent?.startsWith("Kalıp"));
    expect(row).toBeDefined();
    // Doğrudan çocuk `<span>`ler — 12. (İlerleme) sarmalayıcı kendi metnini
    // (çubuk + yüzde) `textContent` ile taşır; iç içe span'ler
    // `:scope > span` ile DIŞLANIR (yalnız üst düzey 12 alan sayılır).
    const cells = Array.from(row!.querySelectorAll(":scope > span")).map((el) => el.textContent);
    expect(cells).toEqual([
      "Kalıp",
      "m²",
      rate(kalip.planned_unit_mhr),
      rate(kalip.actual_unit_mhr_day),
      rate(kalip.actual_unit_mhr_cum),
      qty(kalip.planned_qty),
      qty(kalip.qty_day),
      qty(kalip.qty_cum),
      qty(kalip.remaining_qty),
      formatPf(kalip.pf_day), // PfBandCell
      wholeHours(kalip.spent_day), // CEO ölçümü (7. tur, madde G1) — a-s tam sayı
      `${pct(kalip.progress_pct_cum)}`,
    ]);
  });

  it("L1 başlık satırı own/subcon çipini basar (S18, ekranla AYNI kural)", () => {
    const { container } = render(
      <DailyPrintView report={DAILY_REPORT_FIXTURE_DRAFT} eyebrow="FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi" />,
    );
    const chips = Array.from(container.querySelectorAll(".ev-print-qty__head-chip")).map((el) => el.textContent);
    expect(chips).toContain("Kendi");
    expect(chips).toContain("Taşeron");
  });
});

/**
 * PLN-F3.4-düzeltme (F3.6b lider denetimi, 2. tur) · `paginateByGroup`
 * kapasitesi 12 kolonlu satırın gerçek yüksekliğine göre ÖLÇÜLDÜ (statik
 * hesap, yorum `DailyPrintView.tsx` başında) — 14'ten 28'e çıkarıldı. Bu
 * test kapasiteyi DOĞRUDAN okumaz (dışa aktarılmıyor); sınırdaki DAVRANIŞI
 * ölçer: tek grupta capacity KADAR satır → miktar bölümü TEK sayfada,
 * bir fazlası → İKİNCİ sayfaya TAŞAR.
 */
function leaf(id: number): EvQtyTreeRow {
  return {
    node_id: `leaf-${id}`,
    level: 2,
    name: `Kalem ${id}`,
    uom: "m²",
    contractor_type: "own",
    is_direct: true,
    pf_day: "1.00",
    pf_day_band: "green",
    pf_cum: "1.00",
    pf_cum_band: "green",
    planned_qty: "10",
    planned_unit_mhr: "1",
    progress_pct_cum: "0.5",
    qty_cum: "5",
    qty_day: "1",
    remaining_qty: "5",
    spent_day: "1",
    actual_unit_mhr_cum: "1",
    actual_unit_mhr_day: "1",
  };
}

function headRow(): EvQtyTreeRow {
  return {
    node_id: "d:TEK",
    level: 1,
    name: "Tek Disiplin",
    uom: null,
    contractor_type: "own",
    is_direct: null,
    pf_day: "1.00",
    pf_day_band: "green",
    pf_cum: "1.00",
    pf_cum_band: "green",
    planned_qty: null,
    planned_unit_mhr: null,
    progress_pct_cum: "0.5",
    qty_cum: null,
    qty_day: null,
    remaining_qty: null,
    spent_day: "27",
    actual_unit_mhr_cum: null,
    actual_unit_mhr_day: null,
  };
}

function quantityPageCount(container: HTMLElement): number {
  return container.querySelectorAll(".ev-print-qty__head-row").length;
}

describe("DailyPrintView — paginateByGroup kapasitesi (GİR:301, 12 kolonlu satır yüksekliğine göre ölçüldü)", () => {
  it("tek grupta 28 satır (1 başlık + 27 yaprak) TEK sayfaya sığar", () => {
    const quantities = [headRow(), ...Array.from({ length: 27 }, (_, i) => leaf(i))];
    const report = { ...DAILY_REPORT_FIXTURE_DRAFT, quantities };
    const { container } = render(<DailyPrintView report={report} eyebrow="FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi" />);
    expect(quantityPageCount(container)).toBe(1);
  });

  it("29. satır (1 başlık + 28 yaprak) İKİNCİ sayfaya TAŞAR", () => {
    const quantities = [headRow(), ...Array.from({ length: 28 }, (_, i) => leaf(i))];
    const report = { ...DAILY_REPORT_FIXTURE_DRAFT, quantities };
    const { container } = render(<DailyPrintView report={report} eyebrow="FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi" />);
    expect(quantityPageCount(container)).toBe(2);
  });
});

describe("DailyPrintView — KPI Genel etiketleri backend biçiminde (name: null)", () => {
  it("overall satırları `kind`'dan etiketlenir", () => {
    const kpis = DAILY_REPORT_FIXTURE_DRAFT.kpis.map((row) =>
      row.kind.startsWith("overall") ? { ...row, name: null } : row,
    );
    const { container } = render(
      <DailyPrintView report={{ ...DAILY_REPORT_FIXTURE_DRAFT, kpis }} eyebrow="FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi" />,
    );
    const names = Array.from(container.querySelectorAll("tr.ev-print-kpi__overall > td:first-child")).map((el) => el.textContent);
    expect(names).toEqual(["Genel", "Genel – Kendi", "Genel – Taşeron"]);
  });
});

describe("DailyPrintView — kısıtlı kullanıcı (DSC-F2 FAZ B)", () => {
  const EYEBROW = "FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi";

  it("kısıtlı: overall 'Genel (disiplinlerim)', Kendi/Taşeron eksiz", () => {
    scope.value = { isRestricted: true, names: ["Civil"] };
    const { container } = render(<DailyPrintView report={DAILY_RESTRICTED_LIVE} eyebrow={EYEBROW} />);
    const names = Array.from(container.querySelectorAll("tr.ev-print-kpi__overall > td:first-child")).map((el) => el.textContent);
    expect(names).toEqual(["Genel (disiplinlerim)", "Genel – Kendi", "Genel – Taşeron"]);
    scope.value = { isRestricted: false, names: [] };
  });

  it("kısıtlı: mutabakat 'başka disiplinde 110 a-s'; atamasız: bugünkü metin", () => {
    scope.value = { isRestricted: true, names: ["Civil"] };
    const restricted = render(<DailyPrintView report={DAILY_RESTRICTED_LIVE} eyebrow={EYEBROW} />);
    expect(restricted.container.querySelector(".ev-print-reconciliation__ok")?.textContent).toBe(
      "Σ harcanan 200 a-s + dağıtılmamış 16 a-s + başka disiplinde 110 a-s = Σ puantaj 326 a-s",
    );
    restricted.unmount();
    scope.value = { isRestricted: false, names: [] };
    const open = render(<DailyPrintView report={DAILY_REPORT_FIXTURE_DRAFT} eyebrow={EYEBROW} />);
    expect(open.container.querySelector(".ev-print-reconciliation__ok")?.textContent).toBe(
      "Σ harcanan 310 a-s + dağıtılmamış 16 a-s = Σ puantaj 326 a-s",
    );
  });

  it("kısıtlı onaylı (trend []): trend bölümü basılmaz; atamasız + boş trend: basılır", () => {
    scope.value = { isRestricted: true, names: ["Civil"] };
    const restricted = render(<DailyPrintView report={DAILY_RESTRICTED_APPROVED} eyebrow={EYEBROW} />);
    expect(restricted.container.querySelector('section[aria-label="7 günlük trend"]')).toBeNull();
    restricted.unmount();
    scope.value = { isRestricted: false, names: [] };
    const open = render(<DailyPrintView report={{ ...DAILY_RESTRICTED_APPROVED, trend: [] }} eyebrow={EYEBROW} />);
    expect(open.container.querySelector('section[aria-label="7 günlük trend"]')).not.toBeNull();
  });
});

describe("DailyPrintView — non_direct satır etiketi", () => {
  it("name null non_direct satırı 'Genel / Dolaylı · bütçe dışı' (kısıtlıda da ek yok)", () => {
    const nonDirect = { ...DAILY_REPORT_FIXTURE_DRAFT.kpis[0]!, kind: "non_direct" as const, name: null };
    scope.value = { isRestricted: true, names: ["Civil"] };
    const { container } = render(
      <DailyPrintView
        report={{ ...DAILY_REPORT_FIXTURE_DRAFT, kpis: [...DAILY_REPORT_FIXTURE_DRAFT.kpis, nonDirect] }}
        eyebrow="FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi"
      />,
    );
    const rows = container.querySelectorAll("table tbody tr");
    const last = Array.from(rows).find((r) => r.textContent?.startsWith("Genel / Dolaylı"));
    expect(last).toBeDefined();
    scope.value = { isRestricted: false, names: [] };
  });
});

describe("DailyPrintView — KPI satır anahtarı (karma disiplin)", () => {
  it("aynı node_id'li discipline/_own/_subcon satırlarında 'same key' uyarısı yok", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<DailyPrintView report={DAILY_MIXED_DISCIPLINE} eyebrow="FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi" />);
    expect(container.querySelectorAll(".ev-print-kpi tbody tr, table tbody tr").length).toBeGreaterThanOrEqual(DAILY_MIXED_DISCIPLINE.kpis.length);
    const keyWarnings = errors.mock.calls.filter((call) => String(call[0]).includes("same key"));
    errors.mockRestore();
    expect(keyWarnings).toEqual([]);
  });
});
