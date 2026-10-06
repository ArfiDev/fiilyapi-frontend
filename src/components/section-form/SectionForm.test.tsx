import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SectionForm } from "./SectionForm";
import { useSession } from "@/components/shell/SessionProvider";
import type { MeResponse } from "@/lib/auth/types";
import { useProject } from "@/lib/api/hooks/useProjects";
import { useSection } from "@/lib/api/hooks/useSection";
import { useCreateSection, useUpdateSection } from "@/lib/api/hooks/useSectionMutations";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSiteSections } from "@/lib/api/hooks/useSiteSections";
import { useUserOptions } from "@/lib/api/hooks/useUserOptions";
import { useCreateSectionType, useSectionTypes } from "@/lib/api/hooks/useSectionTypes";
import { BackendError } from "@/lib/api/unwrap";
import { MESSAGES } from "./validate";
import { GANTT_AUTO_ADD_REASON } from "./SectionForm";
import { CREATE_MODE_DISABLED_REASON } from "@/components/boq-assignment/BoqAssignmentCard";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { ALL_PAGE_KEYS, fullAccessPages, pagesFor } from "@/lib/auth/page-grants.testkit";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProject: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSiteSections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSiteSections")>()),
  useSiteSections: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSection")>()),
  useSection: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSectionMutations", () => ({
  useCreateSection: vi.fn(),
  useUpdateSection: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useUserOptions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useUserOptions")>()),
  useUserOptions: vi.fn(),
}));
// BLF-F1.3 — tip seçicisi ağdan okur; bu dosyada liste/ekleme sahte (kendi
// davranışı `SectionTypePicker.test.tsx`te ölçülür).
vi.mock("@/lib/api/hooks/useSectionTypes", () => ({
  useSectionTypes: vi.fn(),
  useCreateSectionType: vi.fn(),
}));
// 🔴 F-BLMPOZ: `BoqAssignmentCard` DÜZENLEME kipinde artık GERÇEKTEN ağa
// çıkıyor (iki `useBoq` sorgusu). Bu dosya `QueryClientProvider` kurmuyor —
// kartın kendi davranışı `BoqAssignmentCard.test.tsx`te ölçülür, burada
// yalnız formun içinde YER ALDIĞI doğrulanır.
vi.mock("@/lib/api/hooks/useBoq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBoq")>()),
  useBoq: () => ({ data: { groups: [], totals: {} }, isLoading: false, isError: false }),
}));
vi.mock("@/lib/api/hooks/useBoqAllocations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBoqAllocations")>()),
  useReplaceBoqItemAllocations: () => ({ mutateAsync: vi.fn() }),
}));

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const SITE_ID = "22222222-2222-2222-2222-222222222222";
const SECTION_ID = "33333333-3333-3333-3333-333333333333";
const MANAGER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEW_SECTION_ID = "44444444-4444-4444-4444-444444444444";
const SIBLING_ID = "55555555-5555-4555-8555-555555555555";
const MILESTONE_ID = "66666666-6666-4666-8666-666666666666";
const TYPE_FOUNDATION = { id: "77777777-7777-4777-8777-777777777771", name: "Temel & Altyapı" };
const TYPE_STRUCTURAL = { id: "77777777-7777-4777-8777-777777777772", name: "Kaba İnşaat" };

const BASE_ME = {
  id: "user-0",
  email: "ayse@ornek.com",
  full_name: "Ayşe Yılmaz",
  title: null,
  role_key: "site_manager",
  status: "active",
} as unknown as MeResponse;

function mockSession(pages: ReturnType<typeof fullAccessPages>) {
  const me = { ...BASE_ME, pages };
  vi.mocked(useSession).mockReturnValue({ me: me as MeResponse, isLoading: false });
}

const SITE = {
  id: SITE_ID,
  name: "A-Blok Şantiyesi",
  section_count: 5,
  project: { id: PROJECT_ID, name: "Güneşkent Konut", city: "Ankara", employer_name: null },
} as never;

const PROJECT = { id: PROJECT_ID, name: "Güneşkent Konut", code: "SZL-2025-001" } as never;

const PLACEHOLDER = { available: false, value: null, pending_module: "boq" };
const COUNT_PLACEHOLDER = { available: false, count: null, pending_module: "boq" };

