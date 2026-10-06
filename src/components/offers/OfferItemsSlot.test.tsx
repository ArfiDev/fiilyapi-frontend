import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { D_DUV, D_KAB } from "@/components/work-item-catalog/work-item-fixtures";

import { OFFER_ID, makeDetail } from "./offer-detail-fixtures";
import { BETON, makeGroup, makeItem, makeRevisionWithItems, makeUnpricedItem } from "./offer-item-fixtures";
import { OfferDetailScreen } from "./OfferDetailScreen";
import { renderOfferItemsSlot } from "./OfferItemsCard";

const perm = vi.hoisted(() => ({ contracts: "full" }));
vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: (moduleKey: string) => ({
    level: moduleKey === "contracts" ? perm.contracts : "admin",
    canView: true,
    canWrite: true,
    canDelete: true,
  }),
}));
// IZN-F6a · kapılar yalnız sayfa izninden karar verir: modül niyeti (`perm`) oturum sayfa iznine çevrilir
// (offers-session.testkit). `useModulePermission` mock'u kapı DIŞI mantık (şerit metni vb.) için kalır.
vi.mock("@/components/shell/SessionProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/shell/SessionProvider")>();
  const { offersSessionMe } = await import("./offers-session.testkit");
  return { ...actual, useSession: () => ({ ...actual.SESSION_CONTEXT_DEFAULT, me: offersSessionMe({ contracts: perm.contracts, projects: "admin" }), isLoading: false }) };
});
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => ({ isRestricted: false, names: [] }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const ok = (data: unknown) => ({ data, error: undefined, response: new Response(null, { status: 200 }) }) as never;

function mockBackend(revision = makeRevisionWithItems()) {
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/offers/{offer_id}") return ok(makeDetail());
    if (path === "/offers/{offer_id}/revisions/{rev_no}") return ok(revision);
    if (path === "/employers") return ok({ items: [], total: 0 });
    if (path === "/catalog/items") return ok({ items: [BETON] });
    if (path === "/catalog/disciplines") return ok({ items: [D_KAB, D_DUV] });
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
}

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <OfferDetailScreen offerId={OFFER_ID} revParam={null} renderItems={renderOfferItemsSlot} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  perm.contracts = "full";
  mockBackend();
});

describe("F3.5 yuvası ← F3.6 kalem kartı", () => {
  it("taslak son revizyonda kalem kartı basılır ve düzenlenebilir", async () => {
    renderDetail();
    expect(await screen.findByRole("heading", { name: "Teklif kalemleri" })).toBeInTheDocument();
    expect(await screen.findByLabelText("KAB-0001 miktar")).toBeEnabled();
    expect(screen.getByRole("button", { name: "+ Katalogdan Ekle" })).toBeEnabled();
  });

  it("yazma yetkisi yoksa (contracts:view) kart basılır ama TÜM hücreler kapalı", async () => {
    perm.contracts = "view";
    renderDetail();
    expect(await screen.findByLabelText("KAB-0001 miktar")).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ Katalogdan Ekle" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ Grup" })).toBeDisabled();
  });

  it("gönderilmiş (düzenlenemez) revizyonda kalemler salt okunur", async () => {
    mockBackend(
      makeRevisionWithItems(undefined, { status: "sent", is_editable: false, is_latest: true }),
    );
    renderDetail();
    expect(await screen.findByLabelText("KAB-0001 miktar")).toBeDisabled();
  });
});

