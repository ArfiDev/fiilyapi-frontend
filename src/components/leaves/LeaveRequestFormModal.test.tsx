import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { useUploadDocument } from "@/lib/api/hooks/useDocumentMutations";
import { useCreateLeaveRequest } from "@/lib/api/hooks/useLeaveMutations";
import {
  useHrLeavesSummary,
  useLeaveTypes,
  type HrLeavesSummaryResponse,
  type LeaveBalanceResponse,
  type LeaveTypeResponse,
} from "@/lib/api/hooks/useLeaves";
import { usePersonnel, type PersonnelListItem } from "@/lib/api/hooks/usePersonnel";
import { BackendError } from "@/lib/api/unwrap";

import { LeaveRequestFormModal } from "./LeaveRequestFormModal";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

/**
 * F-IZN T4 · `Form - Izin Talebi.dc.html` diyaloğu.
 *
 * 🔴 AYRIŞMA NOKTASI: her koşulun (belge zorunluluğu, `deducts_from_annual`,
 * `remaining === null`) HEM açık HEM kapalı hâli sınanır; tek yönlü sınanan
 * bir koşul, koşulu tümüyle silen bir uygulamayı da geçirirdi.
 */
vi.mock("@/lib/api/hooks/usePersonnel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePersonnel")>()),
  usePersonnel: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useLeaves", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useLeaves")>()),
  useHrLeavesSummary: vi.fn(),
  useLeaveTypes: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useLeaveMutations", () => ({ useCreateLeaveRequest: vi.fn() }));
vi.mock("@/lib/api/hooks/useDocumentMutations", () => ({ useUploadDocument: vi.fn() }));

const createAsync = vi.fn();
const uploadAsync = vi.fn();

function person(overrides: Partial<PersonnelListItem> = {}): PersonnelListItem {
  return {
    id: "per-1",
    full_name: "Hasan Çelik",
    trade: "Elektrikçi",
    source: "company",
    subcontractor_id: null,
    user_id: null,
    is_active: true,
    tc_no: null,
    birth_date: null,
    gender: null,
    marital_status: null,
    phone: null,
    email: null,
    address: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    hire_date: "2024-01-15",
    wage_type: null,
    wage_amount: null,
    payment_method: null,
    iban: null,
    sgk_no: null,
    assigned_project_id: "prj-1",
    assigned_section_id: null,
    is_draft: false,
    ...overrides,
  } as PersonnelListItem;
}

function balance(overrides: Partial<LeaveBalanceResponse> = {}): LeaveBalanceResponse {
  return {
    personnel_id: "per-1",
    personnel_name: "Hasan Çelik",
    year: 2026,
    hire_date: "2024-01-15",
    seniority_years: 1,
    seniority_months: 6,
    annual_entitlement: 14,
    carried_over: "6",
    used: 12,
    remaining: "8",
    usage_pct: 60,
    ...overrides,
  };
}

function leaveType(overrides: Partial<LeaveTypeResponse> = {}): LeaveTypeResponse {
  return {
    id: "lt-1",
    name: "Yıllık İzin",
    deducts_from_annual: true,
    is_paid: true,
    requires_document: false,
    color: "#2563eb",
    sort_order: 1,
    ...overrides,
  };
}

const SICK_TYPE = leaveType({
  id: "lt-2",
  name: "Hastalık İzni (Raporlu)",
  deducts_from_annual: false,
  requires_document: true,
  color: "#dc2626",
  sort_order: 2,
});

function setup(
  options: {
    personnel?: PersonnelListItem[];
    balances?: LeaveBalanceResponse[];
    types?: LeaveTypeResponse[];
    personnelError?: boolean;
    typesError?: boolean;
  } = {},
) {
  vi.mocked(usePersonnel).mockReturnValue({
    data: { items: options.personnel ?? [person()], total: 1, limit: 200, offset: 0 },
    isError: options.personnelError ?? false,
  } as unknown as ReturnType<typeof usePersonnel>);
  vi.mocked(useLeaveTypes).mockReturnValue({
    data: options.types ?? [leaveType(), SICK_TYPE],
    isError: options.typesError ?? false,
  } as unknown as ReturnType<typeof useLeaveTypes>);
  vi.mocked(useHrLeavesSummary).mockReturnValue({
    data: { balances: options.balances ?? [balance()] } as HrLeavesSummaryResponse,
    isError: false,
  } as unknown as ReturnType<typeof useHrLeavesSummary>);
}