const SECTION_DETAIL = {
  id: SECTION_ID,
  site_id: SITE_ID,
  code: "BLM-06",
  name: "Kat 11–14 Kaba İnşaat",
  status: "active",
  manager_user_id: MANAGER_ID,
  manager_name: "Sercan Öztürk",
  deputy_manager_user_id: null,
  deputy_manager_name: null,
  start_date: "2026-10-01",
  end_date: "2027-03-31",
  sort_order: 6,
  section_type: TYPE_STRUCTURAL,
  description: "Kat 11–14 arası betonarme, kalıp ve demir imalatı.",
  planned_worker_count: 42,
  is_draft: false,
  progress_pct: PLACEHOLDER,
  boq_item_count: COUNT_PLACEHOLDER,
  budget: PLACEHOLDER,
  worker_count: COUNT_PLACEHOLDER,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  // F-TKV T5 — P11 alanları artık formda GERÇEK.
  depends_on_section_id: SIBLING_ID,
  milestones: [
    { id: MILESTONE_ID, title: "Kat 12 döşeme", milestone_date: "2026-12-01", sort_order: 0 },
  ],
} as never;

/** Aynı şantiyedeki öbür bölümler — Bağımlılık seçicisinin kaynağı. */
const SITE_SECTIONS = {
  counts: { planned: 1, active: 1, completed: 0 },
  items: [
    { id: SECTION_ID, name: "Kat 11–14 Kaba İnşaat" },
    { id: SIBLING_ID, name: "Zemin Kat Kaba İnşaat" },
  ],
} as never;

function queryResult<T>(value: Partial<{ data: T; isLoading: boolean; isError: boolean; error: unknown }>) {
  return { data: undefined, isLoading: false, isError: false, error: null, ...value } as never;
}

function mockUsers(overrides: Record<string, unknown> = {}) {
  vi.mocked(useUserOptions).mockReturnValue({
    options: [{ id: MANAGER_ID, full_name: "Sercan Öztürk", title: "Şantiye Şefi" }],
    isForbidden: false,
    isLoading: false,
    isError: false,
    ...overrides,
  } as never);
}

const createMutate = vi.fn();
const updateMutate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockSession(fullAccessPages());
  vi.mocked(useSite).mockReturnValue(queryResult({ data: SITE }));
  vi.mocked(useSiteSections).mockReturnValue(queryResult({ data: SITE_SECTIONS }));
  vi.mocked(useProject).mockReturnValue(queryResult({ data: PROJECT }));
  vi.mocked(useSection).mockReturnValue(queryResult({ data: undefined }));
  vi.mocked(useCreateSection).mockReturnValue({ mutate: createMutate, isPending: false } as never);
  vi.mocked(useUpdateSection).mockReturnValue({ mutate: updateMutate, isPending: false } as never);
  mockUsers();
  vi.mocked(useSectionTypes).mockReturnValue(
    queryResult({ data: [TYPE_FOUNDATION, TYPE_STRUCTURAL] }),
  );
  vi.mocked(useCreateSectionType).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
});

function renderCreate() {
  return render(<SectionForm mode="create" projectKey={PROJECT_ID} siteKey={SITE_ID} />);
}

function renderEdit(detailOverrides: Record<string, unknown> = {}) {
  vi.mocked(useSection).mockReturnValue(
    queryResult({ data: { ...(SECTION_DETAIL as object), ...detailOverrides } as never }),
  );
  return render(<SectionForm mode="edit" projectKey={PROJECT_ID} siteKey={SITE_ID} sectionKey={SECTION_ID} />);
}

describe("SectionForm — izin", () => {
  it("sayfa Düzenler değilse (yalnız Görür) AccessDenied basar", () => {
    mockSession(pagesFor(ALL_PAGE_KEYS, "view"));
    renderCreate();
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });
});

