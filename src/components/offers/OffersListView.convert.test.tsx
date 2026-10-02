import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OffersListView, type OffersListViewProps } from "./OffersListView";
import { OFFER_SENT, OFFER_WON, makeOffer, makeResponse, makeSummary } from "./offer-fixtures";

vi.mock("@/lib/api/offer-export-client", () => ({ downloadOfferExport: vi.fn() }));

// TKL-F5.5 · liste: dönüştürülmüş satır "Proje: … →", dönüştürülmemiş kazanılmış satır uyarısı, kart süzgeci.

const NOW = new Date("2026-10-01T21:30:00Z");
const PROJECT = { id: "p-1", code: "PRJ-2026-004", name: "Güneşkent Konut", slug: "guneskent-konut" };

const CONVERTED = makeOffer({
  ...OFFER_WON,
  id: "offer-11",
  offer_no: "TKL-2026-0011",
  scope_summary: "Anahtar teslim · 48 daire",
  conversion_state: "converted",
  project_id: PROJECT.id,
  project: PROJECT,
});
const PENDING = makeOffer({
  ...OFFER_WON,
  id: "offer-08",
  offer_no: "TKL-2026-0008",
  scope_summary: "Kaba + ince · 2 blok",
  conversion_state: "won_not_converted",
});

function renderView(overrides: Partial<OffersListViewProps> = {}, wonNotConverted = 1) {
  const props: OffersListViewProps = {
    body: { kind: "ready", data: makeResponse([OFFER_SENT, CONVERTED, PENDING], { summary: makeSummary({ won_not_converted_count: wonNotConverted }) }) },
    status: null,
    employerId: null,
    searchText: "",
    dateFrom: "",
    dateTo: "",
    onDateFromChange: vi.fn(),
    onDateToChange: vi.fn(),
    onStatusChange: vi.fn(),
    onEmployerChange: vi.fn(),
    onSearchTextChange: vi.fn(),
    onClear: vi.fn(),
    employers: [],
    catalogCount: null,
    canWrite: true,
    readOnlyText: "",
    now: NOW,
    busyOfferId: null,
    onNewRevision: vi.fn(),
    onDelete: vi.fn(),
    toast: null,
    actionError: null,
    onConversionChange: vi.fn(),
    ...overrides,
  };
  render(<OffersListView {...props} />);
  return props;
}

const row = (offerNo: string) => screen.getByTestId(`offers-row-${offerNo}`);

describe("satır · dönüştürülmüş (TL:145-146)", () => {
  it("'Proje: {ad} →' proje rotasına gider ve kapsam özetinin YERİNE basılır", () => {
    renderView();
    const link = within(row("TKL-2026-0011")).getByRole("link", { name: "Proje: Güneşkent Konut →" });
    expect(link).toHaveAttribute("href", "/projeler/guneskent-konut");
    expect(within(row("TKL-2026-0011")).queryByText("Anahtar teslim · 48 daire")).not.toBeInTheDocument();
    expect(within(row("TKL-2026-0011")).queryByText("Kazanıldı · dönüştürülmedi")).not.toBeInTheDocument();
  });

  it("slug yoksa proje kimliğiyle bağlanır", () => {
    renderView({
      body: { kind: "ready", data: makeResponse([makeOffer({ ...CONVERTED, project: { ...PROJECT, slug: null } })]) },
    });
    expect(screen.getByRole("link", { name: "Proje: Güneşkent Konut →" })).toHaveAttribute("href", "/projeler/p-1");
  });
});

describe("satır · kazanıldı, dönüştürülmedi (ÜS-F5-5)", () => {
  it("kapsam özeti KALIR + amber 'Kazanıldı · dönüştürülmedi'; yetkisize 'Dönüştür →' YOK", () => {
    renderView();
    expect(within(row("TKL-2026-0008")).getByText("Kaba + ince · 2 blok")).toBeInTheDocument();
    expect(within(row("TKL-2026-0008")).getByText("Kazanıldı · dönüştürülmedi")).toBeInTheDocument();
    expect(within(row("TKL-2026-0008")).queryByRole("link", { name: "Dönüştür →" })).not.toBeInTheDocument();
  });

  it("yetkiliye 'Dönüştür →' Dönüştür ekranına gider", () => {
    renderView({ canConvert: true });
    expect(within(row("TKL-2026-0008")).getByRole("link", { name: "Dönüştür →" })).toHaveAttribute(
      "href",
      "/teklif-hazirlama/offer-08/donustur",
    );
  });

  it("diğer durumdaki satırda (gönderildi) ne rozet ne bağlantı", () => {
    renderView({ canConvert: true });
    expect(within(row(OFFER_SENT.offer_no)).queryByText(/dönüştürülmedi|Dönüştür/)).not.toBeInTheDocument();
  });
});

describe("Kazanıldı kartı · 'N dönüştürülmedi' süzgeci (ÜS-F5-6)", () => {
  it("sayaç > 0 → düğme; tıklama conversion=won_not_converted süzgecini açar", async () => {
    const props = renderView({}, 2);
    await userEvent.click(screen.getByRole("button", { name: "2 dönüştürülmedi" }));
    expect(props.onConversionChange).toHaveBeenCalledWith("won_not_converted");
  });

  it("süzgeç açıkken düğme basılı; tekrar tıklama süzgeci KAPATIR", async () => {
    const props = renderView({ conversion: "won_not_converted" }, 2);
    const button = screen.getByRole("button", { name: "2 dönüştürülmedi" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);
    expect(props.onConversionChange).toHaveBeenCalledWith(null);
  });

  it("sayaç 0 → düğme yok", () => {
    renderView({}, 0);
    expect(screen.queryByTestId("offers-card-convert")).not.toBeInTheDocument();
  });

  it("süzgeç açıkken 'süzgeci temizle' görünür (boş sonuçta takılı kalınmaz)", () => {
    renderView({ conversion: "won_not_converted", body: { kind: "ready", data: makeResponse([]) } }, 0);
    expect(screen.getAllByRole("button", { name: "Filtreleri temizle" }).length).toBeGreaterThan(0);
  });
});
