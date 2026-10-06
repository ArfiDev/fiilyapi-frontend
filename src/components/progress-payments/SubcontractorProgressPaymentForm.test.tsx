import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SubcontractorProgressPaymentForm } from "./SubcontractorProgressPaymentForm";
import { useSession } from "@/components/shell/SessionProvider";
import {
  useSubcontractorContract,
  useSubcontractorProgressPayment,
} from "@/lib/api/hooks/useSubcontractorProgressPayments";
import {
  useCreateSubcontractorProgressPayment,
  useReplaceSubcontractorProgressPaymentLines,
  useSubmitSubcontractorProgressPayment,
  useUpdateSubcontractorProgressPayment,
} from "@/lib/api/hooks/useSubcontractorProgressPaymentMutations";
import { useProject } from "@/lib/api/hooks/useProjects";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSubcontractorDiarySuggestion } from "@/lib/api/hooks/useDiarySuggestion";
import { BackendError } from "@/lib/api/unwrap";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { SUBCONTRACTOR_PAYMENT_EDIT } from "@/lib/auth/page-gates";
import { levelPages } from "@/lib/auth/legacy-level.testkit";
import { meFixture } from "@/lib/auth/page-grants.testkit";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

vi.mock("@/lib/api/hooks/useSubcontractorProgressPayments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSubcontractorProgressPayments")>()),
  useSubcontractorContract: vi.fn(),
  useSubcontractorProgressPayment: vi.fn(),
}));

vi.mock("@/lib/api/hooks/useSubcontractorProgressPaymentMutations", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/api/hooks/useSubcontractorProgressPaymentMutations")
  >()),
  useCreateSubcontractorProgressPayment: vi.fn(),
  useUpdateSubcontractorProgressPayment: vi.fn(),
  useReplaceSubcontractorProgressPaymentLines: vi.fn(),
  useSubmitSubcontractorProgressPayment: vi.fn(),
}));

vi.mock("@/lib/api/hooks/useDiarySuggestion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useDiarySuggestion")>()),
  useSubcontractorDiarySuggestion: vi.fn(),
}));

vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProject: vi.fn(),
}));

vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));

const CONTRACT_ID = "33333333-3333-3333-3333-333333333333";
const PAYMENT_ID = "22222222-2222-2222-2222-222222222222";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const SITE_ID = "44444444-4444-4444-4444-444444444444";

const ITEM_MANUAL = {
  id: "item-1",
  contract_id: CONTRACT_ID,
  source_contract_item_id: null,
  code: "03.010",
  description: "Döşeme Kalıbı",
  unit: "m²",
  quantity: "0",
  unit_price: "95.00",
  sort_order: 0,
  group: { id: "g-2", name: "B — Kalıp İşleri" },
  line_total: "0",
};
const ITEM_DIARY = {
  id: "item-2",
  contract_id: CONTRACT_ID,
  source_contract_item_id: null,
  code: "03.001",
  description: "Kat Döşemesi Betonu C25/30",
  unit: "m³",
  quantity: "0",
  unit_price: "1200.00",
  sort_order: 1,
  group: { id: "g-1", name: "A — Betonarme İşleri" },
  line_total: "0",
};

function contractFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTRACT_ID,
    project_id: PROJECT_ID,
    site_id: SITE_ID,
    subcontractor_id: "sub-1",
    subcontractor_name: "Akın İnşaat",
    work_category: "Betonarme",
    contract_no: "TSZ-2025-001",
    signature_date: "2026-01-01",
    is_notarized: true,
    start_date: "2026-01-01",
    end_date: null,
    late_penalty_daily: null,
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
    items: [ITEM_MANUAL, ITEM_DIARY],
    contract_total: "0",
    items_missing_price: 0,
    ...overrides,
  };
}

function detailFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: PAYMENT_ID,
    contract_id: CONTRACT_ID,
    project_id: PROJECT_ID,
    project_name: "Güneşkent Konut",
    subcontractor_name: "Akın İnşaat",
    contract_no: "TSZ-2025-001",
    sequence_no: 48,
    period_year: 2026,
    period_month: 7,
    description: null,
    status: "draft",
    vat_pct: "20.00",
    advance_pct: "10.00",
    retainage_pct: "5.00",
    default_coefficient: "1",
    section_id: null,
    submitted_at: null,
    approved_at: null,
    approved_by: null,
    paid_at: null,
    rejected_at: null,
    rejection_reason: null,
    is_revision_required: false,
    created_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    lines: [],
    calculation: { gross: "859400.00", vat: "171880.00", advance_deduction: "85940.00", retention: "42970.00", net: "902370.00" },
    dropped_orphan_count: 0,
    ...overrides,
  };
}

function mockSession(permissions?: Record<string, string>) {
  // IZN-F6a.3 · eski modül seviyesi niyeti sayfa izni olarak kurulur (`undefined` = tam yetkili oturum, SA).
  const level = permissions?.progress_payments;
  const me =
    permissions === undefined
      ? meFixture({ isSystemAdmin: true })
      : meFixture({ pages: levelPages(SUBCONTRACTOR_PAYMENT_EDIT, level), isSystemAdmin: level === "admin" });
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false });
}

function queryResult<T>(value: Partial<{ data: T; isLoading: boolean; isError: boolean; error: unknown }>) {
  return { data: undefined, isLoading: false, isError: false, error: null, ...value } as never;
}

function mutationResult(overrides: Partial<{ mutate: ReturnType<typeof vi.fn>; isPending: boolean }> = {}) {
  return { mutate: vi.fn(), isPending: false, ...overrides } as never;
}

function backendError(status: number, detail: string) {
  return new BackendError(status, { detail });
}

