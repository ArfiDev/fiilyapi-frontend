import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ProgressPaymentForm } from "./ProgressPaymentForm";
import { useSession } from "@/components/shell/SessionProvider";
import type { MeResponse } from "@/lib/auth/types";
import { useContractDistribution, useEmployerContract } from "@/lib/api/hooks/useContract";
import { useProgressPayment, type ProgressPaymentDetail } from "@/lib/api/hooks/useProgressPayments";
import { useProject } from "@/lib/api/hooks/useProjects";
import {
  useCreateProgressPayment,
  useRefreshProgressPaymentPrices,
  useReplaceProgressPaymentLines,
  useUpdateProgressPayment,
} from "@/lib/api/hooks/useProgressPaymentMutations";
import { useEmployerDiarySuggestion } from "@/lib/api/hooks/useDiarySuggestion";
import { BackendError } from "@/lib/api/unwrap";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({ paymentId: PAYMENT_ID }),
}));

vi.mock("@/lib/api/hooks/useContract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useContract")>()),
  useContractDistribution: vi.fn(),
  useEmployerContract: vi.fn(),
}));

vi.mock("@/lib/api/hooks/useProgressPayments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProgressPayments")>()),
  useProgressPayment: vi.fn(),
}));

vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProject: vi.fn(),
}));

vi.mock("@/lib/api/hooks/useDiarySuggestion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useDiarySuggestion")>()),
  useEmployerDiarySuggestion: vi.fn(),
}));

vi.mock("@/lib/api/hooks/useProgressPaymentMutations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProgressPaymentMutations")>()),
  useCreateProgressPayment: vi.fn(),
  useUpdateProgressPayment: vi.fn(),
  useReplaceProgressPaymentLines: vi.fn(),
  useRefreshProgressPaymentPrices: vi.fn(),
}));

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const PAYMENT_ID = "22222222-2222-2222-2222-222222222222";
const SITE_A = { id: "site-a", name: "A-Blok" };
const SITE_B = { id: "site-b", name: "B-Blok" };

const ITEM_1 = {
  id: "item-1",
  code: "03.001",
  description: "Kat Döşemesi C25/30",
  unit: "m³",
  quantity: "1500.000",
  unit_price: "1850.00",
  allocations: [
    { site_id: SITE_A.id, quantity: "900.000", boq_item_id: "boq-1" },
    { site_id: SITE_B.id, quantity: "420.000", boq_item_id: "boq-2" },
  ],
  remaining_quantity: "180.000",
};
// Yalnız A-Blok'a dağıtılmış — B-Blok hücresi kapalı olmalı.
const ITEM_2 = {
  id: "item-2",
  code: "03.002",
  description: "Kolon Betonu C30/37",
  unit: "m³",
  quantity: "300.000",
  unit_price: "2100.00",
  allocations: [{ site_id: SITE_A.id, quantity: "300.000", boq_item_id: "boq-3" }],
  remaining_quantity: "0.000",
};

function distributionFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sites: [SITE_A, SITE_B],
    groups: [{ id: "g-1", name: "A — Betonarme İşleri", sort_order: 10, items: [ITEM_1, ITEM_2] }],
    undistributed_item_count: 0,
    undistributed_item_names: [],
    site_summaries: [],
    distributed_item_count: 2,
    total_item_count: 2,
    ...overrides,
  };
}

function contractFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    project_id: PROJECT_ID,
    contract_no: "SZL-2025-001",
    employer_name: "Güneşkent Gayrimenkul",
    has_price_escalation: true,
    status: "active",
    ...overrides,
  };
}

function detailFixture(overrides: Partial<ProgressPaymentDetail> = {}): ProgressPaymentDetail {
  return {
    id: PAYMENT_ID,
    project_id: PROJECT_ID,
    project_name: "Güneşkent Konut",
    sequence_no: 5,
    period_year: 2026,
    period_month: 7,
    description: "Kaba inşaat",
    status: "draft",
    vat_pct: "20.00",
    advance_pct: "20.00",
    retainage_pct: "5.00",
    default_coefficient: "1.000",
    submitted_at: null,
    approved_at: null,
    approved_by: null,
    paid_at: null,
    created_by: "44444444-4444-4444-4444-444444444444",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    lines: [],
    groups: [],
    calculation: { gross: "0", vat: "0", advance_deduction: "0", retention: "0", net: "0" },
    progress: { financial_pct: null, physical_pct: null, duration_pct: null },
    dropped_orphan_count: 0,
    ...overrides,
  } as ProgressPaymentDetail;
}

const BASE_ME = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "ayse@ornek.com",
  full_name: "Ayşe Yılmaz",
  title: null,
  role_key: "procurement",
  status: "active",
} as unknown as MeResponse;

function mockSession(permissions?: Record<string, string>) {
  const me = permissions === undefined ? BASE_ME : { ...BASE_ME, permissions };
  vi.mocked(useSession).mockReturnValue({ me: me as MeResponse, isLoading: false });
}

function queryResult<T>(value: Partial<{ data: T; isLoading: boolean; isError: boolean; error: unknown }>) {
  return { data: undefined, isLoading: false, isError: false, error: null, ...value } as never;
}

function mutationResult(overrides: Partial<{ mutate: ReturnType<typeof vi.fn>; isPending: boolean }> = {}) {
  return { mutate: vi.fn(), isPending: false, ...overrides } as never;
}

function setupCommonMocks() {
  mockSession({ progress_payments: "draft" });
  vi.mocked(useProject).mockReturnValue(queryResult({ data: { id: PROJECT_ID, name: "Güneşkent Konut" } }));
  vi.mocked(useContractDistribution).mockReturnValue(queryResult({ data: distributionFixture() }));
  vi.mocked(useEmployerContract).mockReturnValue(queryResult({ data: contractFixture() }));
  vi.mocked(useProgressPayment).mockReturnValue(queryResult({}));
  vi.mocked(useCreateProgressPayment).mockReturnValue(mutationResult());
  vi.mocked(useUpdateProgressPayment).mockReturnValue(mutationResult());
  vi.mocked(useReplaceProgressPaymentLines).mockReturnValue(mutationResult());
  vi.mocked(useRefreshProgressPaymentPrices).mockReturnValue(mutationResult());
  vi.mocked(useEmployerDiarySuggestion).mockReturnValue({
    refetch: vi.fn().mockResolvedValue({ data: undefined, error: null }),
  } as never);
}

function renderForm(props: Parameters<typeof ProgressPaymentForm>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProgressPaymentForm {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setupCommonMocks();
});

describe("ProgressPaymentForm — izin", () => {
  it("yazma izni yoksa AccessDenied basar", () => {
    mockSession({ progress_payments: "view" });
    renderForm({ mode: "create", projectId: PROJECT_ID });
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });
});

