import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SectionDetailView } from "./SectionDetailView";
import { useSection } from "@/lib/api/hooks/useSection";
import { useSite } from "@/lib/api/hooks/useSites";
import { useBoq } from "@/lib/api/hooks/useBoq";
import { useSession } from "@/components/shell/SessionProvider";
import { useTimesheetData } from "@/components/timesheet/useTimesheetData";
import { buildTimesheetView } from "@/components/timesheet/derive";
import {
  useSiteDiaryEntries,
  SITE_DIARY_LIST_MAX_LIMIT,
  type SiteDiaryEntryListResponse,
} from "@/lib/api/hooks/useSiteDiary";
import { useSiteSubcontractorPayments } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import type { SiteSubcontractorPaymentItem } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import { sectionNav } from "./section-nav.testkit";
import { ALL_PAGE_KEYS, pagesFor } from "@/lib/auth/page-grants.testkit";

// F-BLMSEK T2 · Bölüm Detay › "Hakediş" sekmesinin EKRAN BAĞLANTISI.
// AYRI dosyadır: `SectionDetailView.test.tsx` 770 satırla 800 tavanındadır.
// Buradaki iddialar panelin İÇ mantığını değil, EKRANIN panele ne verdiğini
// (bölüm kimliği · bölüm adı · süzgeçsiz tek çağrı) bekçiler.

vi.mock("@/lib/api/hooks/useSection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSection")>()),
  useSection: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useBoq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBoq")>()),
  useBoq: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSiteDiary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSiteDiary")>()),
  useSiteDiaryEntries: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSiteSubcontractorPayments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSiteSubcontractorPayments")>()),
  useSiteSubcontractorPayments: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/components/timesheet/useTimesheetData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/timesheet/useTimesheetData")>()),
  useTimesheetData: vi.fn(),
}));

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const SITE_ID = "44444444-4444-4444-4444-444444444444";
const SECTION_ID = "55555555-5555-5555-5555-555555555555";
const OTHER_SECTION_ID = "66666666-6666-6666-6666-666666666666";
const SECTION_NAME = "Kat 6–10 Kaba İnşaat";

// DET-1.2 · S4 — sekme `?sekme=` URL parametresidir; durumlu ikiz `replace`i uygular.
vi.mock("next/navigation", async () =>
  (await import("./section-nav.testkit")).sectionNavModule(() => ({
    projectId: PROJECT_ID,
    siteId: SITE_ID,
    sectionId: SECTION_ID,
  })),
);
beforeEach(() => sectionNav.reset());

function payment(overrides: Partial<SiteSubcontractorPaymentItem> = {}): SiteSubcontractorPaymentItem {
  return {
    id: "pp-1",
    contractId: "c-1",
    subcontractorName: "Akın İnşaat",
    sequenceNo: 3,
    periodYear: 2026,
    periodMonth: 7,
    workCategory: "Betonarme İşleri",
    sectionId: SECTION_ID,
    grossTotal: "182400.00",
    netTotal: "160000.00",
    status: "approved",
    isRevisionRequired: false,
    ...overrides,
  } as SiteSubcontractorPaymentItem;
}

