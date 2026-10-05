import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { meFixture } from "@/lib/auth/page-grants.testkit";
import { LastPriceCell } from "@/components/work-item-catalog/LastPriceCell";

import { makeDetail, makeRevision } from "./offer-detail-fixtures";
import { buildOfferPatchBodies, changedFormFields, detailFormValuesFromServer, maskedRatesOf, validateDetailForm } from "./offer-detail-form";
import { BOTH_RATES_MASKED, buildOfferCreateBody, initialOfferFormValues, validateOfferForm } from "./offer-form";
import { cellText, commitCell, isRateMasked, offerPriceHint, type CellContext } from "./offer-item-cells";
import { makeItem } from "./offer-item-fixtures";
import { OfferRateFields } from "./OfferRateFields";
import { OfferTotalsCard } from "./OfferTotalsCard";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const DETAIL = makeDetail();
const MASKED = makeRevision({ rev_no: 2, overhead_pct: null, profit_pct: null });

describe("IZN-F4.2 · teklif revizyonu GG/kâr % maskeli (null)", () => {
  it("maskedRatesOf yalnız null oranları işaretler", () => {
    expect([...maskedRatesOf(MASKED)].sort()).toEqual(["overheadPct", "profitPct"]);
    expect([...maskedRatesOf(makeRevision({ rev_no: 2, profit_pct: null }))]).toEqual(["profitPct"]);
    expect(maskedRatesOf(makeRevision({ rev_no: 2})).size).toBe(0);
  });

  it("form değeri boş metin (sıfır DEĞİL); kirlilik hesabına girmez; gövdede overhead_pct/profit_pct YOK", () => {
    const server = detailFormValuesFromServer(DETAIL, MASKED);
    expect(server.overheadPct).toBe("");
    expect(server.profitPct).toBe("");
    const values = { ...server, title: "Yeni ad" };
    const changed = changedFormFields(values, DETAIL, MASKED);
    expect([...changed]).toEqual(["title"]);
    const bodies = buildOfferPatchBodies({ ...values, overheadPct: "10", profitPct: "5" }, changed);
    expect(bodies.revision).toBeNull();
    expect(JSON.stringify(bodies)).not.toMatch(/overhead_pct|profit_pct/);
  });

  it("maskeli oran boş olsa da doğrulama hatası vermez; maskesiz boş oran hata verir", () => {
    const values = detailFormValuesFromServer(DETAIL, MASKED);
    expect(validateDetailForm(values, maskedRatesOf(MASKED))).toEqual({});
    expect(validateDetailForm(values).overheadPct).toBeDefined();
  });

  it("maskeli oran açık gönderilemez: maskeli kalan oran dolu metne düzenlense bile 'değişmiş' sayılmaz", () => {
    const values = { ...detailFormValuesFromServer(DETAIL, MASKED), overheadPct: "99" };
    expect(changedFormFields(values, DETAIL, MASKED).has("overheadPct")).toBe(false);
  });

  it("dolu oran normal düzenlenir (maske yalnız null alanda)", () => {
    const partial = makeRevision({ rev_no: 2, profit_pct: null });
    const values = { ...detailFormValuesFromServer(DETAIL, partial), overheadPct: "13" };
    const bodies = buildOfferPatchBodies(values, changedFormFields(values, DETAIL, partial));
    expect(bodies.revision).toEqual({ overhead_pct: "13" });
  });
});

describe("IZN-F4.2 · yeni teklif: maliyet_kar gizli rol GG/kâr göndermez", () => {
  const settings = { default_overhead_pct: "12.00", default_profit_pct: "15.00", default_vat_pct: "20.00", default_validity_days: 30 };
  const base = { ...initialOfferFormValues(settings as never, "2026-10-05"), employerId: "e1", title: "T" };

  it("maskeli iki oran gövdede YOK, KDV var; doğrulama onları atlar", () => {
    const values = { ...base, overheadPct: "", profitPct: "" };
    expect(validateOfferForm(values, BOTH_RATES_MASKED)).toEqual({});
    const body = buildOfferCreateBody(values, { kind: "blank" }, BOTH_RATES_MASKED);
    expect(body).not.toHaveProperty("overhead_pct");
    expect(body).not.toHaveProperty("profit_pct");
    expect(body.vat_pct).toBe("20");
  });

  it("maskesiz: oranlar gövdede (mevcut davranış)", () => {
    const body = buildOfferCreateBody(base, { kind: "blank" });
    expect(body.overhead_pct).toBe("12");
    expect(body.profit_pct).toBe("15");
  });
});