describe("ProgressPaymentForm — create ve edit kiplerinin aynı bileşeni kullanması", () => {
  it("create kipinde pivot tablosunu şantiye başlıklarıyla basar", async () => {
    renderForm({ mode: "create", projectId: PROJECT_ID });
    expect(await screen.findByText("İşveren Hakediş Oluştur")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: SITE_A.name })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: SITE_B.name })).toBeInTheDocument();
  });

  it("edit kipinde AYNI pivot tablo yapısını (aynı şantiye başlıkları) basar", async () => {
    vi.mocked(useProgressPayment).mockReturnValue(queryResult({ data: detailFixture() }));
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    expect(await screen.findByText("İşveren Hakediş #5")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: SITE_A.name })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: SITE_B.name })).toBeInTheDocument();
  });

  it("edit kipinde draft değilse Türkçe uyarı basar, form gösterilmez", () => {
    vi.mocked(useProgressPayment).mockReturnValue(
      queryResult({ data: detailFixture({ status: "pending_approval" }) }),
    );
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    expect(
      screen.getByText("Bu hakediş artık taslak durumunda değil, düzenlenemez."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: SITE_A.name })).not.toBeInTheDocument();
  });
});

describe("ProgressPaymentForm — Fiyat Farkı bandı", () => {
  it("has_price_escalation false iken katsayı girişi kilitlidir", async () => {
    vi.mocked(useEmployerContract).mockReturnValue(
      queryResult({ data: contractFixture({ has_price_escalation: false }) }),
    );
    renderForm({ mode: "create", projectId: PROJECT_ID });
    const coefficientInput = await screen.findByLabelText("Katsayı (Dn/D0)");
    expect(coefficientInput).toBeDisabled();
    expect(coefficientInput).toHaveValue("1");
  });

  it("has_price_escalation true iken katsayı girişi düzenlenebilir", async () => {
    renderForm({ mode: "create", projectId: PROJECT_ID });
    const coefficientInput = await screen.findByLabelText("Katsayı (Dn/D0)");
    expect(coefficientInput).not.toBeDisabled();
  });

  it("Endeks seçici HİÇ BASILMAZ (index_type şemada yok)", async () => {
    renderForm({ mode: "create", projectId: PROJECT_ID });
    await screen.findByText("İşveren Hakediş Oluştur");
    expect(screen.queryByText("Endeks")).not.toBeInTheDocument();
  });
});

describe("ProgressPaymentForm — dağıtılmamış poz uyarısı", () => {
  it("undistributed_item_count > 0 iken Türkçe uyarı bandı basar", async () => {
    vi.mocked(useContractDistribution).mockReturnValue(
      queryResult({
        data: distributionFixture({
          undistributed_item_count: 1,
          undistributed_item_names: ["04.005 — Sıva İşleri"],
        }),
      }),
    );
    renderForm({ mode: "create", projectId: PROJECT_ID });
    const alert = await screen.findByTestId("pp-form-undistributed-alert");
    expect(alert).toHaveTextContent("04.005 — Sıva İşleri");
  });

  it("undistributed_item_count 0 iken uyarı bandı YOK", async () => {
    renderForm({ mode: "create", projectId: PROJECT_ID });
    await screen.findByText("İşveren Hakediş Oluştur");
    expect(screen.queryByTestId("pp-form-undistributed-alert")).not.toBeInTheDocument();
  });
});

describe("ProgressPaymentForm — refresh-prices görünürlüğü ve bayat fiyat uyarısı", () => {
  it("create kipinde Fiyatları Tazele butonu YOK", async () => {
    renderForm({ mode: "create", projectId: PROJECT_ID });
    await screen.findByText("İşveren Hakediş Oluştur");
    expect(screen.queryByTestId("pp-form-refresh-prices")).not.toBeInTheDocument();
  });

  it("edit kipinde draft durumunda Fiyatları Tazele butonu görünür", async () => {
    vi.mocked(useProgressPayment).mockReturnValue(queryResult({ data: detailFixture({ status: "draft" }) }));
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    expect(await screen.findByTestId("pp-form-refresh-prices")).toBeInTheDocument();
  });

  it("is_price_stale true olan satır varsa bayat fiyat uyarısı basar", async () => {
    vi.mocked(useProgressPayment).mockReturnValue(
      queryResult({
        data: detailFixture({
          status: "draft",
          lines: [
            {
              id: "line-1",
              contract_item_id: ITEM_1.id,
              site_id: SITE_A.id,
              code: ITEM_1.code,
              description: ITEM_1.description,
              unit: ITEM_1.unit,
              contract_unit_price: ITEM_1.unit_price,
              coefficient: "1.000",
              quantity: "900.000",
              group_name: "A — Betonarme İşleri",
              sort_order: 0,
              adjusted_unit_price: ITEM_1.unit_price,
              line_total: "1665000.00",
              previous_quantity: "0.000",
              previous_amount: "0.00",
              cumulative_quantity: "900.000",
              cumulative_amount: "1665000.00",
              is_price_stale: true,
            },
          ] as never,
        }),
      }),
    );
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    expect(await screen.findByTestId("pp-form-stale-price-alert")).toBeInTheDocument();
  });

  // F-P10 T2 · rozet göçü: SUNUCUDAN `quantity_source: "diary"` gelen satır
  // düzenleme kipinde rozetle açılır (mockup 117).
  it("sunucu damgası diary olan satır rozetle basar", async () => {
    vi.mocked(useProgressPayment).mockReturnValue(
      queryResult({
        data: detailFixture({
          status: "draft",
          lines: [
            {
              id: "line-1",
              contract_item_id: ITEM_1.id,
              site_id: SITE_A.id,
              code: ITEM_1.code,
              description: ITEM_1.description,
              unit: ITEM_1.unit,
              contract_unit_price: ITEM_1.unit_price,
              coefficient: "1.000",
              quantity: "900.000",
              group_name: "A — Betonarme İşleri",
              sort_order: 0,
              quantity_source: "diary",
              adjusted_unit_price: ITEM_1.unit_price,
              line_total: "1665000.00",
              previous_quantity: "0.000",
              previous_amount: "0.00",
              cumulative_quantity: "900.000",
              cumulative_amount: "1665000.00",
              is_price_stale: false,
            },
          ] as never,
        }),
      }),
    );
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    expect(await screen.findByTestId("pp-form-diary-note")).toHaveTextContent(
      "📅 Günlük kayıtlardan hesaplandı",
    );
  });
});