describe("SectionForm — create kipi kabuk (F35-60)", () => {
  it("kırıntı yolu + başlık + bağlam kutusu basar", () => {
    renderCreate();
    const nav = screen.getByRole("navigation", { name: "Kırıntı yolu" });
    expect(within(nav).getByText("A-Blok Şantiyesi")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Yeni Bölüm (Faz) Ekle" })).toBeInTheDocument();
    const info = screen.getByTestId("section-form-site-info");
    expect(info).toHaveTextContent("Şantiye:");
    expect(info).toHaveTextContent("A-Blok Şantiyesi · Güneşkent Konut (SZL-2025-001)");
    expect(info).toHaveTextContent("Mevcut 5 bölüm var.");
  });

  it("Şantiye alanı kilitlidir ve rotadan gelen şantiye adını basar", () => {
    renderCreate();
    expect(screen.getByLabelText("Şantiye")).toHaveValue("A-Blok Şantiyesi");
    expect(screen.getByLabelText("Şantiye")).toBeDisabled();
  });

  it("devre dışı kartlar render edilir ve kontrolleri disabled'dır", () => {
    renderCreate();
    // 🔴 F-BLMPOZ: OLUŞTURMA kipinde kart hâlâ devre dışıdır ama gerekçesi
    // DEĞİŞTİ — "veri katmanı kapalı" değil, "bölüm henüz kaydedilmedi".
    expect(screen.getByRole("button", { name: "+ Poz Seç" })).toBeDisabled();
    expect(screen.getByText(CREATE_MODE_DISABLED_REASON)).toBeInTheDocument();
    // final review M1: F194-201 satır-butonu da basılmalı, devre dışı.
    expect(screen.getByRole("button", { name: "Şantiye kotasından poz seç" })).toBeDisabled();
    const gantt = screen.getByLabelText("Bölümü proje takvimine (Gantt) otomatik ekle");
    expect(gantt).toBeDisabled();
    expect(gantt).toBeChecked();
    // 🔴 F-TKV T5: gerekçe artık `title`da SAKLANMAZ, ekrana basılır — ve
    // "Gantt modülü yok" DEMEZ (modül var), seçenek olmadığını söyler.
    expect(screen.getByText(GANTT_AUTO_ADD_REASON)).toBeInTheDocument();
    expect(GANTT_AUTO_ADD_REASON).not.toMatch(/birlikte gelir/);
  });

  it("🔴 F-TKV T5: GANTT KİLİDİ AÇIK — Bağımlılık ve Milestone kontrolleri ETKİN", () => {
    renderCreate();
    const dependency = screen.getByLabelText("Bağımlılık (Önce Bitmesi Gereken Bölüm)");
    expect(dependency).toBeEnabled();
    // Seçenekler aynı şantiyenin bölümlerinden gelir (uydurma DEĞİL).
    expect(within(dependency as HTMLElement).getByRole("option", { name: "Zemin Kat Kaba İnşaat" })).toBeInTheDocument();
    expect(screen.getByLabelText("Milestone Ekle")).toBeEnabled();
    expect(screen.getByLabelText("Milestone tarihi")).toBeEnabled();
  });
});

/** Alt eylem şeridindeki butonu tıklar — topbar'daki aynı isimli butonla çakışmaz. */
function clickFooterAction(user: ReturnType<typeof userEvent.setup>, name: string) {
  const strip = document.querySelector(".pf-actions") as HTMLElement;
  return user.click(within(strip).getByRole("button", { name }));
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Bölüm Adı"), "Kat 11–14 Kaba İnşaat");
  await user.selectOptions(screen.getByLabelText("Bölüm Tipi"), TYPE_STRUCTURAL.id);
  await user.selectOptions(screen.getByLabelText("Bölüm Sorumlusu"), MANAGER_ID);
  fireEvent.change(screen.getByLabelText("Başlangıç Tarihi"), { target: { value: "01.10.2026" } });
  fireEvent.change(screen.getByLabelText("Planlanan Bitiş"), { target: { value: "31.03.2027" } });
}

describe("SectionForm — taslak / taslak dışı ayrımı", () => {
  it("Taslak Kaydet'te yalnız ad ile mutate çağrılır, is_draft: true", async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.type(screen.getByLabelText("Bölüm Adı"), "Temel");
    await clickFooterAction(user, "Taslak Kaydet");

    expect(createMutate).toHaveBeenCalledTimes(1);
    const [body] = createMutate.mock.calls[0];
    expect(body.is_draft).toBe(true);
    expect(body.name).toBe("Temel");
  });

  it("Bölümü Oluştur'da eksik zorunlu alanlar hata gösterir, mutate ÇAĞRILMAZ", async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.type(screen.getByLabelText("Bölüm Adı"), "Temel");
    await clickFooterAction(user, "Bölümü Oluştur");

    expect(screen.getAllByText(MESSAGES.sectionTypeRequired).length).toBeGreaterThan(0);
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("taslakta tarih sırası tersse hata verir (tutarlılık her zaman uygulanır)", async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.type(screen.getByLabelText("Bölüm Adı"), "Temel");
    fireEvent.change(screen.getByLabelText("Başlangıç Tarihi"), { target: { value: "01.05.2026" } });
    fireEvent.change(screen.getByLabelText("Planlanan Bitiş"), { target: { value: "01.04.2026" } });
    await clickFooterAction(user, "Taslak Kaydet");

    expect(screen.getAllByText(MESSAGES.endBeforeStart).length).toBeGreaterThan(0);
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("tüm zorunlu alanlar doluysa Bölümü Oluştur mutate çağırır, is_draft: false", async () => {
    const user = userEvent.setup();
    renderCreate();
    await fillRequired(user);
    await clickFooterAction(user, "Bölümü Oluştur");

    expect(createMutate).toHaveBeenCalledTimes(1);
    const [body, opts] = createMutate.mock.calls[0];
    expect(body).toMatchObject({
      name: "Kat 11–14 Kaba İnşaat",
      section_type_id: TYPE_STRUCTURAL.id,
      manager_user_id: MANAGER_ID,
      start_date: "2026-10-01",
      end_date: "2027-03-31",
      is_draft: false,
    });
    // 🔴 BLF-F1.3: elle bedel gövdeye GİRMEZ.
    expect(body).not.toHaveProperty("budget_amount");
    expect(body).not.toHaveProperty("section_type");

    act(() => opts.onSuccess({ id: NEW_SECTION_ID }));
    expect(pushMock).toHaveBeenCalledWith(
      `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/bolumler/${NEW_SECTION_ID}`,
    );
  });

  it("🔴 BLF-F1.3: taslak dışı kayıtta tip SEÇİLMEDEN gövde gitmez (F-c zorunluluğu korunur)", async () => {
    const user = userEvent.setup();
    renderCreate();
    await fillRequired(user);
    await user.selectOptions(screen.getByLabelText("Bölüm Tipi"), "");
    await clickFooterAction(user, "Bölümü Oluştur");

    expect(screen.getAllByText(MESSAGES.sectionTypeRequired).length).toBeGreaterThan(0);
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("🔴 BLF-F1.3: taslakta tip boş olabilir (section_type_id null)", async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.type(screen.getByLabelText("Bölüm Adı"), "Temel");
    await clickFooterAction(user, "Taslak Kaydet");
    expect(createMutate.mock.calls[0][0].section_type_id).toBeNull();
  });
});

describe("SectionForm — 409 kod çakışması", () => {
  it("Bölüm Kodu alanının altında Türkçe hata gösterir, TAM OLARAK BİR KEZ, genel banner BASILMAZ", async () => {
    const user = userEvent.setup();
    renderCreate();
    await fillRequired(user);
    await user.type(screen.getByLabelText("Bölüm Kodu"), "BLM-01");
    await clickFooterAction(user, "Bölümü Oluştur");

    const [, opts] = createMutate.mock.calls[0];
    act(() => opts.onError(new BackendError(409, { detail: "duplicate key value" })));

    const codeField = screen.getByLabelText("Bölüm Kodu");
    expect(codeField).toHaveAttribute("aria-invalid", "true");
    // Brief §409: YALNIZ alan hatası — genel banner (role="alert", .pf-form-error) BASILMAZ.
    expect(screen.getAllByText(MESSAGES.sectionCodeConflict)).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector(".pf-form-error")).not.toBeInTheDocument();
    // M5_1 kayıt #267: sunucu kaynaklı 409'da da odak hatalı alana gitmeli —
    // eskiden yalnız istemci doğrulama yolunda kuruluyordu.
    expect(codeField).toHaveFocus();
  });
});

describe("SectionForm — Taslak Kaydet yalnız ekleme kipinde", () => {
  it("ekleme kipinde 'Taslak Kaydet' basılır", () => {
    renderCreate();
    const strip = document.querySelector(".pf-actions") as HTMLElement;
    expect(within(strip).getByRole("button", { name: "Taslak Kaydet" })).toBeInTheDocument();
  });

  it("düzenleme kipinde 'Taslak Kaydet' basılmaz — yayına alınmış bölüm uyarısız taslağa düşmez", () => {
    renderEdit();
    const strip = document.querySelector(".pf-actions") as HTMLElement;
    expect(within(strip).queryByRole("button", { name: "Taslak Kaydet" })).not.toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: "İptal" })).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: "Kaydet" })).toBeInTheDocument();
  });
});