/* ─── TKL-F3.6.1 madde 4 — kalem yazım kuyruğu eylem kapısına görünür ─────────────────────────────────── */
describe("kalem yazım kuyruğu ↔ geçiş eylemleri (madde 4)", () => {
  const ITEM_PATH = "/offers/{offer_id}/revisions/{rev_no}/items/{item_id}";
  const SEND = "/offers/{offer_id}/revisions/{rev_no}/send";
  const callsTo = (method: "POST" | "PATCH", path: string) =>
    vi.mocked(backendClient[method]).mock.calls.filter((call) => String(call[0]) === path);

  /** Kalem PATCH'i `gate` açılana dek bekler; sonra it-2'ye maliyet yazar → fiyatsız sayısı 0. */
  function deferItemPatch(state: { revision: ReturnType<typeof makeRevisionWithItems> }) {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(backendClient.PATCH).mockImplementation((async () => {
      await gate;
      const fixed = makeItem({ id: "it-2", poz_no: "KAB-0002" });
      state.revision = makeRevisionWithItems([makeGroup("g-a", "KABA İNŞAAT", 0, [makeItem({ id: "it-1" }), fixed])], {
        totals: { ...state.revision.totals, unpriced_count: 0 },
      });
      return ok(fixed);
    }) as never);
    return release;
  }

  it("🔴 hücre blur'u PATCH'i uçarken 'Gönderildi İşaretle' KAPALI; PATCH bitince TAZE sayıyla (0) onaysız gönderilir", async () => {
    const user = userEvent.setup();
    const state = { revision: makeRevisionWithItems() };
    mockBackend(state.revision);
    vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
      if (path === "/offers/{offer_id}") return ok(makeDetail());
      if (path === "/offers/{offer_id}/revisions/{rev_no}") return ok(state.revision);
      if (path === "/employers") return ok({ items: [], total: 0 });
      if (path === "/catalog/items") return ok({ items: [BETON] });
      if (path === "/catalog/disciplines") return ok({ items: [D_KAB, D_DUV] });
      throw new Error(`beklenmeyen GET ${path}`);
    }) as never);
    vi.mocked(backendClient.POST).mockResolvedValue(ok(makeDetail()));
    const release = deferItemPatch(state);
    renderDetail();
    const cost = await screen.findByLabelText("KAB-0002 maliyet B.F.");
    await user.type(cost, "50");
    // Tıklama = fare basışında odak çıkışı (blur → PATCH kuyruğa girer) + tıklama: kapı kuyruğu GÖRMELİ.
    await user.click(screen.getByRole("button", { name: "Gönderildi İşaretle" }));
    await waitFor(() => expect(callsTo("PATCH", ITEM_PATH)).toHaveLength(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(callsTo("POST", SEND)).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Gönderildi İşaretle" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gönderildi İşaretle" })).toHaveAttribute("title", "Kalem kaydediliyor");

    release();
    await waitFor(() => expect(screen.getByRole("button", { name: "Gönderildi İşaretle" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Gönderildi İşaretle" }));
    await waitFor(() => expect(callsTo("POST", SEND)).toHaveLength(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); // bayat sayı (1) olsaydı onay sorardı
  });

  it("🔴 Gönder'den ÖNCE revizyon tazelenir: önbellekte 'fiyatsız 0' bayatsa sunucudaki 2 ile ONAY sorulur, send atılmaz", async () => {
    const user = userEvent.setup();
    const allPriced = makeRevisionWithItems([makeGroup("g-a", "KABA İNŞAAT", 0, [makeItem({ id: "it-1" })])], {
      totals: { ...makeRevisionWithItems().totals, unpriced_count: 0 },
    });
    mockBackend(allPriced);
    vi.mocked(backendClient.POST).mockResolvedValue(ok(makeDetail()));
    renderDetail();
    await screen.findByLabelText("KAB-0001 miktar");
    // Başkası iki kalemi fiyatsız bıraktı: sunucu artık 2 der, ekran henüz bilmiyor.
    const stale = makeRevisionWithItems([makeGroup("g-a", "KABA İNŞAAT", 0, [makeUnpricedItem({ id: "x1" }), makeUnpricedItem({ id: "x2" })])], {
      totals: { ...allPriced.totals, unpriced_count: 2 },
    });
    mockBackend(stale);
    await user.click(screen.getByRole("button", { name: "Gönderildi İşaretle" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("2 kalemde fiyat yok; tutara dahil değil. Yine de gönderildi işaretlensin mi?")).toBeInTheDocument();
    expect(callsTo("POST", SEND)).toHaveLength(0);
  });

  it("tazeleme sürerken eylem şeridi KİLİTLİ (çift tıklama ikinci istek/modal açmaz)", async () => {
    const user = userEvent.setup();
    renderDetail();
    await screen.findByLabelText("KAB-0001 miktar");
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = vi.mocked(backendClient.GET).getMockImplementation() as (...args: unknown[]) => Promise<unknown>;
    vi.mocked(backendClient.GET).mockImplementation((async (...args: unknown[]) => {
      if (args[0] === "/offers/{offer_id}/revisions/{rev_no}") await gate;
      return original(...args);
    }) as never);
    await user.click(screen.getByRole("button", { name: "Gönderildi İşaretle" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Vazgeçildi…" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Gönderildi İşaretle" })).toBeDisabled();
    release();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