async function fillBase(user: ReturnType<typeof userEvent.setup>, typeId = "lt-1") {
  await user.selectOptions(screen.getByTestId("iz-request-personnel"), "per-1");
  await user.selectOptions(screen.getByTestId("iz-request-type"), typeId);
  await user.type(screen.getByTestId("iz-request-start"), "24.08.2026");
  await user.type(screen.getByTestId("iz-request-end"), "26.08.2026");
}

beforeEach(() => {
  vi.clearAllMocks();
  createAsync.mockResolvedValue({ id: "lr-9" });
  uploadAsync.mockResolvedValue({ id: "doc-1" });
  vi.mocked(useCreateLeaveRequest).mockReturnValue({
    mutateAsync: createAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateLeaveRequest>);
  vi.mocked(useUploadDocument).mockReturnValue({
    mutateAsync: uploadAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useUploadDocument>);
  setup();
});

describe("LeaveRequestFormModal — gövde (T 79-181)", () => {
  it("personel seçilmeden hak özeti kartı BASILMAZ (92-106)", async () => {
    const user = userEvent.setup();
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);

    expect(screen.queryByTestId("iz-request-balance")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByTestId("iz-request-personnel"), "per-1");
    const card = screen.getByTestId("iz-request-balance");
    expect(card).toHaveTextContent("Kıdem: 1 yıl 6 ay");
    expect(card).toHaveTextContent("14"); // Yıllık Hak
    expect(card).toHaveTextContent("6"); // Devreden
    expect(card).toHaveTextContent("12"); // Kullanılan
    expect(screen.getByTestId("iz-request-remaining")).toHaveTextContent("8");
  });

  it("hakkı hesaplanamayan personelde '—' ve 'Hak yok' basılır, 0 BASILMAZ", async () => {
    setup({
      balances: [balance({ annual_entitlement: null, remaining: null, carried_over: "0" })],
    });
    const user = userEvent.setup();
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);
    await user.selectOptions(screen.getByTestId("iz-request-personnel"), "per-1");

    expect(screen.getByTestId("iz-request-remaining")).toHaveTextContent("Hak yok");
    expect(screen.getByTestId("iz-request-remaining")).not.toHaveTextContent("0");
  });

  it("bakiye kaydı yoksa sahte sayı yerine gerekçe basılır", async () => {
    setup({ balances: [] });
    const user = userEvent.setup();
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);
    await user.selectOptions(screen.getByTestId("iz-request-personnel"), "per-1");

    expect(screen.getByTestId("iz-request-no-balance")).toBeVisible();
  });

  it("🔴 KARŞILIKSIZ ALAN · personel seçeneği ŞANTİYE adı UYDURMAZ (84-87)", () => {
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);

    const option = screen.getByRole("option", { name: "Hasan Çelik — Elektrikçi" });
    expect(option).toBeInTheDocument();
  });

  it("gün alanı TÜRETİLİR ve salt-okunurdur (141-145 · KARAR 1)", async () => {
    const user = userEvent.setup();
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);
    await user.type(screen.getByTestId("iz-request-start"), "24.08.2026");
    await user.type(screen.getByTestId("iz-request-end"), "04.09.2026");

    const days = screen.getByTestId("iz-request-days");
    expect(days).toHaveValue("12");
    expect(days).toHaveAttribute("readonly");
  });

  it("izin tipi rozetleri sunucu renginden çizilir, seçili olan VURGULANIR (120-127)", async () => {
    const user = userEvent.setup();
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);
    await user.selectOptions(screen.getByTestId("iz-request-type"), "lt-2");

    const badges = screen.getByTestId("iz-request-type-badges");
    expect(badges).toHaveTextContent("Hastalık İzni (Raporlu)");
    // Vurgu `✓` glifiyle DEĞİL sınıfla anlatılır (K7).
    expect(badges).not.toHaveTextContent("✓");
    expect(badges.querySelectorAll(".iz-type-badge--active")).toHaveLength(1);
  });

  it("personel/tip listesi düşerse sessiz kalınmaz", () => {
    setup({ personnelError: true, typesError: true });
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);

    expect(screen.getByTestId("iz-request-personnel-error")).toBeVisible();
    expect(screen.getByTestId("iz-request-type-error")).toBeVisible();
  });
});