function setupCommonMocks() {
  mockSession({ progress_payments: "draft" });
  vi.mocked(useProject).mockReturnValue(queryResult({ data: { id: PROJECT_ID, name: "Güneşkent Konut Projesi" } }));
  vi.mocked(useSite).mockReturnValue(
    queryResult({
      data: {
        id: SITE_ID,
        name: "A-Blok Şantiyesi",
        sections: [{ id: "sec-1", code: "K6-10", name: "Kat 6–10 Kaba İnşaat", status: "active", manager_name: null, start_date: null, end_date: null, sort_order: 0, progress_pct: null, boq_item_count: null, budget: null, worker_count: null }],
      },
    }),
  );
  vi.mocked(useSubcontractorContract).mockReturnValue(queryResult({ data: contractFixture() }));
  vi.mocked(useSubcontractorProgressPayment).mockReturnValue(queryResult({}));
  vi.mocked(useCreateSubcontractorProgressPayment).mockReturnValue(mutationResult());
  vi.mocked(useUpdateSubcontractorProgressPayment).mockReturnValue(mutationResult());
  vi.mocked(useReplaceSubcontractorProgressPaymentLines).mockReturnValue(mutationResult());
  vi.mocked(useSubmitSubcontractorProgressPayment).mockReturnValue(mutationResult());
  vi.mocked(useSubcontractorDiarySuggestion).mockReturnValue({
    refetch: vi.fn().mockResolvedValue({ data: undefined, error: null }),
  } as never);
}

function renderForm(props: Parameters<typeof SubcontractorProgressPaymentForm>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SubcontractorProgressPaymentForm {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setupCommonMocks();
});

describe("SubcontractorProgressPaymentForm — izin", () => {
  it("yazma izni yoksa AccessDenied basar", () => {
    mockSession({ progress_payments: "view" });
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });
});

