import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";

import { OFFER_DRAFT, OFFER_SENT, makeResponse } from "./offer-fixtures";
import { OffersScreen } from "./OffersScreen";

const perm = vi.hoisted(() => ({ level: "full" as string | undefined }));
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
const push = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({ level: perm.level, canView: perm.level !== "none", canWrite: true, canDelete: true }),
}));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

function ok(data: unknown, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) } as never;
}
function fail(status: number, detail: string) {
  return { data: undefined, error: { detail }, response: new Response(null, { status }) } as never;
}

interface ListCall {
  query: Record<string, unknown>;
}
function listCalls(): ListCall[] {
  return vi
    .mocked(backendClient.GET)
    .mock.calls.filter((call) => String(call[0]) === "/offers")
    .map((call) => ({ query: ((call[1] as { params: { query: Record<string, unknown> } }).params.query) }));
}

function mockGets(offers: unknown) {
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/offers") return typeof offers === "function" ? (offers as () => unknown)() : ok(offers);
    if (path === "/employers") return ok({ items: [{ id: "emp-1", name: "Kuzey Gayrimenkul A.Ş." }], total: 1 });
    if (path === "/catalog/items") return ok({ items: [] });
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OffersScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  perm.level = "full";
  scope.value = { isRestricted: false, names: [] };
});