describe("LeaveRequestFormModal — hak aşımı (T 149-158 · KARAR 4)", () => {
  it("aşımda bant basılır ve gönderim PASİFtir", async () => {
    const user = userEvent.setup();
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);
    await user.selectOptions(screen.getByTestId("iz-request-personnel"), "per-1");
    await user.selectOptions(screen.getByTestId("iz-request-type"), "lt-1");
    await user.type(screen.getByTestId("iz-request-start"), "24.08.2026");
    await user.type(screen.getByTestId("iz-request-end"), "04.09.2026");

    const band = screen.getByTestId("iz-request-overrun");
    expect(band).toHaveTextContent("Hak aşımı — talep kaydedilemez");
    expect(band).toHaveTextContent("31.08.2026");
    expect(screen.getByTestId("iz-request-submit")).toBeDisabled();
    expect(screen.getByTestId("iz-request-block-reason")).toHaveTextContent("Hak aşımı");
  });

  it("🔴 kalan hak BİLİNMİYORSA aşım İDDİA EDİLMEZ (bant yok, gönderim açık)", async () => {
    setup({ balances: [balance({ remaining: null, annual_entitlement: null })] });
    const user = userEvent.setup();
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);
    await user.selectOptions(screen.getByTestId("iz-request-personnel"), "per-1");
    await user.selectOptions(screen.getByTestId("iz-request-type"), "lt-1");
    await user.type(screen.getByTestId("iz-request-start"), "24.08.2026");
    await user.type(screen.getByTestId("iz-request-end"), "04.09.2026");

    expect(screen.queryByTestId("iz-request-overrun")).not.toBeInTheDocument();
    expect(screen.getByTestId("iz-request-submit")).toBeEnabled();
  });

  it("🔴 yıllık haktan düşmeyen tipte aşım uyarısı basılmaz", async () => {
    const user = userEvent.setup();
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);
    // `lt-2` belge ister ama yıllık haktan DÜŞMEZ.
    await user.selectOptions(screen.getByTestId("iz-request-personnel"), "per-1");
    await user.selectOptions(screen.getByTestId("iz-request-type"), "lt-2");
    await user.type(screen.getByTestId("iz-request-start"), "24.08.2026");
    await user.type(screen.getByTestId("iz-request-end"), "04.09.2026");

    expect(screen.queryByTestId("iz-request-overrun")).not.toBeInTheDocument();
  });
});

describe("LeaveRequestFormModal — koşullu belge (T 161-174 · KARAR 3)", () => {
  it("belge isteyen tipte dosyasız gönderim KAPALI, belge istemeyen tipte AÇIK", async () => {
    const user = userEvent.setup();
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);
    await fillBase(user, "lt-2");

    expect(screen.getByTestId("iz-request-submit")).toBeDisabled();
    expect(screen.getByTestId("iz-request-block-reason")).toHaveTextContent("belge eki zorunludur");

    await user.selectOptions(screen.getByTestId("iz-request-type"), "lt-1");
    expect(screen.getByTestId("iz-request-submit")).toBeEnabled();
  });

  it("dosya eklenince belge zorunlu tipte de gönderim açılır", async () => {
    const user = userEvent.setup();
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);
    await fillBase(user, "lt-2");
    await user.upload(
      screen.getByTestId("iz-request-file"),
      new File(["rapor"], "rapor.pdf", { type: "application/pdf" }),
    );

    expect(screen.getByTestId("iz-request-submit")).toBeEnabled();
  });

  it("projesiz personelde arşiv yüklemesi KOŞAMAZ — gerekçe basılır, form durur", async () => {
    setup({ personnel: [person({ assigned_project_id: null })] });
    const user = userEvent.setup();
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);
    await fillBase(user, "lt-2");
    await user.upload(
      screen.getByTestId("iz-request-file"),
      new File(["rapor"], "rapor.pdf", { type: "application/pdf" }),
    );

    expect(screen.getByTestId("iz-request-no-project")).toBeVisible();
    expect(screen.getByTestId("iz-request-submit")).toBeDisabled();
  });

  it("personel değiştirilince önceki personelin seçili dosyası TEMİZLENİR (kalan-7 · #220)", async () => {
    setup({
      personnel: [
        person({ id: "per-1", full_name: "Hasan Çelik", assigned_project_id: "prj-1" }),
        person({ id: "per-2", full_name: "Ayşe Kaya", assigned_project_id: "prj-2" }),
      ],
    });
    const user = userEvent.setup();
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);
    await fillBase(user, "lt-2");
    await user.upload(
      screen.getByTestId("iz-request-file"),
      new File(["rapor"], "rapor.pdf", { type: "application/pdf" }),
    );
    expect(screen.getByTestId("iz-request-submit")).toBeEnabled();

    await user.selectOptions(screen.getByTestId("iz-request-personnel"), "per-2");

    // per-1 için seçilmiş dosya per-2'ye miras kalmamalı — belge zorunlu tip
    // için gönderim yeniden KAPALI olmalı ve gerekçe yeniden görünmeli.
    expect(screen.getByTestId("iz-request-submit")).toBeDisabled();
    expect(screen.getByTestId("iz-request-block-reason")).toHaveTextContent(
      "belge eki zorunludur",
    );
  });
});