describe("ProgressPaymentForm — kaydetme gövdesi (EN KRİTİK)", () => {
  it("create: TÜM düzenlenebilir hücreleri (0 miktarlılar dahil) tek gövdede gönderir", async () => {
    const mutate = vi.fn();
    vi.mocked(useCreateProgressPayment).mockReturnValue(mutationResult({ mutate }));
    renderForm({ mode: "create", projectId: PROJECT_ID });

    const saveButtons = await screen.findAllByRole("button", { name: "Taslak Kaydet" });
    await userEvent.click(saveButtons[0]);

    expect(mutate).toHaveBeenCalledTimes(1);
    const [{ body }] = mutate.mock.calls[0];
    // item-1: A + B (2 hücre), item-2: yalnız A (1 hücre) → toplam 3
    expect(body.lines).toHaveLength(3);
    expect(body.lines.every((l: { quantity: string }) => l.quantity === "0")).toBe(true);
    const keys = body.lines.map((l: { contract_item_id: string; site_id: string }) => `${l.contract_item_id}::${l.site_id}`);
    expect(new Set(keys).size).toBe(keys.length);
    // item-2 × B-Blok dağıtılmadığı için gövdede OLMAMALI.
    expect(
      body.lines.some(
        (l: { contract_item_id: string; site_id: string }) =>
          l.contract_item_id === ITEM_2.id && l.site_id === SITE_B.id,
      ),
    ).toBe(false);
  });

  it("edit: PATCH başarılı olunca PUT …/lines TÜM düzenlenebilir hücrelerle çağrılır", async () => {
    const updateMutate = vi.fn((_vars, opts) => opts?.onSuccess?.());
    const replaceMutate = vi.fn();
    vi.mocked(useProgressPayment).mockReturnValue(queryResult({ data: detailFixture() }));
    vi.mocked(useUpdateProgressPayment).mockReturnValue(mutationResult({ mutate: updateMutate }));
    vi.mocked(useReplaceProgressPaymentLines).mockReturnValue(mutationResult({ mutate: replaceMutate }));

    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    const saveButtons = await screen.findAllByRole("button", { name: "Taslak Kaydet" });
    await userEvent.click(saveButtons[0]);

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(replaceMutate).toHaveBeenCalledTimes(1);
    const [{ body }] = replaceMutate.mock.calls[0];
    expect(body.lines).toHaveLength(3);
    expect(body.lines.every((l: { quantity: string }) => l.quantity === "0")).toBe(true);
  });
});

/**
 * 🔒 SESSİZ VERİ DEĞİŞİKLİĞİ KAPISI — dönem seçicisi (PARA YÜZEYİ).
 *
 * "Hakediş Dönemi" ay seçicisinin mockup'ta boş seçeneği YOKTUR
 * (`İşveren Hakediş Oluştur.dc.html:82`): sunucuda `period_year`/`period_month`
 * `null` olsa bile ekranda hep dolu bir dönem görünür. Kullanıcı dönemi hiç
 * SEÇMEDEN kaydederse anahtarın gitmesi, kullanıcının VERMEDİĞİ bir dönem
 * kararını PARA kaydına yazmak olurdu (maliyet/gelir yanlış aya düşer).
 * Yalnız DÜZENLEME kipini ilgilendirir (oluşturmada ezilecek sunucu değeri yok).
 */
describe("ProgressPaymentForm (edit) · dokunulmamış dönem seçicisi", () => {
  function mockDraftDetail(overrides: Partial<ProgressPaymentDetail>) {
    vi.mocked(useProgressPayment).mockReturnValue(
      queryResult({ data: detailFixture(overrides) }),
    );
    const updateMutate = vi.fn((_vars, opts) => opts?.onSuccess?.());
    vi.mocked(useUpdateProgressPayment).mockReturnValue(mutationResult({ mutate: updateMutate }));
    vi.mocked(useReplaceProgressPaymentLines).mockReturnValue(mutationResult({ mutate: vi.fn() }));
    return updateMutate;
  }

  async function save() {
    const [saveButton] = await screen.findAllByRole("button", { name: "Taslak Kaydet" });
    await userEvent.click(saveButton);
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
    expect(await screen.findByLabelText("Hakediş Dönemi")).not.toHaveValue("");
    await save();

    const [{ body }] = updateMutate.mock.calls[0];
    expect("period_month" in body).toBe(false);
  });

  it("kullanıcı dönemi SEÇERSE değer gövdede gider", async () => {
    const updateMutate = mockDraftDetail({ period_year: null, period_month: null });
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });

    await userEvent.selectOptions(await screen.findByLabelText("Hakediş Dönemi"), "3");
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
    vi.mocked(useCreateProgressPayment).mockReturnValue(mutationResult({ mutate }));
    renderForm({ mode: "create", projectId: PROJECT_ID });
    await save();

    const [{ body }] = mutate.mock.calls[0];
    expect("period_year" in body).toBe(true);
    expect("period_month" in body).toBe(true);
    expect(body.period_year).toBe(new Date().getFullYear());
    expect(body.period_month).toBe(new Date().getMonth() + 1);
  });
});

describe("ProgressPaymentForm — geçersiz-değer koruması (kontrolcü bulgusu §2)", () => {
  it("miktar hücresine harf/işaret yazılırsa süzülür, state'e girmez", async () => {
    renderForm({ mode: "create", projectId: PROJECT_ID });
    const qtyInput = await screen.findByLabelText(`${ITEM_1.description} — ${SITE_A.name} miktar`);
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, "12a-3,5,6");
    // TKL-F8: virgül SİLİNMEZ (Türkçe ondalık), yalnız ikincisi atılır.
    expect(qtyInput).toHaveValue("123,56");
  });

  it("miktar hücresi boş bırakılıp kaydedilirse gövdeye '0' gider (reddedilmez)", async () => {
    const mutate = vi.fn();
    vi.mocked(useCreateProgressPayment).mockReturnValue(mutationResult({ mutate }));
    renderForm({ mode: "create", projectId: PROJECT_ID });

    const qtyInput = await screen.findByLabelText(`${ITEM_1.description} — ${SITE_A.name} miktar`);
    await userEvent.clear(qtyInput);

    const [saveButton] = await screen.findAllByRole("button", { name: "Taslak Kaydet" });
    await userEvent.click(saveButton);

    const [{ body }] = mutate.mock.calls[0];
    const cell = body.lines.find(
      (l: { contract_item_id: string; site_id: string }) =>
        l.contract_item_id === ITEM_1.id && l.site_id === SITE_A.id,
    );
    expect(cell.quantity).toBe("0");
  });

  // no 180 · DAVRANIŞ DEĞİŞTİ: eskiden boş yıl `period_year: null` ile
  // İSTEK UÇURUYORDU (uydurma `0` yoktu ama sunucuya boş bir dönem
  // gidiyordu); artık ikiz taşeron formuyla AYNI kural — dönem eksikse
  // istek hiç açılmaz, kullanıcı alan hatası görür.
  it("Hakediş yılı boş bırakılırsa istek UÇMAZ, dönem hatası basılır", async () => {
    const mutate = vi.fn();
    vi.mocked(useCreateProgressPayment).mockReturnValue(mutationResult({ mutate }));
    renderForm({ mode: "create", projectId: PROJECT_ID });

    const yearInput = await screen.findByLabelText("Hakediş yılı");
    await userEvent.clear(yearInput);

    const [saveButton] = await screen.findAllByRole("button", { name: "Taslak Kaydet" });
    await userEvent.click(saveButton);

    expect(mutate).not.toHaveBeenCalled();
    expect(await screen.findByText("Dönem seçimi zorunludur.")).toBeInTheDocument();
  });
});

