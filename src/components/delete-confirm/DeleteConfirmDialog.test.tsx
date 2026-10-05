import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import type { DeletePreview } from "@/lib/api/hooks/useAdminDelete";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), DELETE: vi.fn() } }));

const ID = "44444444-4444-4444-4444-444444444444";

function preview(overrides: Partial<DeletePreview> = {}): DeletePreview {
  return {
    kind: "site",
    id: ID,
    kind_label: "Şantiye",
    label: "Kule Şantiyesi",
    dependent_count: 9,
    groups: [
      {
        table: "site_diary_entries",
        label: "Günlük kaydı",
        count: 7,
        relation: "cascade",
        is_financial: false,
        samples: ["1 Mayıs", "2 Mayıs"],
      },
      {
        table: "progress_payments",
        label: "Hakediş",
        count: 2,
        relation: "cascade",
        is_financial: true,
        samples: ["Hakediş 1", "Hakediş 2"],
      },
    ],
    detached: [{ table: "personnel", label: "Personel", count: 3, is_financial: false }],
    journal_entry_count: 0,
    journal_entries: [],
    other_projects: [],
    status_changes: [],
    closed_period_entry_count: 0,
    documents_left_without_entry: [],
    closed_payroll_timesheet_count: 0,
    closed_payroll_periods: [],
    closed_payroll_message: null,
    preview_token: "tok-1",
    ...overrides,
  };
}

function okPreview(data: DeletePreview) {
  return { data, error: undefined, response: new Response() } as never;
}
function failure(status: number, error: unknown) {
  return { data: undefined, error, response: new Response(null, { status }) } as never;
}
const DELETED = { data: undefined, error: undefined, response: new Response(null, { status: 204 }) } as never;

function renderDialog(onDeleted = vi.fn(), onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DeleteConfirmDialog kind="site" recordId={ID} onClose={onClose} onDeleted={onDeleted} />
    </QueryClientProvider>,
  );
  return { onDeleted, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(backendClient.GET).mockResolvedValue(okPreview(preview()));
});

describe("DeleteConfirmDialog — önizleme", () => {
  it("başlık, özet, grup tablosu, mali rozet ve silinmeyecek bölümünü basar", async () => {
    renderDialog();

    expect(await screen.findByText("Kule Şantiyesi ve bağlı 9 kayıt silinecek.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Şantiye silinsin mi?" })).toBeInTheDocument();
    const table = screen.getByTestId("delete-groups");
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByText("Günlük kaydı")).toBeInTheDocument();
    expect(within(rows[1]).getByText("1 Mayıs, 2 Mayıs +5 daha")).toBeInTheDocument();
    expect(within(rows[1]).queryByText("mali kayıt")).not.toBeInTheDocument();
    expect(within(rows[2]).getByText("mali kayıt")).toBeInTheDocument();
    expect(rows[2]).toHaveAttribute("data-financial", "true");
    const detached = screen.getByTestId("delete-detached");
    expect(within(detached).getByText("Silinmeyecek, yalnız bağı kopacak")).toBeInTheDocument();
    expect(within(detached).getByText("Personel · 3")).toBeInTheDocument();
    expect(screen.getByText("Bu işlem geri alınamaz.")).toBeInTheDocument();
  });

  it("bağlı kayıt yoksa 'bağlı kayıt yok' der, tablo ve silinmeyecek bölümü basılmaz", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(
      okPreview(preview({ dependent_count: 0, groups: [], detached: [] })),
    );
    renderDialog();

    expect(await screen.findByText("Kule Şantiyesi silinecek; bağlı kayıt yok.")).toBeInTheDocument();
    expect(screen.queryByTestId("delete-groups")).not.toBeInTheDocument();
    expect(screen.queryByTestId("delete-detached")).not.toBeInTheDocument();
  });

  it("yüklenirken Sil kapalıdır ve durum metni görünür", async () => {
    vi.mocked(backendClient.GET).mockReturnValue(new Promise(() => {}) as never);
    renderDialog();

    expect(await screen.findByText("Bağlı kayıtlar hesaplanıyor…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sil" })).toBeDisabled();
  });

  it("önizleme 403 ise yalnız Sistem Yöneticisi mesajı basılır ve Sil kapalıdır", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(failure(403, undefined));
    renderDialog();

    expect(await screen.findByTestId("delete-preview-error")).toHaveTextContent(
      "Bu işlemi yalnızca Sistem Yöneticisi yapabilir.",
    );
    expect(screen.getByRole("button", { name: "Sil" })).toBeDisabled();
  });

  it("önizleme başka hatayla düşerse genel hata mesajı basılır", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(failure(500, undefined));
    renderDialog();

    expect(await screen.findByTestId("delete-preview-error")).toHaveTextContent("Bağlı kayıtlar yüklenemedi");
    expect(screen.getByRole("button", { name: "Sil" })).toBeDisabled();
  });
});

