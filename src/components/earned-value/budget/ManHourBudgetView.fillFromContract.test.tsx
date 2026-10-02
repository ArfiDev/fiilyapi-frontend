import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { backendClient } from "@/lib/api/client";
import { useSite } from "@/lib/api/hooks/useSites";

import { ManHourBudgetView } from "./ManHourBudgetView";
import { defaultState, mockPermission, renderWithQuery, wireBackend } from "./budget-screen-harness";

// TKL-F5.5 · ÜS-F5-24: Adım 1 araç çubuğunda "Sözleşmeden doldur" (T34, SO-53/57/59). Gerçek hook + sahte backendClient.

const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));
vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSite: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "gunes", siteId: "a-blok" }),
  usePathname: () => "/projeler/gunes/santiyeler/a-blok/adam-saat-butcesi",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const SITE_ID = "99999999-0000-0000-0000-000000000001";
const FILL_PATH = "/sites/{site_id}/earned-value/budget/fill-from-contract";
const BUTTON = "Sözleşmeden doldur";

type Reply = { data?: unknown; status: number; error?: unknown };
let reply: Reply;

function setup(level: string | null = "approve", siteStatus = "active") {
  wireBackend(defaultState());
  mockPermission(level);
  vi.mocked(useSite).mockReturnValue({ data: { id: SITE_ID, project: { id: "p-1" }, status: siteStatus } } as never);
  const base = vi.mocked(backendClient.POST).getMockImplementation() as unknown as (...args: unknown[]) => unknown;
  vi.mocked(backendClient.POST).mockImplementation(((path: string, init: unknown) => {
    if (path !== FILL_PATH) return base(path, init);
    return Promise.resolve({ data: reply.data, error: reply.error, response: new Response(null, { status: reply.status }) } as never);
  }) as never);
  return { user: userEvent.setup(), ...renderWithQuery(<ManHourBudgetView />) };
}

function fillCalls() {
  return vi.mocked(backendClient.POST).mock.calls.filter((call) => String(call[0]) === FILL_PATH);
}

const RESULT = {
  filled_item_count: 2,
  filled_leaf_count: 5,
  linked_item_count: 2,
  mapped_group_count: 1,
  unrated_item_count: 1,
  warnings: [
    { code: "no_rate_slot", message: "1 kalemde adam-saat oranı yok (sözleşmeden doldurulamaz)" },
    { code: "item_not_in_site", message: "2 sözleşme kalemi şantiyede BOQ'da bulunamadı" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  scope.value = { isRestricted: false, names: [] };
  reply = { status: 200, data: RESULT };
});

describe("Sözleşmeden doldur (ÜS-F5-24)", () => {
  it("taslak + yazma yetkisi: düğme ETKİN, 'Katalogdan öner (tümü)' yanında ikincil; tıklama şantiye UUID'siyle POST eder", async () => {
    const { user } = setup();
    const button = await screen.findByRole("button", { name: BUTTON });
    expect(button).toBeEnabled();
    expect(screen.getByRole("button", { name: "Katalogdan öner (tümü)" })).toBeInTheDocument();
    await user.click(button);
    await waitFor(() => expect(fillCalls()).toHaveLength(1));
    expect(fillCalls()[0]![1]).toMatchObject({ params: { path: { site_id: SITE_ID } } });
  });

  it("başarı bandı: '{n} satır sözleşmeden dolduruldu' + sunucu uyarıları AYNEN", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: BUTTON }));
    expect(
      await screen.findByText(
        "5 satır sözleşmeden dolduruldu · 1 kalemde adam-saat oranı yok (sözleşmeden doldurulamaz) · 2 sözleşme kalemi şantiyede BOQ'da bulunamadı",
      ),
    ).toBeInTheDocument();
  });

  it("uyarısız başarı yalnız sayıyı basar", async () => {
    reply = { status: 200, data: { ...RESULT, warnings: [] } };
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: BUTTON }));
    expect(await screen.findByText("5 satır sözleşmeden dolduruldu")).toBeInTheDocument();
  });

  it("409 'Açık taslak revizyon yok' sunucu metniyle AYNEN (danger bandı)", async () => {
    reply = { status: 409, error: { detail: "Açık taslak revizyon yok" } };
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: BUTTON }));
    const message = await screen.findByText("Açık taslak revizyon yok");
    expect(message.className).toContain("ev-budget-flash--danger");
  });

  it("disiplin kısıtlı kullanıcıda GİZLİ (SO-57: uç kısıtlıya 403)", async () => {
    scope.value = { isRestricted: true, names: ["Mekanik"] };
    setup();
    await screen.findByRole("button", { name: "Katalogdan öner (tümü)" });
    expect(screen.queryByRole("button", { name: BUTTON })).not.toBeInTheDocument();
  });

  it("görüntüleyici ve tamamlanmış şantiyede GİZLİ (eylem düğmeleri kümesi)", async () => {
    const viewer = setup("view");
    await screen.findByText("Görüntüleyici · yalnız okuma");
    expect(screen.queryByRole("button", { name: BUTTON })).not.toBeInTheDocument();
    viewer.unmount();
    setup("approve", "completed");
    await screen.findByText("Tamamlanmış şantiye · bütçe salt okunur.");
    expect(screen.queryByRole("button", { name: BUTTON })).not.toBeInTheDocument();
  });
});
