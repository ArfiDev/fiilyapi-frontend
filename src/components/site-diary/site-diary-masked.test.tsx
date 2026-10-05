import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import type {
  SiteDiaryEntryDetail,
  SiteDiaryEntryListItem,
  SiteDiaryLineRead,
  SiteDiarySummary,
  SiteDiarySummaryItem,
} from "@/lib/api/hooks/useSiteDiary";
import { meFixture } from "@/lib/auth/page-grants.testkit";
import { buildDetailLineGroups } from "@/components/site-diary-detail/lines-derive";
import { DiaryDetailLinesCard } from "@/components/site-diary-detail/DiaryDetailLinesCard";

import { buildDiaryLineTree, type DiaryTreeBoqItem } from "./diary-lines-tree";
import { DiaryLinesCard, type DiaryLinesCardProps } from "./DiaryLinesCard";
import { DiarySummaryAccrualTable } from "./DiarySummaryAccrualTable";
import { addDiaryLines, emptyDiaryForm, type DiaryFormState } from "./form-state";
import { buildRecentEntryRows } from "./recent-entries";

/**
 * IZN-F4d.2 — günlük kayıt tutarları (sözleşme `IZN-B4d-SOZLESME.md` §1/§3): kategori gizliyken birim fiyat, satır
 * tutarı, günlük toplamı ve özet tutarları `null`; "—" basılır, toplam 0 SAYILMAZ, başlıkta TEK kilit.
 */
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const HINT = "Bu bilgi rolünüz için gizli";

function setHidden(hidden: readonly ("maliyet_kar" | "sozlesme_fiyat" | "tum_tutarlar")[]) {
  vi.mocked(useSession).mockReturnValue({
    me: meFixture({ hiddenFields: hidden }),
    isLoading: false,
  } as unknown as ReturnType<typeof useSession>);
}

function line(overrides: Partial<SiteDiaryLineRead> = {}): SiteDiaryLineRead {
  return {
    id: "l-1",
    boq_item_id: "duv",
    section_id: "k15",
    section_name: "Kat 1–5",
    code: "DUV.01.01",
    description: "Tuğla duvar",
    unit: "m²",
    unit_price: "420.00",
    quantity: "10.000",
    cumulative_quantity: "200.000",
    leaf_cumulative_quantity: "10.000",
    planned_quantity: "500.000",
    remaining_quantity: "490.000",
    overrun_reason: null,
    line_amount: "4200.00",
    ...overrides,
  };
}

const MASKED = { unit_price: null, line_amount: null } as const;
const BOQ: DiaryTreeBoqItem[] = [
  { id: "duv", code: "DUV.01.01", description: "Tuğla duvar", unit: "m²", unit_price: null, unallocated_quantity: "0" },
];
const SECTIONS = [{ id: "k15", name: "Kat 1–5", code: "K15", sort_order: 1 }];

beforeEach(() => setHidden([]));

describe("lines-derive — gün/bölüm toplamı", () => {
  it("satır tutarları null → bölüm ve gün toplamı null (0 sayılmaz)", () => {
    const groups = buildDetailLineGroups(
      { lines: [line(MASKED), line({ id: "l-2", ...MASKED })], lines_total: null },
      { id: "k15", name: "Kat 1–5" },
    );
    expect(groups.current?.amountTotal).toBeNull();
    expect(groups.dayAmountTotal).toBeNull();
    expect(groups.current?.rows[0]).toMatchObject({ amount: null, unitPrice: null });
  });

  it("dolu satırlar → bölüm toplamı hesaplanır", () => {
    const groups = buildDetailLineGroups({ lines: [line(), line({ id: "l-2", line_amount: "800.00" })], lines_total: "5000.00" }, { id: "k15", name: "Kat 1–5" });
    expect(groups.current?.amountTotal).toBe("5000.00");
    expect(groups.dayAmountTotal).toBe("5000.00");
  });
});

describe("buildDiaryLineTree — grup toplamı", () => {
  const input = { boqItems: BOQ, sections: SECTIONS };

  it("kayıtlı satırın tutarı null → grup toplamı null", () => {
    const groups = buildDiaryLineTree({ ...input, lines: [line(MASKED)], form: emptyDiaryForm("2026-07-15") });
    expect(groups[0]?.totals.amount).toBeNull();
    expect(groups[0]?.unitPrice).toBeNull();
  });

  it("eklenmiş (kaydedilmemiş) satır toplamı BOZMAZ; gizli satır yine null yapar", () => {
    const form: DiaryFormState = addDiaryLines(emptyDiaryForm("2026-07-15"), [
      { boqItemId: "duv", sectionId: null, plannedQuantity: "0" },
    ]);
    const filled = buildDiaryLineTree({ ...input, lines: [line()], form });
    expect(filled[0]?.leaves).toHaveLength(2);
    expect(filled[0]?.totals.amount).toBe("4200.00");
    const masked = buildDiaryLineTree({ ...input, lines: [line(MASKED)], form });
    expect(masked[0]?.totals.amount).toBeNull();
  });
});