function mockAll(items: SiteSubcontractorPaymentItem[], partial = false) {
  vi.mocked(useSession).mockReturnValue({
    me: {
      id: "u1",
      email: "a@b.c",
      full_name: "A",
      role_key: "admin",
      status: "active",
      pages: pagesFor(ALL_PAGE_KEYS, "view"),
    },
    isLoading: false,
  } as never);
  vi.mocked(useSection).mockReturnValue({
    data: {
      id: SECTION_ID,
      code: "A-01",
      name: SECTION_NAME,
      status: "active",
      site_id: SITE_ID,
      milestones: [],
      manager_name: null,
      start_date: null,
      end_date: null,
      progress_pct: { available: false, value: null, pending_module: "boq" },
      boq_item_count: { available: false, count: null, pending_module: "boq" },
      budget: { available: false, value: null, pending_module: "boq" },
      worker_count: { available: false, count: null, pending_module: "timesheet" },
    },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useSite).mockReturnValue({
    data: {
      id: SITE_ID,
      name: "A-Blok Şantiyesi",
      project: { id: PROJECT_ID },
      sections: [
        { id: SECTION_ID, name: SECTION_NAME },
        { id: OTHER_SECTION_ID, name: "Peyzaj" },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useBoq).mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null } as never);
  vi.mocked(useTimesheetData).mockImplementation((input) => ({
    view: buildTimesheetView({
      year: input.period.year,
      month: input.period.month,
      personnel: [],
      matrix: undefined,
      sectionId: input.sectionId,
    }),
    isLoading: false,
    isError: false,
    isForbidden: false,
    isPersonnelUnavailable: false,
    personnelTruncation: { isTruncated: false, shownCount: 0, totalCount: 0 },
  }));
  vi.mocked(useSiteDiaryEntries).mockReturnValue({
    data: { items: [], total: 0, limit: SITE_DIARY_LIST_MAX_LIMIT, offset: 0 } satisfies SiteDiaryEntryListResponse,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useSiteSubcontractorPayments).mockReturnValue({
    items,
    projectWideItems: [],
    isLoading: false,
    isError: false,
    isPartial: partial,
    truncation: partial
      ? { isTruncated: true, shownCount: 200, totalCount: 431 }
      : { isTruncated: false, shownCount: items.length, totalCount: items.length },
  });
}

async function openPaymentsTab() {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SectionDetailView />
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole("tab", { name: "Hakediş" }));
  return screen.getByRole("tabpanel");
}

describe("SectionDetailView — Hakediş sekmesi (F-BLMSEK T2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sekme artık GERÇEK panel basar, gerekçeli yer tutucu DEĞİL", async () => {
    mockAll([payment()]);
    const panel = await openPaymentsTab();

    expect(within(panel).getByTestId("section-payments")).toBeInTheDocument();
    expect(
      within(panel).queryByText(/Hakediş bu bölüme henüz kırılmıyor/),
    ).not.toBeInTheDocument();
  });

  it("BU bölümün hakedişini basar, BAŞKA bölümünkini basmaz (ekran doğru kimliği geçiriyor)", async () => {
    mockAll([
      payment({ id: "hedef", subcontractorName: "Hedef Taşeron", sequenceNo: 1 }),
      payment({
        id: "baska",
        subcontractorName: "Başka Taşeron",
        sequenceNo: 2,
        sectionId: OTHER_SECTION_ID,
      }),
    ]);
    const panel = await openPaymentsTab();

    expect(within(panel).getByText("Hedef Taşeron #1")).toBeInTheDocument();
    expect(within(panel).queryByText("Başka Taşeron #2")).not.toBeInTheDocument();
    expect(within(panel).getByTestId("section-payments-note")).toHaveTextContent(
      "başka bölüme atanmış 1",
    );
  });

  it("satır bölüm ADINI çözer — ekran `section.name`i GERÇEKTEN geçiriyor", async () => {
    mockAll([payment({ id: "hedef" })]);
    const panel = await openPaymentsTab();

    const row = within(panel).getAllByRole("listitem")[0];
    expect(row).toHaveTextContent(SECTION_NAME);
  });

  it("kapsam satırı ekranda GÖRÜNÜR — işveren hakedişinin dışarıda olduğu söylenir", async () => {
    mockAll([payment()]);
    const panel = await openPaymentsTab();

    expect(within(panel).getByTestId("section-payments-scope")).toHaveTextContent(
      "İşveren hakedişi bölüme kırılmıyor",
    );
  });

  it("kırpılma bandı ekrana kadar TAŞINIR (`isPartial`/`truncation` geçiriliyor)", async () => {
    mockAll([payment()], true);
    const panel = await openPaymentsTab();

    expect(within(panel).getByTestId("section-payments-band")).toHaveTextContent(
      "İlk 200 kayıt gösteriliyor (toplam 431)",
    );
  });

  it("hakediş listesi TEK çağrıyla, bölüm parametresi OLMADAN çekilir", async () => {
    // 🔴 Uç `section_id` sorgu parametresi KABUL ETMEZ (ölçüldü: router 53-66).
    // Ayrıca ikinci bir ağ isteği eklenmez — şantiye Hakedişler ekranıyla AYNI
    // önbellek anahtarı korunur.
    mockAll([payment()]);
    await openPaymentsTab();

    expect(useSiteSubcontractorPayments).toHaveBeenCalledWith(PROJECT_ID, SITE_ID);
  });
});