describe("erişim (T25: contracts:view okur, full + kısıtsız yazar)", () => {
  it("contracts:none → AccessDenied ve teklif ucu HİÇ çağrılmaz", async () => {
    perm.level = "none";
    mockGets(makeResponse([]));
    renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(vi.mocked(backendClient.GET)).not.toHaveBeenCalled();
  });

  it("uç 403 (SO-19 kısıtlı kullanıcı) → AccessDenied", async () => {
    perm.level = undefined;
    mockGets(() => fail(403, "Yetkisiz işlem"));
    renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "+ Yeni Teklif" })).not.toBeInTheDocument();
  });

  it("view → liste görünür, yazma yok, şerit metni", async () => {
    perm.level = "view";
    mockGets(makeResponse([OFFER_SENT]));
    renderScreen();
    await screen.findByText("TKL-2026-0013");
    expect(screen.queryByRole("link", { name: "+ Yeni Teklif" })).not.toBeInTheDocument();
    expect(screen.getByText("Görüntüleyici · yalnız okuma")).toBeInTheDocument();
  });

  it("disiplin kısıtlı + full → yazma yok, kısıtlı şerit metni", async () => {
    scope.value = { isRestricted: true, names: ["Mekanik"] };
    mockGets(makeResponse([OFFER_SENT]));
    renderScreen();
    await screen.findByText("TKL-2026-0013");
    expect(screen.queryByRole("link", { name: "+ Yeni Teklif" })).not.toBeInTheDocument();
    expect(screen.getByText("Salt okunur · disiplin kısıtlı kullanıcı teklif değiştiremez")).toBeInTheDocument();
  });

  it("full + kısıtsız → '+ Yeni Teklif' var, şerit yok", async () => {
    mockGets(makeResponse([OFFER_SENT]));
    renderScreen();
    await screen.findByText("TKL-2026-0013");
    expect(screen.getByRole("link", { name: "+ Yeni Teklif" })).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("süzgeç sunucuda uygulanır", () => {
  it("ilk istek süzgeçsiz + limit 200; kart tıklaması status parametresiyle yeniden ister, ikinci tık kapatır", async () => {
    const user = userEvent.setup();
    mockGets(makeResponse([OFFER_DRAFT, OFFER_SENT]));
    renderScreen();
    await screen.findByText("TKL-2026-0014");
    expect(listCalls()[0]!.query).toEqual({ limit: 200 });

    await user.click(screen.getByTestId("offers-card-sent"));
    await waitFor(() => expect(listCalls().some((c) => c.query.status === "sent")).toBe(true));
    expect(screen.getByTestId("offers-card-sent")).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByTestId("offers-card-sent"));
    await waitFor(() => expect(screen.getByTestId("offers-card-sent")).toHaveAttribute("aria-pressed", "false"));
    expect(listCalls().at(-1)!.query).toEqual({ limit: 200 });
  });

  it("işveren seçimi employer_id gönderir; 'Filtreleri temizle' hepsini sıfırlar", async () => {
    const user = userEvent.setup();
    mockGets(makeResponse([OFFER_DRAFT]));
    renderScreen();
    await screen.findByText("TKL-2026-0014");
    await screen.findByRole("option", { name: "Kuzey Gayrimenkul A.Ş." });
    await user.selectOptions(screen.getByRole("combobox", { name: /İşveren/ }), "emp-1");
    await waitFor(() => expect(listCalls().some((c) => c.query.employer_id === "emp-1")).toBe(true));
    await user.click(screen.getByRole("button", { name: "Filtreleri temizle" }));
    await waitFor(() => expect(listCalls().at(-1)!.query).toEqual({ limit: 200 }));
  });

  it("arama debounce sonrası q gönderir", async () => {
    const user = userEvent.setup();
    mockGets(makeResponse([OFFER_DRAFT]));
    renderScreen();
    await screen.findByText("TKL-2026-0014");
    await user.type(screen.getByRole("searchbox"), "ata");
    await waitFor(() => expect(listCalls().some((c) => c.query.q === "ata")).toBe(true));
  });
});

describe("hata hâli", () => {
  it("403 dışı hata → 'Teklifler yüklenemedi' + Tekrar dene", async () => {
    mockGets(() => fail(500, "Sunucu hatası"));
    renderScreen();
    expect(await screen.findByText("Teklifler yüklenemedi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });
});

describe("satır işlemleri", () => {
  it("Kopyala (yeni rev) POST atar ve yeni revizyonla detaya gider", async () => {
    const user = userEvent.setup();
    mockGets(makeResponse([OFFER_SENT]));
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ rev_no: 3 }, 201));
    renderScreen();
    await screen.findByText("TKL-2026-0013");
    await user.click(screen.getByRole("button", { name: "TKL-2026-0013 işlemleri" }));
    await user.click(screen.getByRole("button", { name: "Kopyala (yeni rev)" }));
    await waitFor(() =>
      expect(vi.mocked(backendClient.POST)).toHaveBeenCalledWith("/offers/{offer_id}/revisions", {
        params: { path: { offer_id: OFFER_SENT.id } },
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/teklif-hazirlama/id-TKL-2026-0013?rev=3"));
  });

  it("yeni revizyon 409 → backend metni basılır, gezinme YOK", async () => {
    const user = userEvent.setup();
    mockGets(makeResponse([OFFER_SENT]));
    vi.mocked(backendClient.POST).mockResolvedValue(
      fail(409, "Yeni revizyon yalnız son revizyon gönderilmiş ya da kaybedilmiş iken açılabilir"),
    );
    renderScreen();
    await screen.findByText("TKL-2026-0013");
    await user.click(screen.getByRole("button", { name: "TKL-2026-0013 işlemleri" }));
    await user.click(screen.getByRole("button", { name: "Kopyala (yeni rev)" }));
    expect(
      await screen.findByText("Yeni revizyon yalnız son revizyon gönderilmiş ya da kaybedilmiş iken açılabilir"),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("Taslağı sil: onay metni 'numara tekrar kullanılmaz'; onaylayınca DELETE + bildirim", async () => {
    const user = userEvent.setup();
    mockGets(makeResponse([OFFER_DRAFT]));
    vi.mocked(backendClient.DELETE).mockResolvedValue(ok(undefined, 204));
    renderScreen();
    await screen.findByText("TKL-2026-0014");
    await user.click(screen.getByRole("button", { name: "TKL-2026-0014 işlemleri" }));
    await user.click(screen.getByRole("button", { name: "Taslağı sil" }));
    expect(screen.getByText("TKL-2026-0014 silinsin mi? Bu numara tekrar kullanılmaz.")).toBeInTheDocument();
    expect(vi.mocked(backendClient.DELETE)).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sil" }));
    await waitFor(() =>
      expect(vi.mocked(backendClient.DELETE)).toHaveBeenCalledWith("/offers/{offer_id}", {
        params: { path: { offer_id: OFFER_DRAFT.id } },
      }),
    );
    expect(await screen.findByText("TKL-2026-0014 silindi")).toBeInTheDocument();
  });

  it("Taslağı sil vazgeç → DELETE atılmaz", async () => {
    const user = userEvent.setup();
    mockGets(makeResponse([OFFER_DRAFT]));
    renderScreen();
    await screen.findByText("TKL-2026-0014");
    await user.click(screen.getByRole("button", { name: "TKL-2026-0014 işlemleri" }));
    await user.click(screen.getByRole("button", { name: "Taslağı sil" }));
    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(vi.mocked(backendClient.DELETE)).not.toHaveBeenCalled();
  });
});