describe("SubcontractorProgressPaymentForm — create/edit aynı bileşen", () => {
  it("create kipinde 'Hakediş … Oluştur' başlığını basar", async () => {
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-sequence-pending");
    expect(screen.getByRole("heading", { name: /Hakediş .* Oluştur/ })).toBeInTheDocument();
  });

  it("edit kipinde '#N Düzenle' başlığını basar", async () => {
    vi.mocked(useSubcontractorProgressPayment).mockReturnValue(queryResult({ data: detailFixture() }));
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    expect(await screen.findByText(/Hakediş #48 Düzenle/)).toBeInTheDocument();
  });

  it("edit kipinde draft değilse Türkçe uyarı basar, form gösterilmez", () => {
    vi.mocked(useSubcontractorProgressPayment).mockReturnValue(
      queryResult({ data: detailFixture({ status: "pending_approval" }) }),
    );
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    expect(
      screen.getByText("Bu hakediş artık taslak durumunda değil, düzenlenemez."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Hakediş Kalemleri")).not.toBeInTheDocument();
  });
});

describe("SubcontractorProgressPaymentForm — quantity_source iki dalı", () => {
  it("manual kaynaklı satırda 'Elle giriş' basar", async () => {
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    expect(await screen.findAllByText("Elle giriş")).toHaveLength(2);
  });

  it("diary kaynaklı satırda rozet + vurgu basar (SD dilimiyle canlanacak altyapı)", async () => {
    vi.mocked(useSubcontractorProgressPayment).mockReturnValue(
      queryResult({
        data: detailFixture({
          lines: [
            {
              id: "line-2",
              contract_item_id: ITEM_DIARY.id,
              code: ITEM_DIARY.code,
              description: ITEM_DIARY.description,
              unit: ITEM_DIARY.unit,
              contract_unit_price: "1200.00",
              coefficient: "1",
              quantity: "320",
              group_name: "A — Betonarme İşleri",
              sort_order: 1,
              quantity_source: "diary",
              adjusted_unit_price: "1200.00",
              line_total: "384000.00",
            },
          ],
        }),
      }),
    );
    const { container } = renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    await screen.findByText("Günlük kayıttan ↑");
    expect(container.textContent).toContain("Günlük kayıttan: 320 m³ hesaplandı");
  });
});

describe("SubcontractorProgressPaymentForm — eksik sözleşme birim fiyatı (fix round 1, Important)", () => {
  it("unit_price null olan kalemde 'Sözleşme B.F.' hücresi pending gösterir, GERÇEK '₺ 0' basılmaz", async () => {
    vi.mocked(useSubcontractorContract).mockReturnValue(
      queryResult({
        data: contractFixture({
          items: [{ ...ITEM_MANUAL, unit_price: null }, ITEM_DIARY],
          items_missing_price: 1,
        }),
      }),
    );
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    const pendingCell = await screen.findByTestId("thf-missing-price-cell");
    expect(pendingCell).toHaveTextContent("—");
    expect(pendingCell).toHaveAttribute("title", "Bu kalem için sözleşmede birim fiyat girilmemiş.");
    // Gerçek fiyatlı ITEM_DIARY (1200.00) İÇİN pending basılmamalı.
    expect(screen.getByText("1.200")).toBeInTheDocument();
  });

  it("items_missing_price > 0 iken görünür Türkçe uyarı bandı basar", async () => {
    vi.mocked(useSubcontractorContract).mockReturnValue(
      queryResult({
        data: contractFixture({
          items: [{ ...ITEM_MANUAL, unit_price: null }, ITEM_DIARY],
          items_missing_price: 1,
        }),
      }),
    );
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    expect(await screen.findByTestId("thf-missing-price-alert")).toHaveTextContent(
      "1 poz için sözleşmede birim fiyat girilmemiş",
    );
  });

  it("items_missing_price 0 iken uyarı bandı BASILMAZ", async () => {
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-sequence-pending");
    expect(screen.queryByTestId("thf-missing-price-alert")).not.toBeInTheDocument();
    expect(screen.queryByTestId("thf-missing-price-cell")).not.toBeInTheDocument();
  });

  it("GERÇEK sıfır birim fiyat ('0.00') pending DEĞİL, normal '₺ 0' olarak basılır", async () => {
    vi.mocked(useSubcontractorContract).mockReturnValue(
      queryResult({
        data: contractFixture({
          items: [{ ...ITEM_MANUAL, unit_price: "0.00" }, ITEM_DIARY],
        }),
      }),
    );
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-sequence-pending");
    expect(screen.queryByTestId("thf-missing-price-cell")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("SubcontractorProgressPaymentForm — tfoot", () => {
  it("edit kipinde 5 satırı ve yüzde etiketlerini şemadan (sözleşmeden) basar", async () => {
    vi.mocked(useSubcontractorProgressPayment).mockReturnValue(queryResult({ data: detailFixture() }));
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    expect(await screen.findByText("TOPLAM HAKEDİŞ")).toBeInTheDocument();
    expect(screen.getByText("KDV (%20)")).toBeInTheDocument();
    expect(screen.getByText("Avans Kesintisi (%10)")).toBeInTheDocument();
    expect(screen.getByText("Teminat Kesintisi (%5)")).toBeInTheDocument();
    expect(screen.getByText("NET ÖDENECEK")).toBeInTheDocument();
  });

  it("create kipinde (henüz calculation yokken) tutar '—' basar ama satır/etiket yapısı korunur", async () => {
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    expect(await screen.findByText("TOPLAM HAKEDİŞ")).toBeInTheDocument();
    expect(screen.getByText("KDV (%20)")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("SubcontractorProgressPaymentForm — PUT lines TÜM satırları gönderir (EN KRİTİK)", () => {
  it("create: Taslak Kaydet'e basınca TÜM satırlar (miktarı 0 dahil) tek gövdede PUT edilir", async () => {
    const createMutate = vi.fn((_vars, opts) => opts?.onSuccess?.({ id: PAYMENT_ID }));
    const replaceMutate = vi.fn();
    vi.mocked(useCreateSubcontractorProgressPayment).mockReturnValue(mutationResult({ mutate: createMutate }));
    vi.mocked(useReplaceSubcontractorProgressPaymentLines).mockReturnValue(mutationResult({ mutate: replaceMutate }));

    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-sequence-pending");
    await userEvent.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(replaceMutate).toHaveBeenCalledTimes(1);
    const [{ body }] = replaceMutate.mock.calls[0];
    expect(body.lines).toHaveLength(2);
    expect(body.lines.every((l: { quantity: string }) => l.quantity === "0")).toBe(true);
    expect(body.lines.map((l: { contract_item_id: string }) => l.contract_item_id).sort()).toEqual(
      [ITEM_MANUAL.id, ITEM_DIARY.id].sort(),
    );
  });

  it("edit: PATCH başarılı olunca PUT …/lines TÜM satırlarla çağrılır", async () => {
    const updateMutate = vi.fn((_vars, opts) => opts?.onSuccess?.());
    const replaceMutate = vi.fn();
    vi.mocked(useSubcontractorProgressPayment).mockReturnValue(queryResult({ data: detailFixture() }));
    vi.mocked(useUpdateSubcontractorProgressPayment).mockReturnValue(mutationResult({ mutate: updateMutate }));
    vi.mocked(useReplaceSubcontractorProgressPaymentLines).mockReturnValue(mutationResult({ mutate: replaceMutate }));

    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    await screen.findByText(/Hakediş #48 Düzenle/);
    await userEvent.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(replaceMutate).toHaveBeenCalledTimes(1);
    const [{ body }] = replaceMutate.mock.calls[0];
    expect(body.lines).toHaveLength(2);
  });
});

describe("SubcontractorProgressPaymentForm — 409/422 Türkçe hata mesajları", () => {
  it("409 — oluşturma çakışması Türkçe mesajını gösterir", async () => {
    const createMutate = vi.fn((_vars, opts) =>
      opts?.onError?.(backendError(409, "Bu sözleşmede açık bir taslak hakediş var.")),
    );
    vi.mocked(useCreateSubcontractorProgressPayment).mockReturnValue(mutationResult({ mutate: createMutate }));
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-sequence-pending");
    await userEvent.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
    expect(await screen.findByTestId("thf-form-error")).toHaveTextContent(
      "Bu sözleşmede açık bir taslak hakediş var.",
    );
  });

  it("422 — satır kaydetme doğrulama hatasını gösterir", async () => {
    const createMutate = vi.fn((_vars, opts) => opts?.onSuccess?.({ id: PAYMENT_ID }));
    const replaceMutate = vi.fn((_vars, opts) =>
      opts?.onError?.(backendError(422, "Miktar negatif olamaz.")),
    );
    vi.mocked(useCreateSubcontractorProgressPayment).mockReturnValue(mutationResult({ mutate: createMutate }));
    vi.mocked(useReplaceSubcontractorProgressPaymentLines).mockReturnValue(mutationResult({ mutate: replaceMutate }));
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-sequence-pending");
    await userEvent.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
    expect(await screen.findByTestId("thf-form-error")).toHaveTextContent("Miktar negatif olamaz.");
  });

  it("409 — güncelleme çakışması (taslak dışı) Türkçe fallback mesajını gösterir", async () => {
    const updateMutate = vi.fn((_vars, opts) => opts?.onError?.(backendError(409, "yalniz taslak guncellenebilir")));
    vi.mocked(useSubcontractorProgressPayment).mockReturnValue(queryResult({ data: detailFixture() }));
    vi.mocked(useUpdateSubcontractorProgressPayment).mockReturnValue(mutationResult({ mutate: updateMutate }));
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    await screen.findByText(/Hakediş #48 Düzenle/);
    await userEvent.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
    expect(await screen.findByTestId("thf-form-error")).toHaveTextContent("yalniz taslak guncellenebilir");
  });
});

describe("SubcontractorProgressPaymentForm — form doğrulama", () => {
  it("dönem seçilmemişse (yıl boşaltılırsa) Taslak Kaydet Türkçe hata verir, mutate ÇAĞRILMAZ", async () => {
    const createMutate = vi.fn();
    vi.mocked(useCreateSubcontractorProgressPayment).mockReturnValue(mutationResult({ mutate: createMutate }));
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-sequence-pending");
    await userEvent.clear(screen.getByLabelText("Hakediş yılı"));
    await userEvent.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
    expect(await screen.findByTestId("thf-form-error")).toHaveTextContent("Dönem seçimi zorunludur.");
    expect(createMutate).not.toHaveBeenCalled();
  });
});

/**
 * 🔒 SESSİZ VERİ DEĞİŞİKLİĞİ KAPISI — dönem seçicisi (PARA YÜZEYİ).
 *
 * "Dönem" ay seçicisinin mockup'ta boş seçeneği YOKTUR
 * (`Taşeron Hakediş Oluştur.dc.html:56`): sunucuda `period_year`/`period_month`
 * `null` olsa bile ekranda hep dolu bir dönem görünür. Kullanıcı dönemi hiç
 * SEÇMEDEN kaydederse anahtarın gitmesi, kullanıcının VERMEDİĞİ bir dönem
 * kararını PARA kaydına yazmak olurdu (maliyet/gelir yanlış aya düşer).
 * Yalnız DÜZENLEME kipini ilgilendirir (oluşturmada ezilecek sunucu değeri yok).
 * İşveren formundaki (`ProgressPaymentForm`) aynı kapının ikizi.
 */
describe("SubcontractorProgressPaymentForm (edit) · dokunulmamış dönem seçicisi", () => {
  function mockDraftDetail(overrides: Record<string, unknown>) {
    vi.mocked(useSubcontractorProgressPayment).mockReturnValue(
      queryResult({ data: detailFixture(overrides) }),
    );
    const updateMutate = vi.fn((_vars, opts) => opts?.onSuccess?.());
    vi.mocked(useUpdateSubcontractorProgressPayment).mockReturnValue(
      mutationResult({ mutate: updateMutate }),
    );
    vi.mocked(useReplaceSubcontractorProgressPaymentLines).mockReturnValue(
      mutationResult({ mutate: vi.fn() }),
    );
    return updateMutate;
  }

  async function save() {
    await screen.findByTestId("thf-hierarchy");
    await userEvent.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
  }

  it("sunucuda null olan period_year DOKUNULMADAN kaydedilirse anahtar GİTMEZ", async () => {
    const updateMutate = mockDraftDetail({ period_year: null });
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    await save();

    const [{ body }] = updateMutate.mock.calls[0];
    expect("period_year" in body).toBe(false);
  });

  it("sunucuda null olan period_month DOKUNULMADAN kaydedilirse anahtar GİTMEZ", async () => {
    const updateMutate = mockDraftDetail({ period_month: null });
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    // Ekranda mockup'ın ilk dolu seçeneği GÖRÜNÜR — ama bu kullanıcının kararı değil.
    expect(await screen.findByLabelText("Dönem")).not.toHaveValue("");
    await save();

    const [{ body }] = updateMutate.mock.calls[0];
    expect("period_month" in body).toBe(false);
  });

  it("kullanıcı dönemi SEÇERSE değer gövdede gider", async () => {
    const updateMutate = mockDraftDetail({ period_year: null, period_month: null });
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });

    await userEvent.selectOptions(await screen.findByLabelText("Dönem"), "3");
    const yearInput = screen.getByLabelText("Hakediş yılı");
    await userEvent.clear(yearInput);
    await userEvent.type(yearInput, "2025");
    await save();

    const [{ body }] = updateMutate.mock.calls[0];
    expect(body).toMatchObject({ period_year: 2025, period_month: 3 });
  });

  it("sunucudan DOLU gelen dönem dokunulmasa da AYNI değerle gider (gerileme koruması)", async () => {
    const updateMutate = mockDraftDetail({ period_year: 2026, period_month: 7 });
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    await save();

    const [{ body }] = updateMutate.mock.calls[0];
    expect(body).toMatchObject({ period_year: 2026, period_month: 7 });
  });

  it("OLUŞTURMA kipi etkilenmez — iki anahtar da HER ZAMAN gider", async () => {
    const mutate = vi.fn();
    vi.mocked(useCreateSubcontractorProgressPayment).mockReturnValue(mutationResult({ mutate }));
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await save();

    const [{ body }] = mutate.mock.calls[0];
    expect("period_year" in body).toBe(true);
    expect("period_month" in body).toBe(true);
    expect(body.period_year).toBe(new Date().getFullYear());
    expect(body.period_month).toBe(new Date().getMonth() + 1);
  });

  // K5 gerileme koruması: `section_id` bu mekanizmanın DIŞINDADIR. Orada
  // sunucudaki `null` ekranda "Tüm Bölümler" BOŞ seçeneğiyle DÜRÜSTÇE görünür
  // (mockup boş seçeneği çizer), yani uydurma bir değer yoktur — `null` `null`
  // olarak gitmelidir. Anahtarın düşürülmesi bölüm TEMİZLEMEYİ imkânsız kılardı.
  it("section_id sunucuda null iken gövdede AÇIKÇA null gider (omit mekanizmasına dâhil DEĞİL)", async () => {
    const updateMutate = mockDraftDetail({ section_id: null });
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    await save();

    const [{ body }] = updateMutate.mock.calls[0];
    expect("section_id" in body).toBe(true);
    expect(body.section_id).toBeNull();
  });
});

describe("SubcontractorProgressPaymentForm — dropped_orphan_count uyarısı", () => {
  it("dropped_orphan_count > 0 iken Türkçe uyarı basar", async () => {
    vi.mocked(useSubcontractorProgressPayment).mockReturnValue(
      queryResult({ data: detailFixture({ dropped_orphan_count: 2 }) }),
    );
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    expect(await screen.findByTestId("thf-dropped-orphan-alert")).toBeInTheDocument();
  });
});

// Final inceleme F-1 (KALICI KURAL) — backend'i/rotası olmayan mockup öğesi
// SİLİNMEZ: devre-dışı + görünür Türkçe gerekçeyle basılır.
//
// ⚠️ F-P5 T7 GÜNCELLEMESİ: bu iki öğenin hedefi olan TSD rotası
// (`/sozlesmeler/taseron/[contractId]`) YAZILDI → devre-dışı hâlleri ve
// pending gerekçeleri KALDIRILDI, ikisi de GERÇEK bağlantı oldu. Aşağıdaki
// testler eski "href TAŞIMAZ" iddialarının TERSİNİ kilitler; kalıcı kural
// ihlal edilmedi (öğe hiç kaybolmadı, yalnız aktifleşti).
describe("SubcontractorProgressPaymentForm — hiyerarşi şeridi ve sözleşme bağlantısı", () => {
  const CONTRACT_HREF = `/sozlesmeler/taseron/${CONTRACT_ID}`;

  it("'Sözleşmeyi Gör →' ARTIK AKTİF: TSD rotasına gerçek href basar", async () => {
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-sequence-pending");
    const seeContract = screen.getByTestId("thf-see-contract-link");
    expect(seeContract).toHaveTextContent("Sözleşmeyi Gör →");
    expect(seeContract).toHaveAttribute("href", CONTRACT_HREF);
    expect(seeContract).not.toHaveAttribute("aria-disabled");
    expect(seeContract).not.toHaveAttribute("title");
    // Hiyerarşi şeridinin İÇİNDE durur (mockup O41'deki yeri).
    expect(screen.getByTestId("thf-hierarchy")).toContainElement(seeContract);
  });

  it("breadcrumb'daki taşeron adı + sözleşme no da TSD rotasına bağlanır", async () => {
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    const crumb = await screen.findByTestId("thf-contract-crumb-link");
    expect(crumb).toHaveTextContent("Akın İnşaat");
    expect(crumb).toHaveAttribute("href", CONTRACT_HREF);
    expect(crumb).not.toHaveAttribute("aria-disabled");
  });

  it("ikisi de gerçek link ROLÜNDEDİR — ölü/devre-dışı link kalmadı", async () => {
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-sequence-pending");
    const links = screen.getAllByRole("link", { name: /Sözleşmeyi Gör|Akın İnşaat/ });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) expect(link).toHaveAttribute("href", CONTRACT_HREF);
  });

  // Final inceleme F-7 — mockup O21 "Hakediş #48 Oluştur"; create kipinde sıra
  // numarası henüz üretilmemiştir, öğe izsiz kaybolmaz.
  it("create kipinde sıra numarası yerine gerekçeli pending gösterge basar", async () => {
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    const pending = await screen.findByTestId("thf-sequence-pending");
    expect(pending).toHaveTextContent("#—");
    expect(pending).toHaveAttribute(
      "title",
      "Sıra numarası ilk kayıtta backend tarafından verilir.",
    );
  });

  it("edit kipinde GERÇEK sıra numarası basılır, pending gösterge YOKTUR", async () => {
    vi.mocked(useSubcontractorProgressPayment).mockReturnValue(queryResult({ data: detailFixture() }));
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    expect(await screen.findByText(/Hakediş #48 Düzenle/)).toBeInTheDocument();
    expect(screen.queryByTestId("thf-sequence-pending")).not.toBeInTheDocument();
  });

  it("işveren sözleşme no halkası zarif düşüşle basılır (pending, silinmez)", async () => {
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    const hierarchy = await screen.findByTestId("thf-hierarchy");
    expect(hierarchy).toBeInTheDocument();
  });
});

// F-SD T5 · "Günlükten Doldur" (spec §4) — sözleşme bazlı öneri ucu.
describe("SubcontractorProgressPaymentForm — Günlükten Doldur", () => {
  function mockSuggestion(result: Partial<{ data: unknown; error: unknown }>) {
    const refetch = vi.fn().mockResolvedValue({ error: null, ...result });
    vi.mocked(useSubcontractorDiarySuggestion).mockReturnValue({ refetch } as never);
    return refetch;
  }

  function suggestionData(overrides: Record<string, unknown> = {}) {
    return {
      year: 2026,
      month: 7,
      skipped_unbridged_count: 0,
      reason: null,
      contract_id: CONTRACT_ID,
      site_id: SITE_ID,
      lines: [
        { contract_item_id: ITEM_DIARY.id, quantity: "60.000", coefficient: null, sort_order: 0 },
      ],
      ...overrides,
    };
  }

  it("önerilen miktarı satıra yazar", async () => {
    mockSuggestion({ data: suggestionData() });
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-hierarchy");

    await userEvent.click(screen.getByTestId("thf-diary-fill"));

    expect(await screen.findByTestId("thf-diary-fill-notice")).toHaveTextContent(
      "1 satır günlük kayıtlardan dolduruldu.",
    );
    expect(screen.getByLabelText(`${ITEM_DIARY.description} — miktar`)).toHaveValue("60");
  });

  // F-P10 T2 · rozet göçü (KARAR S1): rozetin TEK kaynağı sunucunun kalıcı
  // `quantity_source` damgasıdır — kaydedilmemiş doldurma rozet BASMAZ,
  // satırlar "Elle giriş" kalır (işveren tarafıyla aynı desen).
  it("kaydedilmemiş doldurma rozet BASMAZ (damga sunucudan gelir)", async () => {
    mockSuggestion({ data: suggestionData() });
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-hierarchy");

    await userEvent.click(screen.getByTestId("thf-diary-fill"));

    expect(await screen.findByTestId("thf-diary-fill-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("thf-diary-source")).not.toBeInTheDocument();
    expect(screen.getAllByText("Elle giriş")).toHaveLength(2);
  });

  it("proje geneli sözleşmede backend gerekçesini görünür basar", async () => {
    mockSuggestion({
      data: suggestionData({
        lines: [],
        site_id: null,
        reason: "Proje geneli sözleşmede günlükten doldurma desteklenmiyor.",
      }),
    });
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-hierarchy");

    await userEvent.click(screen.getByTestId("thf-diary-fill"));

    expect(await screen.findByTestId("thf-diary-fill-notice")).toHaveTextContent(
      "Proje geneli sözleşmede günlükten doldurma desteklenmiyor.",
    );
  });

  it("atlanan poz + eşleşmeyen satırı görünür bildirir", async () => {
    mockSuggestion({
      data: suggestionData({
        skipped_unbridged_count: 2,
        lines: [
          { contract_item_id: "yok-1", quantity: "9", coefficient: null, sort_order: 0 },
        ],
      }),
    });
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-hierarchy");

    await userEvent.click(screen.getByTestId("thf-diary-fill"));

    const notice = await screen.findByTestId("thf-diary-fill-notice");
    expect(notice).toHaveTextContent("2 günlük pozu sözleşme kalemine bağlı olmadığı için atlandı");
    expect(notice).toHaveTextContent("Öneriden 1 satır bu formda karşılık bulamadı");
  });

  it("elle girilen miktarın üzerine yazmadan önce onay ister", async () => {
    mockSuggestion({ data: suggestionData() });
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-hierarchy");
    const input = screen.getByLabelText(`${ITEM_DIARY.description} — miktar`);
    await userEvent.clear(input);
    await userEvent.type(input, "15");

    await userEvent.click(screen.getByTestId("thf-diary-fill"));

    expect(
      await screen.findByText(/1 satırda elle girdiğiniz sıfırdan farklı miktar var/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Üzerine yaz" }));
    expect(screen.getByLabelText(`${ITEM_DIARY.description} — miktar`)).toHaveValue("60");
  });

  it("dolan miktarlar MEVCUT kaydetme yolundan (PUT lines) gönderilir", async () => {
    const replaceMutate = vi.fn();
    vi.mocked(useCreateSubcontractorProgressPayment).mockReturnValue(
      mutationResult({
        mutate: vi.fn((_vars, opts?: { onSuccess?: (created: { id: string }) => void }) =>
          opts?.onSuccess?.({ id: PAYMENT_ID }),
        ),
      }),
    );
    vi.mocked(useReplaceSubcontractorProgressPaymentLines).mockReturnValue(
      mutationResult({ mutate: replaceMutate }),
    );
    mockSuggestion({ data: suggestionData() });
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-hierarchy");
    await userEvent.click(screen.getByTestId("thf-diary-fill"));
    await screen.findByTestId("thf-diary-fill-notice");

    await userEvent.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    const body = replaceMutate.mock.calls[0][0] as {
      body: { lines: { contract_item_id: string; quantity: string }[] };
    };
    expect(body.body.lines).toContainEqual({
      contract_item_id: ITEM_DIARY.id,
      quantity: "60",
      sort_order: 1,
    });
  });

  it("uç hata verirse Türkçe gerekçe basar", async () => {
    mockSuggestion({
      data: undefined,
      error: new BackendError(403, { detail: "Bu sözleşmeye yetkiniz yok." }),
    });
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-hierarchy");

    await userEvent.click(screen.getByTestId("thf-diary-fill"));

    expect(await screen.findByTestId("thf-diary-fill-notice")).toHaveTextContent(
      "Bu sözleşmeye yetkiniz yok.",
    );
  });
});

describe("SubcontractorProgressPaymentForm — SEKME-F1.3b kaydedilmemiş değişiklik kaydı", () => {
  it("🔴 BU FORMDA BUGÜN HİÇ DİRTY YOKTU — yüklendi/dokunulmadı → false; miktar değişti → true; taslak kayıt → false (yönlendirme)", async () => {
    const user = userEvent.setup();
    const { unmount } = renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-hierarchy");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await user.type(screen.getByLabelText(`${ITEM_MANUAL.description} — miktar`), "5");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    // "Taslak Kaydet" başarılı olunca ekran listeye yönlendirir (unmount).
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("düzenleme: 🔴 ASYNC TABAN — sözleşme/detay geldikten sonra da false", async () => {
    vi.mocked(useSubcontractorProgressPayment).mockReturnValue(
      queryResult({ data: detailFixture() }),
    );
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    await screen.findByTestId("thf-hierarchy");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});

// TKL-F7b · T30/T42/T43 — taşeron hakedişinde miktar ve katsayı TÜRKÇE okunur (nokta binlik, virgül ondalık).
const AMBIGUOUS = "Ondalık için virgül kullanın (ör. 28,50)";
const COEFFICIENT_TOO_BIG = "Katsayı çok büyük, ondalık için virgül kullanın";
const QTY_LABEL = `${ITEM_MANUAL.description} — miktar`;

function mockCreateFlow() {
  const createMutate = vi.fn((_vars, opts) => opts?.onSuccess?.({ id: PAYMENT_ID }));
  const replaceMutate = vi.fn();
  vi.mocked(useCreateSubcontractorProgressPayment).mockReturnValue(mutationResult({ mutate: createMutate }));
  vi.mocked(useReplaceSubcontractorProgressPaymentLines).mockReturnValue(mutationResult({ mutate: replaceMutate }));
  return { createMutate, replaceMutate };
}

function mockEditFlow(detail: Record<string, unknown>) {
  const updateMutate = vi.fn((_vars, opts) => opts?.onSuccess?.());
  const replaceMutate = vi.fn();
  vi.mocked(useSubcontractorProgressPayment).mockReturnValue(queryResult({ data: detailFixture(detail) }));
  vi.mocked(useUpdateSubcontractorProgressPayment).mockReturnValue(mutationResult({ mutate: updateMutate }));
  vi.mocked(useReplaceSubcontractorProgressPaymentLines).mockReturnValue(mutationResult({ mutate: replaceMutate }));
  return { updateMutate, replaceMutate };
}

function manualLine(quantity: string) {
  return {
    id: "line-1",
    contract_item_id: ITEM_MANUAL.id,
    code: ITEM_MANUAL.code,
    description: ITEM_MANUAL.description,
    unit: ITEM_MANUAL.unit,
    contract_unit_price: "95.00",
    coefficient: "1",
    quantity,
    group_name: null,
    sort_order: 0,
    quantity_source: "manual",
    adjusted_unit_price: "95.00",
    line_total: "0",
  };
}

async function typeQuantity(text: string) {
  const input = await screen.findByLabelText(QTY_LABEL);
  await userEvent.clear(input);
  await userEvent.type(input, text);
}

async function save() {
  await userEvent.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
}

function savedQuantity(replaceMutate: ReturnType<typeof vi.fn>, itemId = ITEM_MANUAL.id) {
  const [{ body }] = replaceMutate.mock.calls[0];
  return body.lines.find((l: { contract_item_id: string }) => l.contract_item_id === itemId).quantity;
}

describe("SubcontractorProgressPaymentForm — miktar Türkçe okunur (TKL-F7b)", () => {
  it("'1.234,5' → gövde '1234.5'", async () => {
    const { replaceMutate } = mockCreateFlow();
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await typeQuantity("1.234,5");
    await save();
    expect(savedQuantity(replaceMutate)).toBe("1234.5");
  });

  it("'3,5' → gövde '3.5' (eskiden virgül silinip 35 gidiyordu)", async () => {
    const { replaceMutate } = mockCreateFlow();
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await typeQuantity("3,5");
    await save();
    expect(savedQuantity(replaceMutate)).toBe("3.5");
  });

  it.each(["0.500", "1.5"])("'%s' belirsiz: satır hatası görünür, istek GİTMEZ", async (text) => {
    const { createMutate, replaceMutate } = mockCreateFlow();
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await typeQuantity(text);
    await save();
    expect(await screen.findByText(AMBIGUOUS)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
    expect(replaceMutate).not.toHaveBeenCalled();
  });

  it("hata satırı düzeltilince hata kalkar ve kayıt gider", async () => {
    const { replaceMutate } = mockCreateFlow();
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await typeQuantity("0.500");
    await save();
    await screen.findByText(AMBIGUOUS);
    await typeQuantity("0,5");
    expect(screen.queryByText(AMBIGUOUS)).not.toBeInTheDocument();
    await save();
    expect(savedQuantity(replaceMutate)).toBe("0.5");
  });

  it("düzenleme: sunucu '12.500' → input '12,5'; dokunmadan kaydet '12.5' (12500 DEĞİL), form kirli değil", async () => {
    const { replaceMutate } = mockEditFlow({ lines: [manualLine("12.500")] });
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    expect(await screen.findByLabelText(QTY_LABEL)).toHaveValue("12,5");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    await save();
    expect(savedQuantity(replaceMutate)).toBe("12.5");
  });

  it("düzenleme: sunucu '3200.000' → '3.200'; kaydet '3200'", async () => {
    const { replaceMutate } = mockEditFlow({ lines: [manualLine("3200.000")] });
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    expect(await screen.findByLabelText(QTY_LABEL)).toHaveValue("3.200");
    await save();
    expect(savedQuantity(replaceMutate)).toBe("3200");
  });

  it("günlükten doldurulan '1234.500' Türkçe gösterilir ('1.234,5') ve '1234.5' gider", async () => {
    const { replaceMutate } = mockCreateFlow();
    vi.mocked(useSubcontractorDiarySuggestion).mockReturnValue({
      refetch: vi.fn().mockResolvedValue({
        data: {
          year: 2026, month: 7, skipped_unbridged_count: 0, reason: null,
          contract_id: CONTRACT_ID, site_id: SITE_ID,
          lines: [{ contract_item_id: ITEM_MANUAL.id, quantity: "1234.500", coefficient: null, sort_order: 0 }],
        },
        error: null,
      }),
    } as never);
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-hierarchy");
    await userEvent.click(screen.getByTestId("thf-diary-fill"));
    await screen.findByTestId("thf-diary-fill-notice");
    expect(screen.getByLabelText(QTY_LABEL)).toHaveValue("1.234,5");
    await save();
    expect(savedQuantity(replaceMutate)).toBe("1234.5");
  });
});

describe("SubcontractorProgressPaymentForm — Günlükten Doldur bayat satır hatasını temizler (TKL-F8 adım 2)", () => {
  it("doldurmanın DEĞİŞTİRDİĞİ satırın hatası kalkar; değişmeyen hatalı satırın hatası kalır", async () => {
    mockCreateFlow();
    vi.mocked(useSubcontractorDiarySuggestion).mockReturnValue({
      refetch: vi.fn().mockResolvedValue({
        data: {
          year: 2026, month: 7, skipped_unbridged_count: 0, reason: null,
          contract_id: CONTRACT_ID, site_id: SITE_ID,
          lines: [{ contract_item_id: ITEM_DIARY.id, quantity: "320.000", coefficient: null, sort_order: 0 }],
        },
        error: null,
      }),
    } as never);
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await screen.findByTestId("thf-hierarchy");
    const manualInput = screen.getByLabelText(QTY_LABEL);
    const diaryInput = screen.getByLabelText(`${ITEM_DIARY.description} — miktar`);
    await userEvent.clear(manualInput);
    await userEvent.type(manualInput, "1.5");
    await userEvent.clear(diaryInput);
    await userEvent.type(diaryInput, "1.5");
    await save();
    expect(await screen.findAllByText(AMBIGUOUS)).toHaveLength(2);

    await userEvent.click(screen.getByTestId("thf-diary-fill"));
    await userEvent.click(await screen.findByRole("button", { name: "Üzerine yaz" }));
    await screen.findByTestId("thf-diary-fill-notice");

    expect(diaryInput).toHaveValue("320");
    expect(diaryInput).not.toHaveAttribute("aria-invalid");
    expect(manualInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText(AMBIGUOUS)).toHaveLength(1);
  });
});

describe("SubcontractorProgressPaymentForm — katsayı Türkçe okunur (TKL-F7b · T43)", () => {
  async function typeCoefficient(text: string) {
    const input = await screen.findByLabelText("Katsayı (Dn/D0)");
    await userEvent.clear(input);
    await userEvent.type(input, text);
  }

  it("'1,052' → gövde default_coefficient '1.052'", async () => {
    const { createMutate } = mockCreateFlow();
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await typeCoefficient("1,052");
    await save();
    expect(createMutate.mock.calls[0][0].body.default_coefficient).toBe("1.052");
  });

  it("'1,0523' → 'En fazla 3 ondalık', istek GİTMEZ", async () => {
    const { createMutate, replaceMutate } = mockCreateFlow();
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await typeCoefficient("1,0523");
    await save();
    expect(await screen.findByText("En fazla 3 ondalık")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
    expect(replaceMutate).not.toHaveBeenCalled();
  });

  it.each(["0", "0,000"])("'%s' → 'Katsayı sıfırdan büyük olmalıdır', istek GİTMEZ", async (text) => {
    const { createMutate } = mockCreateFlow();
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await typeCoefficient(text);
    await save();
    expect(await screen.findByText("Katsayı sıfırdan büyük olmalıdır")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it.each(["1.052", "10,01", "1.052,5"])("'%s' → 'çok büyük' hatası görünür, istek GİTMEZ", async (text) => {
    const { createMutate, replaceMutate } = mockCreateFlow();
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await typeCoefficient(text);
    await save();
    expect(await screen.findByText(COEFFICIENT_TOO_BIG)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
    expect(replaceMutate).not.toHaveBeenCalled();
  });

  it("'1.05' → belirsiz nokta hatası, istek GİTMEZ", async () => {
    const { createMutate } = mockCreateFlow();
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await typeCoefficient("1.05");
    await save();
    expect(await screen.findByText(AMBIGUOUS)).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("'10' geçerli (sınır dahil)", async () => {
    const { createMutate } = mockCreateFlow();
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    await typeCoefficient("10");
    await save();
    expect(createMutate.mock.calls[0][0].body.default_coefficient).toBe("10");
  });

  it("boş bırakılırsa mevcut davranış: '1' gider", async () => {
    const { createMutate } = mockCreateFlow();
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    const input = await screen.findByLabelText("Katsayı (Dn/D0)");
    await userEvent.clear(input);
    await save();
    expect(createMutate.mock.calls[0][0].body.default_coefficient).toBe("1");
  });

  it("düzenleme: sunucu '1.052' → input '1,052'; dokunmadan kaydet '1.052', form kirli değil", async () => {
    const { updateMutate } = mockEditFlow({ default_coefficient: "1.052" });
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    expect(await screen.findByLabelText("Katsayı (Dn/D0)")).toHaveValue("1,052");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    await save();
    expect(updateMutate.mock.calls[0][0].body.default_coefficient).toBe("1.052");
  });

  it("düzenleme: sunucu '1' → '1'", async () => {
    mockEditFlow({ default_coefficient: "1" });
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    expect(await screen.findByLabelText("Katsayı (Dn/D0)")).toHaveValue("1");
  });
});

describe("SubcontractorProgressPaymentForm — günlük etiketi Türkçe metni doğru okur (TKL-F7b denetim)", () => {
  it.each([
    ["1234.500", "1.234,5"],
    ["12.500", "12,5"],
  ])("sunucu '%s' diary satırı → etiket '%s'", async (server, shown) => {
    mockEditFlow({
      lines: [{ ...manualLine(server), quantity_source: "diary" }],
    });
    const { container } = renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    await screen.findByText("Günlük kayıttan ↑");
    expect(container.textContent).toContain(`Günlük kayıttan: ${shown} ${ITEM_MANUAL.unit} hesaplandı`);
  });
});

// KAT-F2.4 · Q2: poz no hücresinde, kodun altında Bakanlık poz no'su (kayıtlı satır snapshot'ı kalemi ÖRTER).
describe("SubcontractorProgressPaymentForm — Bakanlık poz no'su alt satırı", () => {
  it("kayıtlı satır yokken kalemin kodu basılır; kodsuz kalemde HİÇBİR ŞEY", async () => {
    vi.mocked(useSubcontractorContract).mockReturnValue(
      queryResult({ data: contractFixture({ items: [{ ...ITEM_MANUAL, source_code: "15.250.1011" }, { ...ITEM_DIARY, source_code: null }] }) }),
    );
    renderForm({ mode: "create", contractId: CONTRACT_ID });
    const subs = await screen.findAllByTestId("thf-source-code");
    expect(subs).toHaveLength(1);
    expect(subs[0]).toHaveTextContent("15.250.1011");
    expect(screen.getByText("03.010").closest("td")).toContainElement(subs[0]);
  });

  it("kayıtlı satırın snapshot'ı kalemden FARKLIYSA SATIRINKİ görünür", async () => {
    vi.mocked(useSubcontractorContract).mockReturnValue(
      queryResult({ data: contractFixture({ items: [{ ...ITEM_MANUAL, source_code: "15.250.1011" }, ITEM_DIARY] }) }),
    );
    vi.mocked(useSubcontractorProgressPayment).mockReturnValue(
      queryResult({
        data: detailFixture({
          lines: [
            {
              id: "line-1", contract_item_id: ITEM_MANUAL.id, code: ITEM_MANUAL.code, source_code: "35.140.3195-D",
              description: ITEM_MANUAL.description, unit: ITEM_MANUAL.unit, contract_unit_price: "95.00", coefficient: "1",
              quantity: "10", group_name: "B — Kalıp İşleri", sort_order: 0, quantity_source: "manual",
              adjusted_unit_price: "95.00", line_total: "950.00",
            },
          ],
        }),
      }),
    );
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    const sub = await screen.findByTestId("thf-source-code");
    expect(sub).toHaveTextContent("35.140.3195-D");
    expect(screen.queryByText("15.250.1011")).not.toBeInTheDocument();
  });
});
