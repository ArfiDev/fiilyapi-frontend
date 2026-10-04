import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  SubcontractorContractDetailView,
  TAX_NUMBER_NO_SUBCONTRACTOR_REASON,
  TAX_NUMBER_UNRESOLVED_REASON,
  PROGRESS_PENDING_REASON,
  CUMULATIVE_PENDING_REASON,
} from "./SubcontractorContractDetailView";
import {
  useSubcontractorContract,
  type SubcontractorContractDetail,
  type SubcontractorProgressPaymentListItem,
} from "@/lib/api/hooks/useSubcontractorProgressPayments";
import {
  useSubcontractorContractPayments,
  useSubcontractorPaymentLines,
} from "@/lib/api/hooks/useSubcontractorContractPayments";
import {
  useCreateSubcontractorContractItem,
  useUpdateSubcontractorContract,
  useUpdateSubcontractorContractItem,
} from "@/lib/api/hooks/useSubcontractorContractMutations";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { useEmployerContract } from "@/lib/api/hooks/useContract";
import { useProject } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";

vi.mock("@/lib/api/hooks/useSubcontractorProgressPayments", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/api/hooks/useSubcontractorProgressPayments")
  >()),
  useSubcontractorContract: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSubcontractorContractPayments", () => ({
  useSubcontractorContractPayments: vi.fn(),
  useSubcontractorPaymentLines: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSubcontractorContractMutations", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/api/hooks/useSubcontractorContractMutations")
  >()),
  useCreateSubcontractorContractItem: vi.fn(),
  useUpdateSubcontractorContract: vi.fn(),
  useUpdateSubcontractorContractItem: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSubcontractors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSubcontractors")>()),
  useSubcontractors: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useContract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useContract")>()),
  useEmployerContract: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProject: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSites: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/sozlesmeler/taseron/sc-1",
  useSearchParams: () => new URLSearchParams(),
}));

const CONTRACT_ID = "sc-1";
const SUBCONTRACTOR_ID = "sub-1";

const DETAIL: SubcontractorContractDetail = {
  id: CONTRACT_ID,
  project_id: "p-1",
  site_id: "s-1",
  subcontractor_id: SUBCONTRACTOR_ID,
  subcontractor_name: "Akın İnşaat Ltd. Şti.",
  work_category: "Betonarme",
  contract_no: "TSZ-2025-001",
  signature_date: "2025-04-01",
  is_notarized: true,
  start_date: "2025-04-01",
  end_date: "2026-12-31",
  late_penalty_daily: "5000.00",
  advance_pct: "10.00",
  retainage_pct: "5.00",
  vat_pct: "20.00",
  payment_period: "monthly",
  payment_term_days: 30,
  materials_by_contractor: false,
  subcontractor_files_own_sgk: true,
  vat_withholding: false,
  status: "active",
  is_draft: false,
  items: [
    {
      id: "sci-1",
      contract_id: CONTRACT_ID,
      source_contract_item_id: null,
      code: "03.001",
      source_code: null,
      description: "Kat Döşemesi Betonu C25/30",
      unit: "m³",
      quantity: "1200.000",
      unit_price: "1200.00",
      sort_order: 0,
      group: { id: "g-1", name: "A — Betonarme İşleri" },
      line_total: "1440000.00",
    },
    {
      id: "sci-2",
      contract_id: CONTRACT_ID,
      source_contract_item_id: null,
      code: "03.002",
      source_code: null,
      description: "Kolon Betonu C30/37",
      unit: "m³",
      quantity: "340.000",
      unit_price: null,
      sort_order: 1,
      group: { id: "g-1", name: "A — Betonarme İşleri" },
      line_total: "0.00",
    },
  ],
  // 🛑 tfoot TEK KAYNAK — mockup başlığındaki ₺4.820.000 ile BİLEREK farklı.
  contract_total: "3281500.00",
  items_missing_price: 1,
  progress_payment_summary: null,
  documents: null,
  pending_modules: [],
};