describe("ProgressPaymentForm — Ödeme Hesabı kartı (kontrolcü düzeltmesi §1)", () => {
  it("edit kipinde detail.calculation'ı PaymentCalculationCard ile basar", async () => {
    vi.mocked(useProgressPayment).mockReturnValue(
      queryResult({
        data: detailFixture({
          calculation: {
            gross: "4920600.00",
            vat: "984120.00",
            advance_deduction: "984120.00",
            retention: "246030.00",
            net: "4674570.00",
          },
        }),
      }),
    );
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    expect(await screen.findByText("Ödeme Hesabı")).toBeInTheDocument();
    expect(screen.getByText("Net Tahsil")).toBeInTheDocument();
  });

  it("create kipinde Ödeme Hesabı kartı basılmaz (henüz calculation yok)", async () => {
    renderForm({ mode: "create", projectId: PROJECT_ID });
    await screen.findByText("İşveren Hakediş Oluştur");
    expect(screen.queryByText("Ödeme Hesabı")).not.toBeInTheDocument();
  });
});

describe("ProgressPaymentForm — tahsisi kaldırılmış kayıtlı hücre uyarısı (final inceleme #2)", () => {
  it("kayıtlı ama tahsisi kaldırılmış hücre varsa uyarı basar ve miktarı gösterir (—'ya düşmez)", async () => {
    // item-2 fikstürde yalnız A-Blok'a dağıtılmış; burada B-Blok'a önceden
    // kaydedilmiş bir satır simüle edilir — tahsis SONRADAN kaldırılmış.
    vi.mocked(useProgressPayment).mockReturnValue(
      queryResult({
        data: detailFixture({
          status: "draft",
          lines: [
            {
              id: "line-orphan",
              contract_item_id: ITEM_2.id,
              site_id: SITE_B.id,
              code: ITEM_2.code,
              description: ITEM_2.description,
              unit: ITEM_2.unit,
              contract_unit_price: ITEM_2.unit_price,
              coefficient: "1.000",
              quantity: "150.000",
              group_name: "A — Betonarme İşleri",
              sort_order: 1,
              adjusted_unit_price: ITEM_2.unit_price,
              line_total: "315000.00",
              previous_quantity: "0.000",
              previous_amount: "0.00",
              cumulative_quantity: "150.000",
              cumulative_amount: "315000.00",
              is_price_stale: false,
            },
          ] as never,
        }),
      }),
    );
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    const alert = await screen.findByTestId("pp-form-orphaned-alert");
    expect(alert).toHaveTextContent(ITEM_2.code);
    expect(alert).toHaveTextContent(SITE_B.name);
    // Kilitli hücre artık sabit "—" değil, kayıtlı miktarı gösterir.
    expect(screen.getByText("150")).toBeInTheDocument();
  });

  it("hiçbir hücrenin tahsisi kaldırılmamışsa uyarı bandı basılmaz", async () => {
    renderForm({ mode: "create", projectId: PROJECT_ID });
    await screen.findByText("İşveren Hakediş Oluştur");
    expect(screen.queryByTestId("pp-form-orphaned-alert")).not.toBeInTheDocument();
  });
});

describe("ProgressPaymentForm — hata gösterimi (Türkçe, hiçbiri sessiz değil)", () => {
  function backendError(status: number, detail: string) {
    return new BackendError(status, { detail });
  }

  it("409 — açık hakediş var mesajını gösterir (create)", async () => {
    const mutate = vi.fn((_vars, opts) =>
      opts?.onError?.(backendError(409, "Bu sözleşmede açık bir hakediş var; önce onu tamamlayın.")),
    );
    vi.mocked(useCreateProgressPayment).mockReturnValue(mutationResult({ mutate }));
    renderForm({ mode: "create", projectId: PROJECT_ID });
    const [saveButton] = await screen.findAllByRole("button", { name: "Taslak Kaydet" });
    await userEvent.click(saveButton);
    expect(
      await screen.findByText("Bu sözleşmede açık bir hakediş var; önce onu tamamlayın."),
    ).toBeInTheDocument();
  });

  it("422 — kota aşımı mesajını gösterir (edit, PUT lines hatası)", async () => {
    const updateMutate = vi.fn((_vars, opts) => opts?.onSuccess?.());
    const replaceMutate = vi.fn((_vars, opts) =>
      opts?.onError?.(backendError(422, "Kümülatif hakediş miktarı şantiye kotasını aşamaz.")),
    );
    vi.mocked(useProgressPayment).mockReturnValue(queryResult({ data: detailFixture() }));
    vi.mocked(useUpdateProgressPayment).mockReturnValue(mutationResult({ mutate: updateMutate }));
    vi.mocked(useReplaceProgressPaymentLines).mockReturnValue(mutationResult({ mutate: replaceMutate }));
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    const [saveButton] = await screen.findAllByRole("button", { name: "Taslak Kaydet" });
    await userEvent.click(saveButton);
    expect(
      await screen.findByText("Kümülatif hakediş miktarı şantiye kotasını aşamaz."),
    ).toBeInTheDocument();
  });

  // no 179 — PATCH (başlık) başarılı olduktan SONRA PUT (satırlar) patlarsa
  // başlık zaten sunucuda kaydedilmiş, geri alma YOKTUR; kullanıcı bu KISMİ
  // durumu görmeli.
  it("PATCH başarılı + PUT hatalı: başlığın kaydedildiği AYRI bir bantla görünür olur", async () => {
    const updateMutate = vi.fn((_vars, opts) => opts?.onSuccess?.());
    const replaceMutate = vi.fn((_vars, opts) =>
      opts?.onError?.(backendError(422, "Kümülatif hakediş miktarı şantiye kotasını aşamaz.")),
    );
    vi.mocked(useProgressPayment).mockReturnValue(queryResult({ data: detailFixture() }));
    vi.mocked(useUpdateProgressPayment).mockReturnValue(mutationResult({ mutate: updateMutate }));
    vi.mocked(useReplaceProgressPaymentLines).mockReturnValue(mutationResult({ mutate: replaceMutate }));
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    const [saveButton] = await screen.findAllByRole("button", { name: "Taslak Kaydet" });
    await userEvent.click(saveButton);
    expect(await screen.findByTestId("pp-form-header-saved-lines-failed")).toHaveTextContent(
      "başlığı KAYDEDİLDİ",
    );
  });

  it("422 — dağıtılmamış poz mesajını gösterir", async () => {
    const mutate = vi.fn((_vars, opts) =>
      opts?.onError?.(
        backendError(422, "Bu poz seçilen şantiyeye dağıtılmadı; önce poz dağılımını yapın."),
      ),
    );
    vi.mocked(useCreateProgressPayment).mockReturnValue(mutationResult({ mutate }));
    renderForm({ mode: "create", projectId: PROJECT_ID });
    const [saveButton] = await screen.findAllByRole("button", { name: "Taslak Kaydet" });
    await userEvent.click(saveButton);
    expect(
      await screen.findByText("Bu poz seçilen şantiyeye dağıtılmadı; önce poz dağılımını yapın."),
    ).toBeInTheDocument();
  });

  it("422 — çift satır mesajını gösterir", async () => {
    const mutate = vi.fn((_vars, opts) =>
      opts?.onError?.(backendError(422, "Aynı poz ve şantiye için tek satır gönderilebilir.")),
    );
    vi.mocked(useCreateProgressPayment).mockReturnValue(mutationResult({ mutate }));
    renderForm({ mode: "create", projectId: PROJECT_ID });
    const [saveButton] = await screen.findAllByRole("button", { name: "Taslak Kaydet" });
    await userEvent.click(saveButton);
    expect(
      await screen.findByText("Aynı poz ve şantiye için tek satır gönderilebilir."),
    ).toBeInTheDocument();
  });

  it("422 — sözleşmesiz proje mesajını gösterir (sözleşme sorgusu hatası)", async () => {
    vi.mocked(useEmployerContract).mockReturnValue(
      queryResult({ isError: true, error: backendError(422, "Bu projenin işveren sözleşmesi yok.") }),
    );
    renderForm({ mode: "create", projectId: PROJECT_ID });
    expect(await screen.findByText("Bu projenin işveren sözleşmesi yok.")).toBeInTheDocument();
  });

  it("403 — AccessDenied basar (dağıtım sorgusu yasak)", async () => {
    vi.mocked(useContractDistribution).mockReturnValue(
      queryResult({ isError: true, error: backendError(403, "yetkiniz yok") }),
    );
    renderForm({ mode: "create", projectId: PROJECT_ID });
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });
});