describe("DiaryLinesCard — Hakediş ₺ sütunu", () => {
  function renderCard(lines: SiteDiaryLineRead[], linesTotal: string | null) {
    const form = emptyDiaryForm("2026-07-15");
    const props: DiaryLinesCardProps = {
      entry: { id: "e1", lines, lines_total: linesTotal } as unknown as SiteDiaryEntryDetail,
      linesTotal,
      groups: buildDiaryLineTree({ lines, form, boqItems: BOQ, sections: SECTIONS }),
      sections: SECTIONS,
      form,
      onQuantityChange: vi.fn(),
      onOverrunReasonChange: vi.fn(),
      onAddLines: vi.fn(),
      onRemoveLine: vi.fn(),
      disabled: false,
      isLocked: false,
      canEditRows: true,
      isBoqUnavailable: false,
      isDirty: false,
      paymentsHref: "/x",
      boqHref: null,
      lineRefs: new Map(),
    };
    return render(<DiaryLinesCard {...props} />);
  }

  it("kategori gizli + tutarlar null → '—', toplam '—' (₺ 0 DEĞİL), başlıkta TEK kilit", () => {
    setHidden(["maliyet_kar"]);
    renderCard([line(MASKED)], null);
    const total = document.querySelector(".diary-lines__total-amount") as HTMLElement;
    expect(total).toHaveTextContent("—");
    expect(total).not.toHaveTextContent("0");
    const head = screen.getByRole("columnheader", { name: /Hakediş ₺/ });
    expect(within(head).getAllByTestId("hidden-mark")).toHaveLength(1);
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
    expect(screen.getAllByText(HINT).length).toBe(1);
  });

  it("kategori gizli DEĞİL (null = veri yok) → '—' ama kilit YOK", () => {
    renderCard([line(MASKED)], null);
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
    expect(document.querySelector(".diary-lines__total-amount")).toHaveTextContent("—");
  });

  it("dolu tutar → kilit yok, toplam basılır", () => {
    setHidden(["maliyet_kar"]);
    renderCard([line()], "4200.00");
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
    expect(document.querySelector(".diary-lines__total-amount")).toHaveTextContent("₺ 4.200");
  });
});

describe("DiaryDetailLinesCard — ₺ sütunu S10'da basılmaz; neden notu", () => {
  const groups = buildDetailLineGroups({ lines: [line(MASKED)], lines_total: null }, { id: "k15", name: "Kat 1–5" });

  it("kategori gizli + tutar null → kilit notu; ₺ sütunu yok", () => {
    setHidden(["sozlesme_fiyat"]);
    render(<DiaryDetailLinesCard groups={groups} columns={null} notice={null} isPaymentHidden paymentsHref="/x" />);
    expect(screen.getByTestId("hidden-mark-note")).toBeInTheDocument();
    expect(screen.queryByText("Bugünkü Hakediş Katkısı")).not.toBeInTheDocument();
  });

  it("kategori gizli değil → not yok", () => {
    render(<DiaryDetailLinesCard groups={groups} columns={null} notice={null} isPaymentHidden paymentsHref="/x" />);
    expect(screen.queryByTestId("hidden-mark-note")).not.toBeInTheDocument();
  });
});

describe("DiarySummaryAccrualTable — özet tutarları", () => {
  const item = { amount: null, boq_amount: null, unit_price: null, boq_item_id: "b", code: "01", description: "Beton", unit: "m³", completion_ratio: "0.5", quantity: "1", boq_quantity: "2" } as unknown as SiteDiarySummaryItem;
  const summary = { entry_count: 1, items: [item], site_id: "s", total_amount: null, year: 2026, month: 7 } as unknown as SiteDiarySummary;

  it("null tutarlar '—'; toplam '—' (₺ 0 DEĞİL); iki başlıkta birer kilit", () => {
    setHidden(["maliyet_kar"]);
    render(<DiarySummaryAccrualTable summary={summary} isLoading={false} isError={false} />);
    const total = document.querySelector(".diary-summary-table__total-amount") as HTMLElement;
    expect(total).toHaveTextContent("—");
    expect(total).not.toHaveTextContent("0");
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(2);
  });

  it("kategori gizli değilse kilit yok", () => {
    render(<DiarySummaryAccrualTable summary={summary} isLoading={false} isError={false} />);
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
  });
});

describe("buildRecentEntryRows", () => {
  it("lines_total null → '— hakediş katkısı' (₺ 0 basılmaz)", () => {
    const [row] = buildRecentEntryRows(
      [{ id: "d", entry_date: "2026-07-15", section_id: null, weather: "sunny", status: "submitted", worker_total: 3, lines_total: null } as unknown as SiteDiaryEntryListItem],
      [],
    );
    expect(row?.amountLabel).toBe("— hakediş katkısı");
  });
});