const ENTRY_OPEN = {
  entry_no: "FIS-2026-0001",
  entry_date: "2026-03-05",
  status: "posted",
  is_reversal: false,
  source_type: "invoice",
  total: "1250.50",
  period_closed: false,
};
const ENTRY_CLOSED_REVERSAL = {
  entry_no: "FIS-2026-0002",
  entry_date: "2026-01-31",
  status: "reversed",
  is_reversal: true,
  source_type: null,
  total: "980.00",
  period_closed: true,
};

describe("DeleteConfirmDialog — mali aileler (SIL-F2.2)", () => {
  it("fiş listesi varsayılan KAPALI katlanır; rozetler ve kapalı dönem uyarısı basılır", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(
      okPreview(
        preview({
          kind: "invoice",
          journal_entry_count: 2,
          closed_period_entry_count: 1,
          journal_entries: [ENTRY_OPEN, ENTRY_CLOSED_REVERSAL],
        }),
      ),
    );
    renderDialog();
    const user = userEvent.setup();

    const section = await screen.findByTestId("delete-journal-entries");
    expect(section).not.toHaveAttribute("open");
    const toggle = within(section).getByText("Silinecek muhasebe fişleri (2)");
    await user.click(toggle);
    expect(section).toHaveAttribute("open");

    const rows = within(section).getAllByTestId("delete-journal-entry-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("FIS-2026-0001")).toBeInTheDocument();
    expect(within(rows[0]).getByText("05.03.2026")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Kayıtlı")).toBeInTheDocument();
    expect(within(rows[0]).getByText("₺1.250,50")).toBeInTheDocument();
    expect(within(rows[0]).queryByText("ters kayıt")).not.toBeInTheDocument();
    expect(within(rows[0]).queryByText("kapalı dönem")).not.toBeInTheDocument();
    expect(within(rows[1]).getByText("ters kayıt")).toBeInTheDocument();
    expect(within(rows[1]).getByText("kapalı dönem")).toBeInTheDocument();
    expect(within(section).getByTestId("delete-closed-period-warning")).toHaveTextContent(
      "1 fiş kapalı döneme ait.",
    );
  });

  it("fiş yoksa fiş bölümü basılmaz", async () => {
    renderDialog();
    await screen.findByTestId("delete-groups");
    expect(screen.queryByTestId("delete-journal-entries")).not.toBeInTheDocument();
  });

  it("kapalı dönem fişi yoksa uyarı satırı basılmaz", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(
      okPreview(preview({ journal_entry_count: 1, journal_entries: [ENTRY_OPEN] })),
    );
    renderDialog();
    await screen.findByTestId("delete-journal-entries");
    expect(screen.queryByTestId("delete-closed-period-warning")).not.toBeInTheDocument();
  });

  it("fişsiz kalacak kaynak belge uyarısı + belge listesi", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(
      okPreview(
        preview({
          documents_left_without_entry: [
            { table: "invoices", label: "Fatura", ref: "FAT-17", message: "Fişi silinecek, fatura kalacak" },
          ],
        }),
      ),
    );
    renderDialog();

    const warning = await screen.findByTestId("delete-documents-without-entry");
    expect(within(warning).getByText("Kaynak belge fişsiz kalacak")).toBeInTheDocument();
    expect(within(warning).getByText(/Fatura · FAT-17 — Fişi silinecek, fatura kalacak/)).toBeInTheDocument();
  });

  it("belge listesi boşsa fişsiz kalacak uyarısı basılmaz", async () => {
    renderDialog();
    await screen.findByTestId("delete-groups");
    expect(screen.queryByTestId("delete-documents-without-entry")).not.toBeInTheDocument();
  });

  it("closed_payroll_message AYNEN gösterilir; dönemler listelenir", async () => {
    const message = "Kapanmış bordro dönemine ait 4 puantaj satırı silinemez; önce dönemi açın.";
    vi.mocked(backendClient.GET).mockResolvedValue(
      okPreview(
        preview({
          closed_payroll_message: message,
          closed_payroll_timesheet_count: 4,
          closed_payroll_periods: [{ year: 2026, month: 2, status: "closed" }],
        }),
      ),
    );
    renderDialog();

    const banner = await screen.findByTestId("delete-closed-payroll");
    expect(within(banner).getByText(message)).toBeInTheDocument();
    expect(within(banner).getByText("Şubat 2026 · closed")).toBeInTheDocument();
  });

  it("closed_payroll_message boş/null ise bordro bandı basılmaz", async () => {
    renderDialog();
    await screen.findByTestId("delete-groups");
    expect(screen.queryByTestId("delete-closed-payroll")).not.toBeInTheDocument();
  });

  it("silinmeyecek satırda is_financial ise 'mali kayıt' rozeti basılır, değilse basılmaz", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(
      okPreview(
        preview({
          groups: [],
          detached: [
            { table: "personnel", label: "Personel", count: 3, is_financial: false },
            { table: "payments", label: "Ödeme", count: 1, is_financial: true },
          ],
        }),
      ),
    );
    renderDialog();

    const detached = await screen.findByTestId("delete-detached");
    const items = within(detached).getAllByRole("listitem");
    expect(within(items[0]).queryByText("mali kayıt")).not.toBeInTheDocument();
    expect(within(items[1]).getByText("mali kayıt")).toBeInTheDocument();
  });

  it("başka projeler VURGULU bantta 'proje adı · N kayıt' satırlarıyla, gruplar tablosunun ÜSTÜNDE basılır", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(
      okPreview(
        preview({
          other_projects: [
            { project_id: "11111111-1111-4111-8111-111111111111", name: "Kule Projesi", count: 5 },
            { project_id: "22222222-2222-4222-8222-222222222222", name: "Vadi Evleri", count: 1 },
          ],
        }),
      ),
    );
    renderDialog();

    const band = await screen.findByTestId("delete-other-projects");
    expect(within(band).getByText("Başka projeler de etkilenecek")).toBeInTheDocument();
    const items = within(band).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Kule Projesi · 5 kayıt");
    expect(items[1]).toHaveTextContent("Vadi Evleri · 1 kayıt");
    const table = screen.getByTestId("delete-groups");
    expect(band.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("başka proje yoksa bant basılmaz", async () => {
    renderDialog();
    await screen.findByTestId("delete-groups");
    expect(screen.queryByTestId("delete-other-projects")).not.toBeInTheDocument();
  });

  it("durum değişimi: türün kendi ekranındaki Türkçe etiketlerle 'Fatura F-0007: Tahsil Edildi → Gönderildi'", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(
      okPreview(
        preview({
          status_changes: [
            { kind: "invoice", label: "Fatura F-0007", from: "collected", to: "sent" },
            { kind: "progress_payment", label: "İşveren hakedişi #3 · Kule", from: "paid", to: "approved" },
            { kind: "subcontractor_progress_payment", label: "Taşeron hakedişi #1", from: "approved", to: "pending_approval" },
            { kind: "equipment_rental_invoice", label: "Kira faturası K-12", from: "paid", to: "pending_verification" },
          ],
        }),
      ),
    );
    renderDialog();

    const section = await screen.findByTestId("delete-status-changes");
    expect(within(section).getByText("Durumu değişecek kayıtlar (silinmeyecek)")).toBeInTheDocument();
    const items = within(section).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Fatura F-0007: Tahsil Edildi → Gönderildi");
    expect(items[1]).toHaveTextContent("İşveren hakedişi #3 · Kule: Ödendi → Onaylandı");
    expect(items[2]).toHaveTextContent("Taşeron hakedişi #1: Onaylandı → Onay Bekliyor");
    expect(items[3]).toHaveTextContent("Kira faturası K-12: Ödendi → Doğrulama Bekliyor");
  });

  it("durum haritasında olmayan değer HAM basılır; etiketi tür adını taşımıyorsa tür adı öne eklenir", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(
      okPreview(
        preview({
          status_changes: [{ kind: "invoice", label: "F-0009", from: "yeni_durum", to: "sent" }],
        }),
      ),
    );
    renderDialog();

    const section = await screen.findByTestId("delete-status-changes");
    expect(within(section).getByRole("listitem")).toHaveTextContent("Fatura F-0009: yeni_durum → Gönderildi");
  });

  it("durum değişimi yoksa bölüm basılmaz", async () => {
    renderDialog();
    await screen.findByTestId("delete-groups");
    expect(screen.queryByTestId("delete-status-changes")).not.toBeInTheDocument();
  });

  it("mali önizleme Sil'i KİLİTLEMEZ (financial_pending dalı kalktı)", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(
      okPreview(preview({ journal_entry_count: 1, journal_entries: [ENTRY_CLOSED_REVERSAL] })),
    );
    renderDialog();
    await screen.findByTestId("delete-journal-entries");
    await waitFor(() => expect(screen.getByRole("button", { name: "Sil" })).toBeEnabled());
  });
});