// F-SD T5 · "Günlükten Doldur" (spec §4). Öneri ucu ekran açılışında ÇAĞRILMAZ;
// buton `refetch` ile çağırır ve satırları doldurur — kaydetme yolu DEĞİŞMEZ.
describe("ProgressPaymentForm — Günlükten Doldur", () => {
  function mockSuggestion(
    result: Partial<{ data: unknown; error: unknown }>,
  ): ReturnType<typeof vi.fn> {
    const refetch = vi.fn().mockResolvedValue({ error: null, ...result });
    vi.mocked(useEmployerDiarySuggestion).mockReturnValue({ refetch } as never);
    return refetch;
  }

  function suggestionData(overrides: Record<string, unknown> = {}) {
    return {
      year: 2026,
      month: 7,
      skipped_unbridged_count: 0,
      reason: null,
      project_id: PROJECT_ID,
      lines: [
        { contract_item_id: "item-1", site_id: SITE_A.id, quantity: "320.000", coefficient: null },
      ],
      ...overrides,
    };
  }

  it("önerilen miktarı hücreye yazar", async () => {
    mockSuggestion({ data: suggestionData() });
    renderForm({ mode: "create", projectId: PROJECT_ID });
    await screen.findByText("İşveren Hakediş Oluştur");

    await userEvent.click(screen.getByTestId("pp-form-diary-fill"));

    expect(await screen.findByTestId("pp-form-diary-fill-notice")).toHaveTextContent(
      "1 satır günlük kayıtlardan dolduruldu.",
    );
    expect(screen.getByLabelText(`${ITEM_1.description} — ${SITE_A.name} miktar`)).toHaveValue(
      "320",
    );
  });

  // F-P10 T2 · rozet göçü (KARAR S1): rozet artık OTURUM-İÇİ türetmeden değil
  // SUNUCU damgasından (`quantity_source`) okunur — kaydedilmemiş doldurma
  // rozet BASMAZ, sunucu kaydederken damgayı kendisi koyar.
  it("kaydedilmemiş doldurma rozet BASMAZ (damga sunucudan gelir)", async () => {
    mockSuggestion({ data: suggestionData() });
    renderForm({ mode: "create", projectId: PROJECT_ID });
    await screen.findByText("İşveren Hakediş Oluştur");

    await userEvent.click(screen.getByTestId("pp-form-diary-fill"));

    expect(await screen.findByTestId("pp-form-diary-fill-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("pp-form-diary-note")).not.toBeInTheDocument();
  });

  it("atlanan (köprülenmemiş) poz sayısını görünür şekilde bildirir", async () => {
    mockSuggestion({ data: suggestionData({ skipped_unbridged_count: 2 }) });
    renderForm({ mode: "create", projectId: PROJECT_ID });
    await screen.findByText("İşveren Hakediş Oluştur");

    await userEvent.click(screen.getByTestId("pp-form-diary-fill"));

    expect(await screen.findByTestId("pp-form-diary-fill-notice")).toHaveTextContent(
      "2 günlük pozu sözleşme kalemine bağlı olmadığı için atlandı",
    );
  });

  it("boş öneride görünür gerekçe basar, satırlara dokunmaz", async () => {
    mockSuggestion({
      data: suggestionData({ lines: [], reason: "Seçilen dönemde köprülenmiş günlük kaydı yok." }),
    });
    renderForm({ mode: "create", projectId: PROJECT_ID });
    await screen.findByText("İşveren Hakediş Oluştur");

    await userEvent.click(screen.getByTestId("pp-form-diary-fill"));

    const notice = await screen.findByTestId("pp-form-diary-fill-notice");
    expect(notice).toHaveTextContent("Günlük kayıtlardan doldurulacak miktar bulunamadı.");
    expect(notice).toHaveTextContent("Seçilen dönemde köprülenmiş günlük kaydı yok.");
  });

  it("uç hata verirse Türkçe gerekçe basar", async () => {
    mockSuggestion({
      data: undefined,
      error: new BackendError(403, { detail: "Bu projeye yetkiniz yok." }),
    });
    renderForm({ mode: "create", projectId: PROJECT_ID });
    await screen.findByText("İşveren Hakediş Oluştur");

    await userEvent.click(screen.getByTestId("pp-form-diary-fill"));

    expect(await screen.findByTestId("pp-form-diary-fill-notice")).toHaveTextContent(
      "Bu projeye yetkiniz yok.",
    );
  });

  it("elle girilmiş miktarın üzerine yazmadan ÖNCE onay ister; vazgeçilirse değer korunur", async () => {
    mockSuggestion({ data: suggestionData() });
    renderForm({ mode: "create", projectId: PROJECT_ID });
    await screen.findByText("İşveren Hakediş Oluştur");
    const input = screen.getByLabelText(`${ITEM_1.description} — ${SITE_A.name} miktar`);
    await userEvent.clear(input);
    await userEvent.type(input, "12");

    await userEvent.click(screen.getByTestId("pp-form-diary-fill"));

    expect(await screen.findByText(/1 satırda elle girdiğiniz sıfırdan farklı miktar var/)).
      toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.getByLabelText(`${ITEM_1.description} — ${SITE_A.name} miktar`)).toHaveValue("12");
  });

  it("onay verilirse üzerine yazar ve kaç satırın üzerine yazıldığını söyler", async () => {
    mockSuggestion({ data: suggestionData() });
    renderForm({ mode: "create", projectId: PROJECT_ID });
    await screen.findByText("İşveren Hakediş Oluştur");
    const input = screen.getByLabelText(`${ITEM_1.description} — ${SITE_A.name} miktar`);
    await userEvent.clear(input);
    await userEvent.type(input, "12");
    await userEvent.click(screen.getByTestId("pp-form-diary-fill"));
    await screen.findByText(/1 satırda elle girdiğiniz sıfırdan farklı miktar var/);

    await userEvent.click(screen.getByRole("button", { name: "Üzerine yaz" }));

    expect(screen.getByLabelText(`${ITEM_1.description} — ${SITE_A.name} miktar`)).toHaveValue(
      "320",
    );
    expect(await screen.findByTestId("pp-form-diary-fill-notice")).toHaveTextContent(
      "1 satırda elle girdiğiniz miktarın üzerine yazıldı.",
    );
  });

  it("dolan miktarlar MEVCUT kaydetme yolundan (PUT lines) gönderilir", async () => {
    const replaceMutate = vi.fn();
    vi.mocked(useProgressPayment).mockReturnValue(queryResult({ data: detailFixture() }));
    vi.mocked(useUpdateProgressPayment).mockReturnValue(
      mutationResult({
        mutate: vi.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
      }),
    );
    vi.mocked(useReplaceProgressPaymentLines).mockReturnValue(
      mutationResult({ mutate: replaceMutate }),
    );
    mockSuggestion({ data: suggestionData() });
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    await screen.findByText("İşveren Hakediş #5");
    await userEvent.click(screen.getByTestId("pp-form-diary-fill"));
    await screen.findByTestId("pp-form-diary-fill-notice");

    await userEvent.click(screen.getAllByRole("button", { name: "Taslak Kaydet" })[0]);

    const body = replaceMutate.mock.calls[0][0] as {
      body: { lines: { contract_item_id: string; site_id: string; quantity: string }[] };
    };
    expect(body.body.lines).toContainEqual({
      contract_item_id: "item-1",
      site_id: SITE_A.id,
      quantity: "320",
    });
  });
});

/**
 * SEKME-F1.3-FIX O4 · `dirty` yalnız hücre miktarı ve "Günlükten Doldur"
 * ile açılıyordu; açıklama/dönem/katsayı gibi başlık alanları değişince
 * üst çubuk sekme onayı bu ekranı "temiz" sanıyordu (sessiz veri kaybı
 * riski). Kayda giden ifade artık başlangıç değeriyle (seed) karşılaştırır.
 */
describe("ProgressPaymentForm — üst çubuk kaydı (unsavedRegistry) başlık alanları", () => {
  afterEach(() => {
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("yalnız açıklama değişince kayıt 'kirli' olur", async () => {
    vi.mocked(useProgressPayment).mockReturnValue(queryResult({ data: detailFixture() }));
    const { unmount } = renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    await screen.findByText("İşveren Hakediş #5");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await userEvent.type(screen.getByLabelText("Açıklama"), " ek not");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    unmount();
  });

  it("yalnız katsayı değişince kayıt 'kirli' olur", async () => {
    vi.mocked(useProgressPayment).mockReturnValue(queryResult({ data: detailFixture() }));
    const { unmount } = renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    await screen.findByText("İşveren Hakediş #5");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await userEvent.clear(screen.getByLabelText("Katsayı (Dn/D0)"));
    await userEvent.type(screen.getByLabelText("Katsayı (Dn/D0)"), "1.05");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    unmount();
  });

  it("yalnız dönem (ay) değişince kayıt 'kirli' olur", async () => {
    vi.mocked(useProgressPayment).mockReturnValue(queryResult({ data: detailFixture() }));
    const { unmount } = renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    await screen.findByText("İşveren Hakediş #5");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await userEvent.selectOptions(screen.getByLabelText("Hakediş Dönemi"), "8");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    unmount();
  });

  it("başlık değişikliğiyle kaydetme başarılı olunca kayıt tekrar temiz olur", async () => {
    const updateMutate = vi.fn((_vars, opts) => opts?.onSuccess?.());
    const replaceMutate = vi.fn((_vars, opts) => opts?.onSuccess?.());
    vi.mocked(useProgressPayment).mockReturnValue(queryResult({ data: detailFixture() }));
    vi.mocked(useUpdateProgressPayment).mockReturnValue(mutationResult({ mutate: updateMutate }));
    vi.mocked(useReplaceProgressPaymentLines).mockReturnValue(mutationResult({ mutate: replaceMutate }));

    const { unmount } = renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    await screen.findByText("İşveren Hakediş #5");

    await userEvent.type(screen.getByLabelText("Açıklama"), " ek not");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    await userEvent.click(screen.getAllByRole("button", { name: "Taslak Kaydet" })[0]);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    unmount();
  });
});

/**
 * TKL-F8 (T30/T43) · İŞVEREN hakediş miktarı ve katsayısı TÜRKÇE okunur: nokta binlik, virgül
 * ondalık; belirsiz "1.5"/"0.500" reddedilir. Eskiden `sanitizeQuantityInput` virgülü SİLİYORDU
 * ("3,5" → 35 kaydı = sessiz 10× hata). Gövdeye nokta-ondalık METİN gider (Number() turu yok).
 */
describe("ProgressPaymentForm — T30 Türkçe sayı kuralı (TKL-F8)", () => {
  const CELL_A = `${ITEM_1.description} — ${SITE_A.name} miktar`;
  const CELL_B = `${ITEM_1.description} — ${SITE_B.name} miktar`;
  const AMBIGUOUS = "Ondalık için virgül kullanın (ör. 28,50)";

  function savedLine(overrides: Record<string, unknown> = {}) {
    return {
      id: "line-1",
      contract_item_id: ITEM_1.id,
      site_id: SITE_A.id,
      code: ITEM_1.code,
      description: ITEM_1.description,
      unit: ITEM_1.unit,
      contract_unit_price: ITEM_1.unit_price,
      coefficient: "1.000",
      quantity: "12.500",
      group_name: "A — Betonarme İşleri",
      sort_order: 0,
      adjusted_unit_price: ITEM_1.unit_price,
      line_total: "23125.00",
      previous_quantity: "0.000",
      previous_amount: "0.00",
      cumulative_quantity: "12.500",
      cumulative_amount: "23125.00",
      is_price_stale: false,
      ...overrides,
    };
  }

  function lineOf(mutate: ReturnType<typeof vi.fn>, itemId: string, siteId: string) {
    const lines = mutate.mock.calls[0][0].body.lines;
    return lines.find(
      (l: { contract_item_id: string; site_id: string }) =>
        l.contract_item_id === itemId && l.site_id === siteId,
    );
  }

  async function saveCreate(mutate: ReturnType<typeof vi.fn>) {
    vi.mocked(useCreateProgressPayment).mockReturnValue(mutationResult({ mutate }));
    renderForm({ mode: "create", projectId: PROJECT_ID });
    await screen.findByText("İşveren Hakediş Oluştur");
  }

  async function typeInto(label: string, text: string) {
    const input = screen.getByLabelText(label);
    await userEvent.clear(input);
    await userEvent.type(input, text);
    return input;
  }

  async function clickSave() {
    await userEvent.click(screen.getAllByRole("button", { name: "Taslak Kaydet" })[0]);
  }

  it("'3,5' virgül ondalıktır: hücre '3,5' kalır, gövdeye '3.5' gider (35 DEĞİL)", async () => {
    const mutate = vi.fn();
    await saveCreate(mutate);
    const input = await typeInto(CELL_A, "3,5");
    expect(input).toHaveValue("3,5");
    await clickSave();
    expect(lineOf(mutate, ITEM_1.id, SITE_A.id).quantity).toBe("3.5");
  });

  it("'1.234,5' binlik + ondalık: gövdeye '1234.5' gider", async () => {
    const mutate = vi.fn();
    await saveCreate(mutate);
    await typeInto(CELL_A, "1.234,5");
    await clickSave();
    expect(lineOf(mutate, ITEM_1.id, SITE_A.id).quantity).toBe("1234.5");
  });

  it("'0.500' belirsizdir: görünür hata, istek GİTMEZ, role=alert YOK", async () => {
    const mutate = vi.fn();
    await saveCreate(mutate);
    await typeInto(CELL_A, "0.500");
    await clickSave();
    expect(mutate).not.toHaveBeenCalled();
    expect(await screen.findByText(AMBIGUOUS)).toBeVisible();
    expect(screen.queryByRole("alert", { name: AMBIGUOUS })).not.toBeInTheDocument();
    expect(screen.getByLabelText(CELL_A)).toHaveAttribute("aria-invalid", "true");
  });

  it("hatalı hücre düzeltilince hata kalkar ve istek gider", async () => {
    const mutate = vi.fn();
    await saveCreate(mutate);
    await typeInto(CELL_A, "1.5");
    await clickSave();
    expect(await screen.findByText(AMBIGUOUS)).toBeVisible();
    await typeInto(CELL_A, "1,5");
    expect(screen.queryByText(AMBIGUOUS)).not.toBeInTheDocument();
    await clickSave();
    expect(lineOf(mutate, ITEM_1.id, SITE_A.id).quantity).toBe("1.5");
  });

  it("4 ondalık ve 12 basamak sınırları işveren sözleşme kalemiyle AYNI metni verir", async () => {
    const mutate = vi.fn();
    await saveCreate(mutate);
    await typeInto(CELL_A, "1,2345");
    await clickSave();
    expect(await screen.findByText("En fazla 3 ondalık")).toBeVisible();
    await typeInto(CELL_A, "123456789012");
    await clickSave();
    expect(await screen.findByText("En fazla 11 basamak")).toBeVisible();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("boş hücre '0' gider, '0,000' de '0' (0 hakedişte meşrudur)", async () => {
    const mutate = vi.fn();
    await saveCreate(mutate);
    await userEvent.clear(screen.getByLabelText(CELL_A));
    await typeInto(CELL_B, "0,000");
    await clickSave();
    expect(lineOf(mutate, ITEM_1.id, SITE_A.id).quantity).toBe("0");
    expect(lineOf(mutate, ITEM_1.id, SITE_B.id).quantity).toBe("0");
  });

  it("yazarken harf/işaret süzülür, tek virgül kalır, nokta korunur", async () => {
    await saveCreate(vi.fn());
    const input = await typeInto(CELL_A, "12a-3,5,6");
    expect(input).toHaveValue("123,56");
  });

  it("sunucu '12.500' → hücre '12,5'; '3200.000' → '3.200'; dokunmadan kaydet '12.5' (12500 DEĞİL), form kirli değil", async () => {
    const updateMutate = vi.fn((_vars, opts) => opts?.onSuccess?.());
    const replaceMutate = vi.fn();
    vi.mocked(useProgressPayment).mockReturnValue(
      queryResult({
        data: detailFixture({
          lines: [
            savedLine(),
            savedLine({ id: "line-2", site_id: SITE_B.id, quantity: "3200.000" }),
          ] as never,
        }),
      }),
    );
    vi.mocked(useUpdateProgressPayment).mockReturnValue(mutationResult({ mutate: updateMutate }));
    vi.mocked(useReplaceProgressPaymentLines).mockReturnValue(mutationResult({ mutate: replaceMutate }));
    const { unmount } = renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    await screen.findByText("İşveren Hakediş #5");
    expect(screen.getByLabelText(CELL_A)).toHaveValue("12,5");
    expect(screen.getByLabelText(CELL_B)).toHaveValue("3.200");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await clickSave();
    const lines = replaceMutate.mock.calls[0][0].body.lines;
    expect(lines).toContainEqual({ contract_item_id: ITEM_1.id, site_id: SITE_A.id, quantity: "12.5" });
    expect(lines).toContainEqual({ contract_item_id: ITEM_1.id, site_id: SITE_B.id, quantity: "3200" });
    unmount();
  });

  it("satır toplamı Türkçe hücre metnini doğru okur: '1.234,5' + '3,5' → 1.238", async () => {
    await saveCreate(vi.fn());
    await typeInto(CELL_A, "1.234,5");
    await typeInto(CELL_B, "3,5");
    const row = screen.getByText(ITEM_1.code).closest("tr") as HTMLElement;
    expect(row.querySelector(".pp-table__cell--total")).toHaveTextContent(/^1\.238$/);
  });

  it("okunamayan hücre toplamda 0 sayılır (uydurma değer yok), diğer hücre toplanır", async () => {
    await saveCreate(vi.fn());
    await typeInto(CELL_A, "0.500");
    await typeInto(CELL_B, "3,5");
    const row = screen.getByText(ITEM_1.code).closest("tr") as HTMLElement;
    expect(row.querySelector(".pp-table__cell--total")).toHaveTextContent(/^3,5$/);
  });

  it("günlükten doldurulan '1234.500' hücrede '1.234,5' görünür ve '1234.5' kaydedilir", async () => {
    const refetch = vi.fn().mockResolvedValue({
      error: null,
      data: {
        year: 2026,
        month: 7,
        skipped_unbridged_count: 0,
        reason: null,
        project_id: PROJECT_ID,
        lines: [
          { contract_item_id: "item-1", site_id: SITE_A.id, quantity: "1234.500", coefficient: null },
        ],
      },
    });
    vi.mocked(useEmployerDiarySuggestion).mockReturnValue({ refetch } as never);
    const mutate = vi.fn();
    await saveCreate(mutate);
    await userEvent.click(screen.getByTestId("pp-form-diary-fill"));
    await screen.findByTestId("pp-form-diary-fill-notice");
    expect(screen.getByLabelText(CELL_A)).toHaveValue("1.234,5");
    await clickSave();
    expect(lineOf(mutate, ITEM_1.id, SITE_A.id).quantity).toBe("1234.5");
  });

  it("tahsisi kaldırılmış kayıtlı hücre uyarısı Türkçe miktarı bozmadan gösterir", async () => {
    vi.mocked(useContractDistribution).mockReturnValue(
      queryResult({
        data: distributionFixture({
          groups: [
            {
              id: "g-1",
              name: "A — Betonarme İşleri",
              sort_order: 10,
              items: [{ ...ITEM_1, allocations: [ITEM_1.allocations[0]] }, ITEM_2],
            },
          ],
        }),
      }),
    );
    vi.mocked(useProgressPayment).mockReturnValue(
      queryResult({
        data: detailFixture({
          lines: [savedLine({ site_id: SITE_B.id, quantity: "1234.500" })] as never,
        }),
      }),
    );
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    const alert = await screen.findByTestId("pp-form-orphaned-alert");
    expect(alert).toHaveTextContent("(1.234,5)");
  });

  it("günlükten doldurma hücreyi DEĞİŞTİRİNCE o hücrenin hatası kalkar; değişmeyenin hatası kalır", async () => {
    const refetch = vi.fn().mockResolvedValue({
      error: null,
      data: {
        year: 2026,
        month: 7,
        skipped_unbridged_count: 0,
        reason: null,
        project_id: PROJECT_ID,
        lines: [{ contract_item_id: "item-1", site_id: SITE_A.id, quantity: "320.000", coefficient: null }],
      },
    });
    vi.mocked(useEmployerDiarySuggestion).mockReturnValue({ refetch } as never);
    const mutate = vi.fn();
    await saveCreate(mutate);
    await typeInto(CELL_A, "1.5");
    await typeInto(CELL_B, "0.500");
    await clickSave();
    expect(await screen.findAllByText(AMBIGUOUS)).toHaveLength(2);

    await userEvent.click(screen.getByTestId("pp-form-diary-fill"));
    await userEvent.click(await screen.findByRole("button", { name: "Üzerine yaz" }));

    expect(screen.getByLabelText(CELL_A)).toHaveValue("320");
    expect(screen.getByLabelText(CELL_A)).not.toHaveAttribute("aria-invalid");
    expect(screen.getAllByText(AMBIGUOUS)).toHaveLength(1);
    expect(screen.getByLabelText(CELL_B)).toHaveAttribute("aria-invalid", "true");
  });

  it("Fiyatları Tazele satırları yeniden kurunca TÜM hücre hataları temizlenir", async () => {
    const refreshMutate = vi.fn((_id, opts) => opts?.onSuccess?.());
    const detail = detailFixture({ lines: [savedLine()] as never });
    vi.mocked(useProgressPayment).mockReturnValue(
      queryResult({ data: detail, refetch: vi.fn().mockResolvedValue({ data: detail }) } as never),
    );
    vi.mocked(useRefreshProgressPaymentPrices).mockReturnValue(mutationResult({ mutate: refreshMutate }));
    renderForm({ mode: "edit", paymentId: PAYMENT_ID });
    await screen.findByText("İşveren Hakediş #5");
    await typeInto(CELL_A, "0.500");
    await clickSave();
    expect(await screen.findByText(AMBIGUOUS)).toBeVisible();

    await userEvent.click(screen.getByTestId("pp-form-refresh-prices"));
    await userEvent.click(await screen.findByRole("button", { name: "Tazele" }));

    expect(await screen.findByLabelText(CELL_A)).toHaveValue("12,5");
    expect(screen.queryByText(AMBIGUOUS)).not.toBeInTheDocument();
    expect(screen.getByLabelText(CELL_A)).not.toHaveAttribute("aria-invalid");
  });

  describe("katsayı", () => {
    const COEFFICIENT = "Katsayı (Dn/D0)";

    function pctLabel(): HTMLElement {
      return document.querySelector(".pp-form__ff-pct") as HTMLElement;
    }

    function headerCoefficient(mutate: ReturnType<typeof vi.fn>): string {
      return mutate.mock.calls[0][0].body.default_coefficient;
    }

    it("'1,05' → gövdeye '1.05'; yüzde etiketi %5", async () => {
      const mutate = vi.fn();
      await saveCreate(mutate);
      await typeInto(COEFFICIENT, "1,05");
      expect(pctLabel()).toHaveTextContent(/^%5$/);
      await clickSave();
      expect(headerCoefficient(mutate)).toBe("1.05");
    });

    it("'1.052' → 'Katsayı çok büyük' (1052 okunmaz), istek yok", async () => {
      const mutate = vi.fn();
      await saveCreate(mutate);
      await typeInto(COEFFICIENT, "1.052");
      await clickSave();
      expect(mutate).not.toHaveBeenCalled();
      expect(await screen.findByText("Katsayı çok büyük, ondalık için virgül kullanın")).toBeVisible();
    });

    it("'1.5' belirsiz → REF_PRICE_AMBIGUOUS_DOT", async () => {
      const mutate = vi.fn();
      await saveCreate(mutate);
      await typeInto(COEFFICIENT, "1.5");
      await clickSave();
      expect(mutate).not.toHaveBeenCalled();
      expect(await screen.findByText(AMBIGUOUS)).toBeVisible();
    });

    it("'1,0523' → 'En fazla 3 ondalık'", async () => {
      const mutate = vi.fn();
      await saveCreate(mutate);
      await typeInto(COEFFICIENT, "1,0523");
      await clickSave();
      expect(mutate).not.toHaveBeenCalled();
      expect(await screen.findByText("En fazla 3 ondalık")).toBeVisible();
    });

    it("'0' → 'Katsayı sıfırdan büyük olmalıdır'", async () => {
      const mutate = vi.fn();
      await saveCreate(mutate);
      await typeInto(COEFFICIENT, "0");
      await clickSave();
      expect(mutate).not.toHaveBeenCalled();
      expect(await screen.findByText("Katsayı sıfırdan büyük olmalıdır")).toBeVisible();
    });

    it("boş katsayı '1' gider (mevcut davranış)", async () => {
      const mutate = vi.fn();
      await saveCreate(mutate);
      await userEvent.clear(screen.getByLabelText(COEFFICIENT));
      await clickSave();
      expect(headerCoefficient(mutate)).toBe("1");
    });

    it("sunucu '1.050' → '1,05' + %5 etiketi; dokunmadan kaydet '1.05'; form kirli değil", async () => {
      const updateMutate = vi.fn();
      vi.mocked(useProgressPayment).mockReturnValue(
        queryResult({ data: detailFixture({ default_coefficient: "1.050" }) }),
      );
      vi.mocked(useUpdateProgressPayment).mockReturnValue(mutationResult({ mutate: updateMutate }));
      const { unmount } = renderForm({ mode: "edit", paymentId: PAYMENT_ID });
      await screen.findByText("İşveren Hakediş #5");
      expect(screen.getByLabelText(COEFFICIENT)).toHaveValue("1,05");
      expect(pctLabel()).toHaveTextContent(/^%5$/);
      expect(unsavedRegistry.hasUnsaved()).toBe(false);
      await clickSave();
      expect(updateMutate.mock.calls[0][0].body.default_coefficient).toBe("1.05");
      unmount();
    });

    it("kilitli (fiyat farkı yok) katsayı '1' gider, hata üretmez", async () => {
      vi.mocked(useEmployerContract).mockReturnValue(
        queryResult({ data: contractFixture({ has_price_escalation: false }) }),
      );
      const mutate = vi.fn();
      await saveCreate(mutate);
      await clickSave();
      expect(headerCoefficient(mutate)).toBe("1");
    });
  });
});