describe("SectionForm — edit kipi", () => {
  it("mevcut bölümden alanları doldurur", () => {
    renderEdit();
    expect(screen.getByLabelText("Bölüm Adı")).toHaveValue("Kat 11–14 Kaba İnşaat");
    expect(screen.getByLabelText("Bölüm Kodu")).toHaveValue("BLM-06");
    expect(screen.getByLabelText("Bölüm Sorumlusu")).toHaveValue(MANAGER_ID);
    expect(screen.getByLabelText("Bölüm Tipi")).toHaveValue(TYPE_STRUCTURAL.id);
  });

  it("🔴 BLF-F1.3: Bölüm Bedeli düzenlemede de KİLİTLİ türev — detaydaki `budget` basılır", () => {
    renderEdit({ budget: { available: true, value: "2840000.00" } });
    const field = screen.getByLabelText("Bölüm Bedeli");
    expect(field).toBeDisabled();
    expect(field).toHaveValue("₺ 2.840.000");
    expect(screen.getByText("İş kalemlerinden hesaplanır")).toBeInTheDocument();
  });

  it("🔴 BLF-F1.3: kayıt gövdesinde budget_amount YOK, section_type_id detaydan taşınır", async () => {
    const user = userEvent.setup();
    renderEdit();
    await clickFooterAction(user, "Kaydet");
    const [body] = updateMutate.mock.calls[0];
    expect(body.section_type_id).toBe(TYPE_STRUCTURAL.id);
    expect(body).not.toHaveProperty("budget_amount");
  });

  it("🔴 BLF-F1.3: backend'in 'Bölüm tipi seçiniz' 422'si (yayındaki bölümde tip boşaltma) bantta AYNEN görünür", async () => {
    const user = userEvent.setup();
    renderEdit();
    await clickFooterAction(user, "Kaydet");
    const [, opts] = updateMutate.mock.calls[0];
    act(() => opts.onError(new BackendError(422, { detail: "Bölüm tipi seçiniz" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Bölüm tipi seçiniz");
  });

  it("🔴 BLF-F1.3: yayındaki bölümde tipi boşaltmak İSTEMCİDE de durdurulur (F-c)", async () => {
    const user = userEvent.setup();
    renderEdit();
    await user.selectOptions(screen.getByLabelText("Bölüm Tipi"), "");
    await clickFooterAction(user, "Kaydet");
    expect(screen.getAllByText(MESSAGES.sectionTypeRequired).length).toBeGreaterThan(0);
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("🔴 F-TKV T5 UÇTAN UCA: bağımlılık DETAYDAN tohumlanır ve gövdeye GERÇEKTEN girer", async () => {
    const user = userEvent.setup();
    renderEdit();
    expect(screen.getByLabelText("Bağımlılık (Önce Bitmesi Gereken Bölüm)")).toHaveValue(SIBLING_ID);
    await clickFooterAction(user, "Kaydet");
    const [body] = updateMutate.mock.calls[0];
    expect(body.depends_on_section_id).toBe(SIBLING_ID);
  });

  it("🔴 F-TKV T5 UÇTAN UCA: yeni milestone gövdeye girer, KAYITLI olan KORUNUR", async () => {
    const user = userEvent.setup();
    renderEdit();
    // Kayıtlı satır sayısı ipucunda GÖRÜNÜR (öğenin kendi verisinden türer).
    expect(screen.getByText(/kayıtlı 1 milestone korunur/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Milestone Ekle"), "Kat 14 döşeme");
    fireEvent.change(screen.getByLabelText("Milestone tarihi"), { target: { value: "15.01.2027" } });
    await clickFooterAction(user, "Kaydet");

    const [body] = updateMutate.mock.calls[0];
    expect(body.milestones).toEqual([
      { id: MILESTONE_ID, title: "Kat 12 döşeme", milestone_date: "2026-12-01" },
      { title: "Kat 14 döşeme", milestone_date: "2027-01-15" },
    ]);
  });

  it("🔴 milestone kutusuna DOKUNULMAZSA anahtar gönderilmez — kayıtlılar SİLİNMEZ", async () => {
    const user = userEvent.setup();
    renderEdit();
    await clickFooterAction(user, "Kaydet");
    const [body] = updateMutate.mock.calls[0];
    expect(body).not.toHaveProperty("milestones");
  });

  it("YARIM milestone satırı gönderimi DURDURUR ve görünür hata basar", async () => {
    const user = userEvent.setup();
    renderEdit();
    await user.type(screen.getByLabelText("Milestone Ekle"), "Yalnız ad");
    await clickFooterAction(user, "Kaydet");
    expect(updateMutate).not.toHaveBeenCalled();
    expect(screen.getAllByText(MESSAGES.milestoneIncomplete).length).toBeGreaterThan(0);
  });

  it("bağımlılık 422'si (aynı şantiye / döngü) kullanıcıya GÖRÜNÜR hata olarak basılır", async () => {
    const user = userEvent.setup();
    renderEdit();
    await clickFooterAction(user, "Kaydet");
    const [, opts] = updateMutate.mock.calls[0];
    act(() =>
      opts.onError(
        new BackendError(422, { detail: "Bağımlılık döngüsü oluşturulamaz." }),
      ),
    );
    expect(screen.getByText("Bağımlılık döngüsü oluşturulamaz.")).toBeInTheDocument();
  });

  it("kaydedince updateSection çağrılır ve bölüm detayına yönlendirir", async () => {
    const user = userEvent.setup();
    renderEdit();
    await clickFooterAction(user, "Kaydet");

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const [, opts] = updateMutate.mock.calls[0];
    act(() => opts.onSuccess({ id: SECTION_ID }));
    expect(pushMock).toHaveBeenCalledWith(`/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/bolumler/${SECTION_ID}`);
  });

  // final review I3: detay sorgusu 403 DIŞI bir hatayla (404/500) başarısız
  // olursa `isLoading:false` + `data:undefined` olur — düzeltmeden önce ekran
  // kalıcı "Yükleniyor…" mesajında donuyordu.
  it("detay sorgusu hata verirse (403 dışı) 'Bölüm yüklenemedi' basar, sonsuz yüklenmede kalmaz", () => {
    vi.mocked(useSection).mockReturnValue(
      queryResult({ data: undefined, isLoading: false, isError: true, error: new Error("500") }),
    );
    render(<SectionForm mode="edit" projectKey={PROJECT_ID} siteKey={SITE_ID} sectionKey={SECTION_ID} />);

    expect(screen.getByText("Bölüm yüklenemedi")).toBeInTheDocument();
    expect(screen.queryByText("Yükleniyor…")).not.toBeInTheDocument();
  });

  // final review I1: sec-2 senaryosu (mock-backend.ts) — `manager_user_id`
  // null, `manager_name` "M. Arslan" dolu (eski, serbest-metin sorumlulu
  // kayıt). Form bu alanı yazmaz ama zorunluluk düşmeli — kullanıcı hiçbir
  // şeyi değiştirmeden "Kaydet"e basabilmeli.
  it("mevcut kayıtta manager_user_id null ama manager_name doluysa (eski kayıt) sorumlu zorunlu değildir", async () => {
    const user = userEvent.setup();
    vi.mocked(useSection).mockReturnValue(
      queryResult({
        data: { ...(SECTION_DETAIL as Record<string, unknown>), manager_user_id: null, manager_name: "M. Arslan" },
      }),
    );
    render(<SectionForm mode="edit" projectKey={PROJECT_ID} siteKey={SITE_ID} sectionKey={SECTION_ID} />);

    await clickFooterAction(user, "Kaydet");

    expect(screen.queryByText(MESSAGES.managerRequired)).not.toBeInTheDocument();
    expect(updateMutate).toHaveBeenCalledTimes(1);
  });
});

describe("SectionForm — SEKME-F1.3b kaydedilmemiş değişiklik kaydı", () => {
  it("oluşturma: açıldı/dokunulmadı → false; ad yazıldı → true; başarılı kayıt → false (yönlendirme/unmount)", async () => {
    const user = userEvent.setup();
    const { unmount } = renderCreate();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await user.type(screen.getByLabelText("Bölüm Adı"), "Temel");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("düzenleme: 🔴 ASYNC TABAN — veri geldikten sonra da false; sonra değişiklik → true", async () => {
    const user = userEvent.setup();
    renderEdit();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    expect(screen.getByLabelText("Bölüm Adı")).toHaveValue("Kat 11–14 Kaba İnşaat");

    await user.clear(screen.getByLabelText("Bölüm Adı"));
    await user.type(screen.getByLabelText("Bölüm Adı"), "Kat 15-18");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });
});
