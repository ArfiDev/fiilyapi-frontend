import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import {
  CHART_ACCOUNTS_MAX_LIMIT,
  type ChartAccountResponse,
} from "@/lib/api/hooks/useChartOfAccounts";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { JournalEntryFormModal } from "./JournalEntryFormModal";

/**
 * 🔴 KATALOG TAVANI — `hesap-plani-sayfalama-tavani`.
 *
 * Sunucu `GET /chart-of-accounts` için `limit` tavanını 200'de tutar ve aşımda
 * **422** döner (kırpma DEĞİL — `accounts_router.py:80`), sıralama `code ASC`.
 * Canlı tohum (`chart_seed_data.py`) **316** hesap taşır: ilk sayfa `49`da
 * biter, geriye 116 hesap kalır (ölçüldü). Bu yüzden fiş satırı seçicisinin
 * TEK SAYFA çekmesi iki ayrı kusur üretir:
 *
 *  1. `600`/`730`/`760`/`770` gibi gelir-gider hesapları seçenekte HİÇ olmaz —
 *     elle hiçbir gider/gelir fişi kesilemez;
 *  2. çocukları sayfa dışında kalan grup (`49`) YAPRAK SANILIR ve seçenek
 *     olarak basılır; kullanıcı onu seçerse sunucu `leaf_blockers` ile 422
 *     döner, yani ekran sunucuyu yalanlar.
 *
 * Bu dosya kusurun İKİ yüzünü de ölçer. `mock-backend.ts`in hesap tohumu 25
 * satırdır (≤200), bu yüzden e2e/görsel kapı bu kusuru YAPISAL OLARAK göremez.
 */
vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

function account(code: string, name: string): ChartAccountResponse {
  return {
    id: `acc-${code}`,
    code,
    name,
    account_type: "asset",
    is_active: true,
    is_contra: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    balance: "0.00",
    class_code: code.slice(0, 1),
    level: 2,
  };
}

/** İlk sayfayı TAM dolduran dolgu — canlıdaki 1xx/2xx/3xx yığınının yerine. */
const FILLER_COUNT = CHART_ACCOUNTS_MAX_LIMIT - 2;

/**
 * Canlı sınır BİREBİR taklit edilir: `code ASC` sıralamada ilk 200 satır
 * `100` + `49` ile kapanır; `49`un çocukları (`492`, `499`) ve bütün 6xx/7xx
 * hesapları İKİNCİ sayfada kalır.
 */
const CATALOG: readonly ChartAccountResponse[] = [
  ...Array.from({ length: FILLER_COUNT }, (_, index) =>
    account(`10.${String(index + 1).padStart(3, "0")}`, `Kasa Alt ${index + 1}`),
  ),
  account("100", "Kasa"),
  account("49", "Diğer Uzun Vadeli Yabancı Kaynaklar"),
  account("492", "Gelecek Yıllara Ait Gelirler"),
  account("499", "Diğer Çeşitli Uzun Vadeli Yabancı Kaynaklar"),
  account("600", "Yurt İçi Satışlar"),
  account("770", "Genel Yönetim Giderleri"),
].sort((left, right) => (left.code < right.code ? -1 : 1));

interface ChartQuery {
  q?: string;
  limit?: number;
  offset?: number;
}

/** Sunucunun sayfalama sözleşmesi: tavan 200, aşım 422, sıra `code ASC`. */
function chartPage(query: ChartQuery) {
  const limit = query.limit ?? 50;
  if (limit > CHART_ACCOUNTS_MAX_LIMIT) {
    return {
      data: undefined,
      error: { detail: "limit tavanı 200'dür" },
      response: new Response(null, { status: 422 }),
    };
  }
  const needle = query.q?.toLocaleLowerCase("tr");
  const pool =
    needle === undefined
      ? CATALOG
      : CATALOG.filter(
          (item) =>
            item.code.includes(needle) || item.name.toLocaleLowerCase("tr").includes(needle),
        );
  const offset = query.offset ?? 0;
  return {
    data: { items: pool.slice(offset, offset + limit), total: pool.length, limit, offset },
    error: undefined,
    response: new Response(),
  };
}

let client: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(backendClient.GET).mockImplementation((async (
    path: string,
    init: { params: { query: ChartQuery } },
  ) => {
    if (path !== "/chart-of-accounts") throw new Error(`beklenmeyen uç: ${path}`);
    return chartPage(init.params.query);
  }) as never);
});

async function optionTexts(): Promise<readonly string[]> {
  render(
    <QueryClientProvider client={client}>
      <JournalEntryFormModal entryId={null} onClose={() => {}} />
    </QueryClientProvider>,
  );
  const select = screen.getByTestId("mu-line-account-0");
  // "Hesap seçin" tek başına durur; katalog gelince seçenekler çoğalır.
  await waitFor(() => expect(within(select).getAllByRole("option").length).toBeGreaterThan(1));
  expect(screen.queryByTestId("mu-entry-accounts-error")).toBeNull();
  return within(select)
    .getAllByRole("option")
    .map((option) => option.textContent ?? "");
}

describe("JournalEntryFormModal · hesap seçicisi katalog tavanı", () => {
  it("ilk sayfanın DIŞINDA kalan gider hesabı (770) seçenek olarak basılır", async () => {
    const texts = await optionTexts();

    expect(texts).toContain("770 · Genel Yönetim Giderleri");
    expect(texts).toContain("600 · Yurt İçi Satışlar");
  });

  it("çocukları ikinci sayfada kalan grup (49) YAPRAK SANILMAZ", async () => {
    const texts = await optionTexts();

    expect(texts).not.toContain("49 · Diğer Uzun Vadeli Yabancı Kaynaklar");
    // Gerçek yapraklar yerinde: süzgeç kümeyi boşaltarak "geçmiş" olmaz.
    expect(texts).toContain("100 · Kasa");
    expect(texts).toContain("492 · Gelecek Yıllara Ait Gelirler");
  });
});

/** SEKME-F1.3b · merkezi kayda bağlanma bekçisi (O8 emsali). */
describe("JournalEntryFormModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", async () => {
    await optionTexts();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("açıklama alanı değiştirildi → kirli", async () => {
    const user = userEvent.setup();
    await optionTexts();
    await user.type(screen.getByTestId("mu-entry-description"), "Kira ödemesi");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt sonrası (onClose çağrılır, unmount) → temiz", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: { id: "e1" },
      error: undefined,
      response: new Response(),
    } as never);
    const onClose = vi.fn();
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <JournalEntryFormModal entryId={null} onClose={onClose} />
      </QueryClientProvider>,
    );
    const select = screen.getByTestId("mu-line-account-0");
    await waitFor(() => expect(within(select).getAllByRole("option").length).toBeGreaterThan(1));
    await user.type(screen.getByTestId("mu-entry-description"), "Kira ödemesi");
    await user.selectOptions(screen.getByTestId("mu-line-account-0"), "100 · Kasa");
    await user.selectOptions(screen.getByTestId("mu-line-account-1"), "600 · Yurt İçi Satışlar");
    await user.type(screen.getByTestId("mu-line-debit-0"), "100");
    await user.type(screen.getByTestId("mu-line-credit-1"), "100");
    await user.click(screen.getByTestId("mu-entry-dialog-save"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