const PAYMENT: SubcontractorProgressPaymentListItem = {
  id: "scpp-1",
  contract_id: CONTRACT_ID,
  project_id: "p-1",
  project_name: "Güneşkent Konut",
  subcontractor_name: "Akın İnşaat Ltd. Şti.",
  contract_no: "TSZ-2025-001",
  work_category: "Betonarme",
  sequence_no: 47,
  period_year: 2026,
  period_month: 7,
  description: null,
  status: "pending_approval",
  section_id: null,
  contract_site_id: null,
  created_at: "2026-07-01T00:00:00Z",
  gross_total: "1240000.00",
  net_total: "1016800.00",
  is_revision_required: false,
};

const updateContractMutate = vi.fn();
const updateItemMutate = vi.fn();
const createItemMutateAsync = vi.fn();

interface Overrides {
  detail?: SubcontractorContractDetail | undefined;
  taxNumber?: string | null;
  subcontractors?: { id: string; tax_number: string | null }[];
  paymentsPartial?: boolean;
  linesPending?: boolean;
  lines?: { contract_item_id: string | null; quantity: string }[];
}

function setup(overrides: Overrides = {}) {
  const detail = "detail" in overrides ? overrides.detail : DETAIL;

  vi.mocked(useSubcontractorContract).mockReturnValue({
    data: detail,
    isError: false,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useSubcontractorContract>);

  const isPartial = overrides.paymentsPartial ?? false;
  vi.mocked(useSubcontractorContractPayments).mockReturnValue({
    items: [PAYMENT],
    isLoading: false,
    isError: false,
    isPartial,
    truncation: isPartial
      ? { isTruncated: true, shownCount: 200, totalCount: 260 }
      : { isTruncated: false, shownCount: 1, totalCount: 1 },
    cumulativeGross: isPartial ? null : "1240000.00",
  });

  vi.mocked(useSubcontractorPaymentLines).mockReturnValue({
    isPending: overrides.linesPending ?? isPartial,
    lines: (overrides.lines ?? [{ contract_item_id: "sci-1", quantity: "900.000" }]).map(
      (line, index) =>
        ({
          id: `l-${index}`,
          contract_item_id: line.contract_item_id,
          code: "03.001",
          description: "x",
          unit: "m³",
          contract_unit_price: "1200.00",
          coefficient: "1.00",
          quantity: line.quantity,
          group_name: null,
          sort_order: index,
          quantity_source: "manual",
          adjusted_unit_price: "1200.00",
          line_total: "0.00",
        }) as never,
    ),
  });

  vi.mocked(useSubcontractors).mockReturnValue({
    data: {
      items: (
        overrides.subcontractors ?? [{ id: SUBCONTRACTOR_ID, tax_number: "1234567890" }]
      ).map((item) => ({
        id: item.id,
        name: "Akın İnşaat Ltd. Şti.",
        tax_number: item.tax_number,
        contact_person: null,
        phone: null,
        email: null,
        category: null,
        is_active: true,
      })),
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useSubcontractors>);

  vi.mocked(useEmployerContract).mockReturnValue({
    data: { contract_no: "SZL-2025-001", employer_name: "Güneşkent Gayrimenkul A.Ş." },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useEmployerContract>);

  vi.mocked(useProject).mockReturnValue({
    data: { name: "Güneşkent Konut" },
  } as unknown as ReturnType<typeof useProject>);

  vi.mocked(useSites).mockReturnValue({
    data: { items: [{ id: "s-1", name: "A-Blok Şantiyesi" }] },
  } as unknown as ReturnType<typeof useSites>);

  vi.mocked(useUpdateSubcontractorContract).mockReturnValue({
    mutate: updateContractMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateSubcontractorContract>);

  vi.mocked(useUpdateSubcontractorContractItem).mockReturnValue({
    mutate: updateItemMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateSubcontractorContractItem>);

  // Diyalog (F-BLG T2a) gerçek `useMutation` çağırır; bu dosyada
  // QueryClientProvider yoktur, bu yüzden ekleme hook'u da sahtelenir.
  vi.mocked(useCreateSubcontractorContractItem).mockReturnValue({
    mutateAsync: createItemMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateSubcontractorContractItem>);

  return render(<SubcontractorContractDetailView contractId={CONTRACT_ID} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TSD — başlık kartı ve VKN çözümü (mockup 41)", () => {
  it("VKN `GET /subcontractors` LİSTESİNDEN süzülerek çözülür", () => {
    setup();
    expect(screen.getByTestId("tsd-tax-number")).toHaveTextContent("1234567890");
    expect(screen.queryByTestId("tsd-tax-number-pending")).not.toBeInTheDocument();
  });

  it("firma listede yoksa '—' + görünür gerekçe basılır (sessiz boşluk YASAK)", () => {
    setup({ subcontractors: [{ id: "sub-99", tax_number: "9" }] });
    const pending = screen.getByTestId("tsd-tax-number-pending");
    expect(pending).toHaveTextContent("—");
    expect(pending).toHaveAttribute("title", TAX_NUMBER_UNRESOLVED_REASON);
  });

  it("sözleşmede taşeron seçili değilse gerekçe FARKLIDIR", () => {
    setup({
      detail: { ...DETAIL, subcontractor_id: null },
    });
    expect(screen.getByTestId("tsd-tax-number-pending")).toHaveAttribute(
      "title",
      TAX_NUMBER_NO_SUBCONTRACTOR_REASON,
    );
  });

  it("bağlantı zinciri dört halkayı çalışan linklerle basar (47-68)", () => {
    setup();
    const chain = screen.getByTestId("tsd-chain");
    expect(within(chain).getByRole("link", { name: "SZL-2025-001" })).toHaveAttribute(
      "href",
      "/sozlesmeler/isveren/p-1",
    );
    expect(within(chain).getByRole("link", { name: "Güneşkent Konut" })).toHaveAttribute(
      "href",
      "/projeler/p-1",
    );
    expect(within(chain).getByRole("link", { name: "A-Blok Şantiyesi" })).toHaveAttribute(
      "href",
      "/projeler/p-1/santiyeler/s-1",
    );
    expect(chain).toHaveTextContent("TSZ-2025-001 Akın İnşaat Ltd. Şti.");
  });
});

describe("TSD — tfoot TEK KAYNAK `contract_total` (K5 emsali)", () => {
  it("tfoot `contract_total`dan basılır; mockup başlığındaki ₺4.820.000 KOPYALANMAZ", () => {
    setup();
    const total = screen.getByTestId("tsd-items-total");
    // 3.281.500 = şemanın türev toplamı (mockup 177) — 4.820.000 DEĞİL (mockup 73).
    expect(total.textContent?.replace(/\s/g, "")).toContain("3.281.500");
    expect(total).not.toHaveTextContent("4.820.000");
  });

  it("başlıktaki 'Toplam Sözleşme Bedeli' metriği de AYNI kaynaktan gelir", () => {
    setup();
    expect(
      screen.getByTestId("tsd-contract-total").textContent?.replace(/\s/g, ""),
    ).toContain("3.281.500");
  });
});

describe("TSD — poz tablosu (88-182)", () => {
  it("YALNIZ Taşeron B.F. yazılabilir; miktar SALT-OKUNUR düz metindir (114)", () => {
    setup();
    // no 51 · hücre `type="number"` DEĞİLDİR (Türkçe virgülü tarayıcı
    // sessizce siler) — `inputMode="decimal"` ile rolü "textbox"tur.
    const inputs = within(screen.getByTestId("tsd-items")).getAllByRole("textbox");
    expect(inputs).toHaveLength(DETAIL.items.length);
    for (const input of inputs) {
      expect(input).toHaveAttribute("aria-label", expect.stringContaining("taşeron birim fiyatı"));
    }
    // Sözleşme miktarı metin olarak basılır, girdi olarak DEĞİL.
    expect(screen.getByText("1.200")).toBeInTheDocument();
  });

  it("boşaltılan B.F. `unit_price: null` gider ve mutate `{itemId, body}` şeklindedir", async () => {
    const user = userEvent.setup();
    setup();
    const input = screen.getByLabelText("03.001 taşeron birim fiyatı");
    await user.clear(input);
    await user.tab();

    expect(updateItemMutate).toHaveBeenCalledTimes(1);
    expect(updateItemMutate.mock.calls[0][0]).toEqual({
      itemId: "sci-1",
      body: { unit_price: null },
    });
  });

  // TKL-F7a ek iş · T42 — hücre T30 okur; gövdeye nokta-ondalık METİN gider.
  it("B.F. '1.234,5' → mutate gövdesi unit_price \"1234.50\"; '28.5' belirsiz → istek YOK", async () => {
    const user = userEvent.setup();
    setup();
    const input = screen.getByLabelText("03.001 taşeron birim fiyatı");
    await user.clear(input);
    await user.type(input, "1.234,5");
    await user.tab();
    expect(updateItemMutate.mock.calls[0][0]).toEqual({
      itemId: "sci-1",
      body: { unit_price: "1234.50" },
    });

    updateItemMutate.mockClear();
    await user.clear(input);
    await user.type(input, "28.5");
    await user.tab();
    expect(updateItemMutate).not.toHaveBeenCalled();
  });

  it("değişmeyen hücrede istek ATILMAZ", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByLabelText("03.001 taşeron birim fiyatı"));
    await user.tab();
    expect(updateItemMutate).not.toHaveBeenCalled();
  });
});

describe("TSD — Hakediş % kolonu (103, 117-120)", () => {
  it("hakediş verisinden TÜREVdir (900/1200 = %75)", () => {
    setup();
    expect(screen.getByTestId("tsd-progress-03.001")).toHaveTextContent("%75");
  });

  it("liste kırpılırsa kolon PENDING'e düşer — yanlış yüzde SESSİZCE basılmaz", () => {
    setup({ paymentsPartial: true });
    const cell = screen.getByTestId("tsd-progress-03.001");
    expect(cell).toHaveTextContent("—");
    expect(cell).not.toHaveTextContent("%");
    expect(within(cell).getByTitle(PROGRESS_PENDING_REASON)).toBeInTheDocument();
  });

  it("kırpılmada 'Ödenen Hakediş' metriği de PENDING'e düşer", () => {
    setup({ paymentsPartial: true });
    expect(screen.getByTestId("tsd-cumulative-gross-pending")).toHaveAttribute(
      "title",
      CUMULATIVE_PENDING_REASON,
    );
    expect(screen.queryByTestId("tsd-cumulative-gross")).not.toBeInTheDocument();
  });
});

describe("TSD — Sözleşme Şartları (§7 S3 taşeron ayağı)", () => {
  it("Kaydet gövdesi YALNIZ şart alanlarını taşır — bağlam alanlarına dokunmaz", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId("tsd-terms-save"));

    expect(updateContractMutate).toHaveBeenCalledTimes(1);
    const body = updateContractMutate.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        "advance_pct",
        "contract_no",
        "end_date",
        "is_notarized",
        "late_penalty_daily",
        "materials_by_contractor",
        "payment_period",
        "payment_term_days",
        "retainage_pct",
        "signature_date",
        "start_date",
        "subcontractor_files_own_sgk",
        "vat_withholding",
      ].sort(),
    );
    // Bağlam ve KDV alanları GÖVDEDE YOKTUR.
    for (const forbidden of ["site_id", "subcontractor_id", "work_category", "vat_pct", "status"]) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  // kalan-6 no 320 — `handleSaveTerms` `validateContractForm`/`intOrUndefined`
  // hiçbirini çağırmıyordu: "30.5" gibi ondalık bir vade PATCH'e ondalık
  // olarak gidiyordu (backend 422). Kaydet ondalık vadede İSTEK AÇMAMALI.
  it("Ödeme Vadesi ondalık girilince Kaydet PATCH AÇMAZ, alan hatası basar", async () => {
    const user = userEvent.setup();
    setup();
    const termDays = screen.getByLabelText(/Ödeme Vadesi/);
    await user.clear(termDays);
    await user.type(termDays, "30.5");
    await user.click(screen.getByTestId("tsd-terms-save"));

    expect(updateContractMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/tam sayı olmalıdır/)).toBeInTheDocument();
  });

  it("`vat_pct` SALT-OKUNUR gösterilir (FSO'da kontrolü yok — E14 emsali)", () => {
    setup();
    expect(screen.getByTestId("tsd-vat-readonly")).toHaveTextContent("%20");
  });

  it("kullanıcı bir şartı değiştirince gövde yeni değeri taşır", async () => {
    const user = userEvent.setup();
    setup();
    const contractNo = screen.getByLabelText(/Sözleşme No/);
    await user.clear(contractNo);
    await user.type(contractNo, "TSZ-2026-009");
    await user.click(screen.getByTestId("tsd-terms-save"));

    await waitFor(() => expect(updateContractMutate).toHaveBeenCalled());
    expect(updateContractMutate.mock.calls[0][0]).toMatchObject({
      contract_no: "TSZ-2026-009",
    });
  });

  // no 53 — kaydedilmiş bir şart daha sonra değiştirildiğinde "Sözleşme
  // şartları kaydedildi." bandı ekranda ASILI kalıyordu; `onChange` geri
  // çağırması `setTermsSaved(false)` çağırmıyordu (emsal:
  // `ContractDistributionView.tsx::handleCellChange`).
  it("kaydedilmiş banner, şart TEKRAR değiştirilince kaybolur (no 53)", async () => {
    const user = userEvent.setup();
    updateContractMutate.mockImplementation(
      (_body: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
    );
    setup();

    await user.click(screen.getByTestId("tsd-terms-save"));
    expect(await screen.findByTestId("tsd-terms-saved")).toBeInTheDocument();

    const contractNo = screen.getByLabelText(/Sözleşme No/);
    await user.type(contractNo, "X");

    expect(screen.queryByTestId("tsd-terms-saved")).not.toBeInTheDocument();
  });
});

describe("TSD — hakediş geçmişi ve oluşturma bağlantıları", () => {
  it("'+ Hakediş Oluştur' sözleşmeyi ÖNSEÇER (`?contract=`)", () => {
    setup();
    expect(screen.getByRole("link", { name: "+ Hakediş Oluştur" })).toHaveAttribute(
      "href",
      `/hakedisler/taseron/yeni?contract=${CONTRACT_ID}`,
    );
  });

  it("'+ Yeni Hakediş →' AYNI önseçim parametresini kullanır (188)", () => {
    setup();
    expect(screen.getByRole("link", { name: "+ Yeni Hakediş →" })).toHaveAttribute(
      "href",
      `/hakedisler/taseron/yeni?contract=${CONTRACT_ID}`,
    );
  });

  it("geçmiş satırı dönem/tutar/durum + Detay linki basar (199)", () => {
    setup();
    expect(screen.getByText("#47")).toBeInTheDocument();
    expect(screen.getByText("Tem 2026")).toBeInTheDocument();
    expect(screen.getByText("Onay Bekliyor")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Detay" })).toHaveAttribute(
      "href",
      "/hakedisler/taseron/scpp-1",
    );
  });

  it("liste kırpıldıysa GÖRÜNÜR sınır bandı basılır", () => {
    setup({ paymentsPartial: true });
    expect(screen.getByTestId("tsd-payments-limit-note")).toHaveTextContent("liste eksik");
  });
});

describe("TSD — devre-dışı yüzeyler SİLİNMEZ", () => {
  it("PDF butonu yerinde durur, devre dışıdır ve gerekçesi GÖRÜNÜRDÜR (24)", () => {
    setup();
    const pdf = screen.getByTestId("tsd-pdf-disabled");
    expect(pdf).toBeDisabled();
    expect(screen.getByText(/Dışa aktarma ucu henüz açılmadı\./)).toBeInTheDocument();
  });

  it("'+ Poz Ekle' ARTIK AKTİF: form mockup'ı geldi, diyalogu açar (92)", () => {
    setup();
    const add = screen.getByTestId("tsd-add-item");
    expect(add).toBeEnabled();
    fireEvent.click(add);
    expect(screen.getByRole("dialog", { name: "Taşeron Sözleşmesine Poz Ekle" })).toBeInTheDocument();
  });
});

describe("KAT-F2.3 · TSD poz tablosu · Bakanlık poz no alt satırı (T47)", () => {
  it("kodu olan kalemde poz no hücresinin altında kod + title; null'da yok", () => {
    setup({
      detail: {
        ...DETAIL,
        items: [{ ...DETAIL.items[0], source_code: "15.250.1011" }, DETAIL.items[1]],
      },
    });

    const sub = screen.getByTestId("ecd-source-code-sci-1");
    expect(sub).toHaveTextContent("15.250.1011");
    expect(sub).toHaveAttribute("title", "15.250.1011");
    expect(sub.closest("td")).toHaveClass("ecd-items__td--code");
    expect(screen.queryByTestId("ecd-source-code-sci-2")).not.toBeInTheDocument();
  });
});