describe("IZN-F4.2 · kalem hücresi: revizyon oranı maskeliyse etkin değer bilinmez", () => {
  const ctx = (over: Partial<CellContext> = {}): CellContext => ({
    item: makeItem({ id: "it-1" }),
    revisionOverheadPct: null,
    revisionProfitPct: null,
    catalogUnitMhr: "1.8000",
    ...over,
  });

  it("GG/kâr hücresi '—', düzenleme noop (yazım ASLA gitmez); türev kâr ipucu '—'", () => {
    expect(isRateMasked("overheadPct", ctx())).toBe(true);
    expect(cellText("overheadPct", ctx())).toBe("—");
    expect(cellText("profitPct", ctx())).toBe("—");
    expect(commitCell("overheadPct", "20", ctx())).toEqual({ kind: "noop" });
    expect(commitCell("profitPct", "20", ctx())).toEqual({ kind: "noop" });
    const manual = ctx({ item: makeItem({ id: "m", offer_unit_price: "150.00", internal: { cost: "1000.00", man_hours: "1", overhead: null, profit: null, profit_pct: null } }) });
    expect(offerPriceHint(manual)).toContain("—");
  });

  it("maskesiz oran: hücre normal (12 / 15)", () => {
    const open = ctx({ revisionOverheadPct: "12.00", revisionProfitPct: "15.00" });
    expect(isRateMasked("overheadPct", open)).toBe(false);
    expect(cellText("overheadPct", open)).toBe("12");
  });
});

describe("IZN-F4.2 · toplam kartı: maskeli (null) girdi → türev '—' (sıfır sayılmaz)", () => {
  const totals = (internal: Partial<typeof MASKED.totals.internal>) => ({
    ...MASKED.totals,
    internal: { ...MASKED.totals.internal, ...internal },
  });

  it("kâr % null → '—', %0 DEĞİL", () => {
    render(<OfferTotalsCard totals={totals({ profit_pct: null, profit: null })} vatPct="20.00" />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Kâr——");
    expect(text).not.toContain("%0");
  });

  it("GG % hesabında maliyet ya da GG null → '—'", () => {
    render(<OfferTotalsCard totals={totals({ cost: null, overhead: null })} vatPct="20.00" />);
    expect(document.body.textContent).toContain("Genel gider——");
  });
});

describe("IZN-F4.2 · OfferRateFields maskeli alan", () => {
  it("salt okunur '—' + kilit ipucu (kategori gizliyse)", () => {
    const values = { ...detailFormValuesFromServer(DETAIL, MASKED) };
    render(<OfferRateFields values={values} errors={{}} onChange={() => {}} masked={maskedRatesOf(MASKED)} isHiddenHintShown />);
    expect(screen.getByLabelText("Genel gider")).toHaveValue("—");
    expect(screen.getByLabelText("Genel gider")).toBeDisabled();
    expect(screen.getAllByText("Bu bilgi rolünüz için gizli")).toHaveLength(2); // iki maskeli alan, her birinde bir ipucu
    expect(screen.getByLabelText("KDV")).toBeEnabled();
  });

  it("kategori gizli değilse '—' var ama ipucu YOK", () => {
    const values = { ...detailFormValuesFromServer(DETAIL, MASKED) };
    render(<OfferRateFields values={values} errors={{}} onChange={() => {}} masked={maskedRatesOf(MASKED)} isHiddenHintShown={false} />);
    expect(screen.getByLabelText("Kâr")).toHaveValue("—");
    expect(screen.queryByText("Bu bilgi rolünüz için gizli")).not.toBeInTheDocument();
  });
});

describe("IZN-F4.2 · LastPriceCell price null", () => {
  const LAST = { price: null, at: "2026-09-01T10:00:00Z", source: "SZL", doc_no: "P-1", doc_id: null } as never;
  function session(hidden: readonly ("sozlesme_fiyat" | "tum_tutarlar")[]) {
    vi.mocked(useSession).mockReturnValue({ me: meFixture({ hiddenFields: hidden }), isLoading: false } as ReturnType<typeof useSession>);
  }

  it("kategori gizli: '—' + kilit ipucu; kaynak satırı kalır", () => {
    session(["sozlesme_fiyat"]);
    render(<LastPriceCell lastPrice={LAST} refPrice={null} />);
    expect(screen.getByTestId("hidden-mark")).toBeInTheDocument();
    expect(screen.getByText(/Sözleşme · P-1/)).toBeInTheDocument();
  });

  it("kategori gizli değil: '—' ama kilit YOK", () => {
    session([]);
    render(<LastPriceCell lastPrice={LAST} refPrice={null} />);
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