describe("LeaveRequestFormModal — gönderim (POST /leave-requests)", () => {
  it("gövde `days`/`status` TAŞIMAZ ve boş alanlar HİÇ eklenmez", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<LeaveRequestFormModal year={2026} onClose={onClose} />);
    await fillBase(user);
    await user.click(screen.getByTestId("iz-request-submit"));

    expect(createAsync).toHaveBeenCalledWith({
      personnel_id: "per-1",
      leave_type_id: "lt-1",
      start_date: "2026-08-24",
      end_date: "2026-08-26",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("dosya İKİ ADIMDA gider: önce arşiv, sonra `document_id`", async () => {
    const user = userEvent.setup();
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);
    await fillBase(user, "lt-2");
    await user.upload(
      screen.getByTestId("iz-request-file"),
      new File(["rapor"], "rapor.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByTestId("iz-request-submit"));

    expect(uploadAsync).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "prj-1" }),
    );
    expect(createAsync).toHaveBeenCalledWith(
      expect.objectContaining({ document_id: "doc-1" }),
    );
  });

  it("ikinci adım düşerse ÖKSÜZ dosya bildirilir ve ikinci kopya yüklenmez", async () => {
    createAsync.mockRejectedValue(new BackendError(409, { detail: "Çakışan izin var." }));
    const user = userEvent.setup();
    render(<LeaveRequestFormModal year={2026} onClose={vi.fn()} />);
    await fillBase(user, "lt-2");
    await user.upload(
      screen.getByTestId("iz-request-file"),
      new File(["rapor"], "rapor.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByTestId("iz-request-submit"));

    expect(screen.getByTestId("iz-request-error")).toHaveTextContent("rapor.pdf");
    expect(screen.getByTestId("iz-request-error")).toHaveTextContent("Çakışan izin var.");

    await user.click(screen.getByTestId("iz-request-submit"));
    expect(uploadAsync).toHaveBeenCalledTimes(1);
  });

  it("sunucu hatası YUTULMAZ", async () => {
    createAsync.mockRejectedValue(new BackendError(422, { detail: "Tarih aralığı geçersiz." }));
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<LeaveRequestFormModal year={2026} onClose={onClose} />);
    await fillBase(user);
    await user.click(screen.getByTestId("iz-request-submit"));

    expect(screen.getByTestId("iz-request-error")).toHaveTextContent("Tarih aralığı geçersiz.");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("LeaveRequestFormModal — SEKME-F1.3b kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı/dokunulmadı → false; alanlar dolduruldu → true; başarılı kayıt → false (kapanış)", async () => {
    const user = userEvent.setup();
    let unmount = () => {};
    const onClose = vi.fn(() => unmount());
    ({ unmount } = render(<LeaveRequestFormModal year={2026} onClose={onClose} />));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await fillBase(user);
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    await user.click(screen.getByTestId("iz-request-submit"));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("KURAL 7 · dirty hâldeyken arka plana tıklamak window.confirm'ü ÇAĞIRMAZ (settings/Modal'a isDirty verilmez)", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onClose = vi.fn();
    render(<LeaveRequestFormModal year={2026} onClose={onClose} />);

    await fillBase(user);
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    await user.click(screen.getByRole("presentation"));
    expect(confirmSpy).not.toHaveBeenCalled();
    // Bugünkü davranış AYNI kalır: overlay tıklaması doğrudan kapatır.
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
