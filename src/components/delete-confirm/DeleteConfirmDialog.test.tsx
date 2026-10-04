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
    detached: [{ table: "personnel", label: "Personel", count: 3 }],
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

  it("financial_pending: detail mesajı gösterilir ve Sil kapanır", async () => {
    vi.mocked(backendClient.DELETE).mockResolvedValue(
      failure(409, { code: "financial_pending", detail: "Ödenmemiş hakediş var" }),
    );
    renderDialog();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sil" }));

    expect(await screen.findByTestId("delete-failure")).toHaveTextContent("Ödenmemiş hakediş var");
    expect(screen.getByRole("button", { name: "Sil" })).toBeDisabled();
    expect(screen.queryByTestId("delete-stale-notice")).not.toBeInTheDocument();
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
