import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import SiteDetailPage from "./page";
import { useSite } from "@/lib/api/hooks/useSites";
import { BackendError } from "@/lib/api/unwrap";
import type { SiteDetail } from "@/lib/api/hooks/useSites";
import { SITE_CONTRACT_DEFAULTS } from "@/lib/api/hooks/site-fixtures";

vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const SITE_ID = "44444444-4444-4444-4444-444444444444";

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: PROJECT_ID, siteId: SITE_ID }),
  usePathname: () => `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}`,
}));

const SITE: SiteDetail = {
  ...SITE_CONTRACT_DEFAULTS,
  id: SITE_ID,
  code: "A-BLOK",
  name: "A-Blok Şantiyesi",
  status: "active",
  address: "Kuyubaşı Mah.",
  city: "Ankara",
  city_inherited: false,
  site_manager_name: "Sercan Öztürk",
  start_date: "2025-03-01",
  end_date: "2026-12-31",
  delivery_date: null,
  remaining_days: 157,
  section_count: 5,
  worker_count: { available: false, count: null, pending_module: "timesheet" },
  progress_pct: { available: false, value: null, pending_module: "progress_payments" },
  project: {
    id: PROJECT_ID,
    name: "Güneşkent Konut",
    city: "Ankara",
    employer_name: "Güneşkent Gayrimenkul A.Ş.",
  },
  section_status_counts: { planned: 2, active: 1, completed: 2 },
  sections: [],
  total_progress_payment: { available: false, value: null, pending_module: "progress_payments" },
  contract_amount: { available: false, value: null, pending_module: "contracts" },
};

function mockQuery(value: Partial<ReturnType<typeof useSite>>) {
  vi.mocked(useSite).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...value,
  } as never);
}

// Sayfa `useSite` disinda ag cagrisi yapmaz ama diger sayfalar QueryClientProvider
// bekler (tutarlilik icin ayni sarmalayici korunur).
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SiteDetailPage />
    </QueryClientProvider>,
  );
}

describe("SiteDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("yuklenirken mesaj basar", () => {
    mockQuery({ isLoading: true });
    renderPage();
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
  });

  it("403'te erisim reddi basar", () => {
    mockQuery({ isError: true, error: new BackendError(403, { detail: "yasak" }) });
    renderPage();
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("diger hatalarda mesaj basar", () => {
    mockQuery({ isError: true, error: new Error("patladi") });
    renderPage();
    expect(screen.getByText("Şantiye yüklenemedi")).toBeInTheDocument();
  });

  it("basariyla hero + sekme barini basar", () => {
    mockQuery({ data: SITE });
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "A-Blok Şantiyesi" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Şantiye detay sekmeleri" })).toBeInTheDocument();
  });

  it("bolumsuz santiyede durust bos durum basar (spec §7.4)", () => {
    mockQuery({ data: { ...SITE, section_count: 0 } });
    renderPage();
    const message = screen.getByText("Bu şantiyede henüz bölüm tanımlanmadı.");
    expect(message).toBeInTheDocument();
    const emptyStateLink = within(message.parentElement as HTMLElement).getByRole("link", {
      name: "+ Bölüm Ekle",
    });
    expect(emptyStateLink).toHaveAttribute(
      "href",
      `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/bolumler/yeni`,
    );
  });

  it("bolumlu santiyede bos durum metnini basmaz, kart listesini basar", () => {
    const site: SiteDetail = {
      ...SITE,
      section_count: 1,
      sections: [
        {
          id: "66666666-6666-6666-6666-666666666666",
          code: null,
          name: "Temel & Bodrum Katlar",
          status: "completed",
          manager_name: "M. Arslan",
          start_date: "2025-04-01",
          end_date: "2025-07-01",
          sort_order: 0,
          depends_on_section_id: null,
          milestones: [],
          progress_pct: { available: false, value: null, pending_module: "progress_payments" },
          boq_item_count: { available: true, count: 14, pending_module: "boq" },
          budget: { available: true, value: "1840000.00", pending_module: null },
          worker_count: { available: false, count: null, pending_module: "timesheet" },
          planned_worker_count: 22,
        },
      ],
    };
    mockQuery({ data: site });
    renderPage();
    expect(screen.queryByText("Bu şantiyede henüz bölüm tanımlanmadı.")).not.toBeInTheDocument();
    expect(screen.getByText("A-Blok Bölümleri (1)")).toBeInTheDocument();
    expect(screen.getByText("Temel & Bodrum Katlar")).toBeInTheDocument();
  });

  it("hero'daki + Bolum Ekle tam sayfa forma link verir (F-P6 T3, SectionFormModal emekli)", () => {
    mockQuery({ data: SITE });
    renderPage();
    const addSection = screen.getByRole("link", { name: "+ Bölüm Ekle" });
    expect(addSection).toHaveAttribute(
      "href",
      `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/bolumler/yeni`,
    );
  });
});