describe("DeleteConfirmDialog — silme", () => {
  it("Sil, önizleme token'ıyla DELETE çağırır ve onDeleted'ı tetikler", async () => {
    vi.mocked(backendClient.DELETE).mockResolvedValue(DELETED);
    const { onDeleted } = renderDialog();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sil" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith({ kindLabel: "Şantiye", label: "Kule Şantiyesi" }));
    expect(backendClient.DELETE).toHaveBeenCalledWith("/admin/silme/{kind}/{record_id}", {
      params: { path: { kind: "site", record_id: ID }, query: { preview_token: "tok-1" } },
    });
  });

  it("preview_stale: önizleme YENİDEN çekilir, bildirim görünür, pencere yeni ağaçla açık kalır", async () => {
    vi.mocked(backendClient.GET)
      .mockResolvedValueOnce(okPreview(preview()))
      .mockResolvedValueOnce(
        okPreview(preview({ dependent_count: 12, preview_token: "tok-2" })),
      );
    vi.mocked(backendClient.DELETE).mockResolvedValueOnce(
      failure(409, { code: "preview_stale", detail: "Silinecek kayıtlar değişti; önizlemeyi yenileyin" }),
    );
    const { onDeleted } = renderDialog();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sil" }));

    expect(await screen.findByTestId("delete-stale-notice")).toHaveTextContent(
      "Bağlı kayıtlar değişti, listeyi yeniden gözden geçirin",
    );
    expect(await screen.findByText("Kule Şantiyesi ve bağlı 12 kayıt silinecek.")).toBeInTheDocument();
    expect(backendClient.GET).toHaveBeenCalledTimes(2);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Yeni ağaçla ikinci deneme YENİ token'ı kullanır.
    vi.mocked(backendClient.DELETE).mockResolvedValueOnce(DELETED);
    await waitFor(() => expect(screen.getByRole("button", { name: "Sil" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Sil" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(backendClient.DELETE).toHaveBeenLastCalledWith("/admin/silme/{kind}/{record_id}", {
      params: { path: { kind: "site", record_id: ID }, query: { preview_token: "tok-2" } },
    });
  });

  it("409 financial_pending (SIL-B2'de kalktı): özel kilit YOK, detail gösterilir, Sil açık kalır", async () => {
    vi.mocked(backendClient.DELETE).mockResolvedValue(
      failure(409, { code: "financial_pending", detail: "Ödenmemiş hakediş var" }),
    );
    renderDialog();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sil" }));

    expect(await screen.findByTestId("delete-failure")).toHaveTextContent("Ödenmemiş hakediş var");
    expect(screen.getByRole("button", { name: "Sil" })).toBeEnabled();
  });

  it("diğer 409 (code null): detail mesajı gösterilir, Sil açık kalır", async () => {
    vi.mocked(backendClient.DELETE).mockResolvedValue(failure(409, { code: null, detail: "Veri bütünlüğü hatası" }));
    renderDialog();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sil" }));

    expect(await screen.findByTestId("delete-failure")).toHaveTextContent("Veri bütünlüğü hatası");
    expect(screen.getByRole("button", { name: "Sil" })).toBeEnabled();
  });

  it("403: yalnız Sistem Yöneticisi mesajı", async () => {
    vi.mocked(backendClient.DELETE).mockResolvedValue(failure(403, undefined));
    renderDialog();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sil" }));

    expect(await screen.findByTestId("delete-failure")).toHaveTextContent(
      "Bu işlemi yalnızca Sistem Yöneticisi yapabilir.",
    );
  });

  it("silme sürerken Vazgeç ve Sil kilitlidir, Esc pencereyi kapatmaz", async () => {
    vi.mocked(backendClient.DELETE).mockReturnValue(new Promise(() => {}) as never);
    const { onClose } = renderDialog();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sil" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Vazgeç" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Sil" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Vazgeç pencereyi kapatır ve DELETE çağrılmaz", async () => {
    const { onClose } = renderDialog();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Vazgeç" }));

    expect(onClose).toHaveBeenCalled();
    expect(backendClient.DELETE).not.toHaveBeenCalled();
  });
});
