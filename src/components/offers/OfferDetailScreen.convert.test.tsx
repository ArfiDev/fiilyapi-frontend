import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import type { OfferDetailRead, OfferRevisionRead } from "@/lib/api/hooks/useOffers";

import { OFFER_ID, makeDetail, makeRevision } from "./offer-detail-fixtures";
import { OfferDetailScreen } from "./OfferDetailScreen";

// TKL-F5.5 · giriş noktaları: Projeye Dönüştür (şerit), "Proje: … →" + kilit bandı (başlık), kazanıldı toast bağlantısı.

const perm = vi.hoisted(() => ({ levels: { contracts: "full", projects: "admin" } as Record<string, string | undefined> }));
const sessionOverride = vi.hoisted(() => ({ me: undefined as unknown })); // IZN-F6b · SA / özel oturum
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }));
// IZN-F6a · kapılar yalnız sayfa izninden karar verir: modül niyeti (`perm`) oturum sayfa iznine çevrilir
// (offers-session.testkit).
vi.mock("@/components/shell/SessionProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/shell/SessionProvider")>();
  const { offersSessionMe } = await import("./offers-session.testkit");
  return { ...actual, useSession: () => ({ ...actual.SESSION_CONTEXT_DEFAULT, me: sessionOverride.me !== undefined ? sessionOverride.me : offersSessionMe(perm.levels), isLoading: false }) };
});
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const PROJECT = { id: "11111111-2222-3333-4444-555555555555", code: "PRJ-2026-004", name: "Güneşkent Konut", slug: "guneskent-konut" };

function ok(data: unknown) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) } as never;
}

function wonBackend(over: Partial<OfferDetailRead> = {}): { detail: OfferDetailRead; revision: OfferRevisionRead } {
  const base = makeRevision({ rev_no: 0 });
  const revision: OfferRevisionRead = { ...base, status: "won", is_latest: true, is_editable: false, sent_at: "2026-09-12T12:00:00Z" };
  const summary = makeDetail().revisions[1]!;
  const detail = makeDetail({
    latest_rev_no: 0,
    status: "won",
    revisions: [{ ...summary, rev_no: 0, status: "won" }],
    history: [{ at: "2026-09-12T09:00:00Z", kind: "opened", rev_no: 0, user_id: null, user_name: null }],
    conversion_state: "won_not_converted",
    ...over,
  });
  return { detail, revision };
}

let backend: ReturnType<typeof wonBackend>;

function mockBackend() {
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/offers/{offer_id}") return ok(backend.detail);
    if (path === "/offers/{offer_id}/revisions/{rev_no}") return ok(backend.revision);
    if (path === "/employers") return ok({ items: [], total: 0 });
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
}

function renderScreen(revParam: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OfferDetailScreen offerId={OFFER_ID} revParam={revParam} />
    </QueryClientProvider>,
  );
}

async function loaded() {
  await screen.findByRole("heading", { level: 1, name: /TKL-2026-0014/ });
}

const CONVERT_LABEL = "Projeye Dönüştür →";
const LOCK_BAND = "Teklif projeye dönüştürüldü · salt okunur arşiv";

beforeEach(() => {
  vi.clearAllMocks();
  perm.levels = { contracts: "full", projects: "admin" };
  sessionOverride.me = undefined;
  scope.value = { isRestricted: false, names: [] };
  backend = wonBackend();
  mockBackend();
});

describe("kazanıldı · dönüştürülmedi (ÜS-F5-2/3)", () => {
  it("yetkili → Dönüştür ekranına bağlantı; kilit bandı ve 'Proje:' bağlantısı YOK", async () => {
    renderScreen();
    await loaded();
    expect(screen.getByRole("link", { name: CONVERT_LABEL })).toHaveAttribute("href", `/teklif-hazirlama/${OFFER_ID}/donustur`);
    expect(screen.queryByText(LOCK_BAND)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Proje:/ })).not.toBeInTheDocument();
  });

  it("sistem yöneticisi (hücre yok) → Onaylar bayrağı olmadan da AÇIK", async () => {
    const { meFixture } = await import("@/lib/auth/page-grants.testkit");
    sessionOverride.me = meFixture({ pages: {}, isSystemAdmin: true });
    renderScreen();
    await loaded();
    expect(screen.getByRole("link", { name: CONVERT_LABEL })).toBeInTheDocument();
  });

  it("Teklif Hazırlama Düzenler ama Onaylar yok → PASİF düğme + görünür gerekçe; bağlantı yok", async () => {
    const { meFixture, fullAccessPages, pageGrant } = await import("@/lib/auth/page-grants.testkit");
    sessionOverride.me = meFixture({ pages: { ...fullAccessPages(), "teklif.teklif_hazirlama": pageGrant("edit", false) } });
    renderScreen();
    await loaded();
    expect(screen.queryByRole("link", { name: CONVERT_LABEL })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: CONVERT_LABEL })).toBeDisabled();
    expect(screen.getByText("Projeye dönüştürme için Teklif Hazırlama sayfasında Onaylar yetkisi gerekir")).toBeVisible();
  });

  it("disiplin kısıtlı → PASİF + mevcut salt-okunur gerekçesi", async () => {
    scope.value = { isRestricted: true, names: ["Mekanik"] };
    renderScreen();
    await loaded();
    expect(screen.getByRole("button", { name: CONVERT_LABEL })).toBeDisabled();
    expect(screen.getAllByText("Teklif Hazırlama sayfasında Düzenler yetkisi gerekir").length).toBeGreaterThan(0);
  });

  it("kazanılmamış teklifte (gönderildi) düğme HİÇ görünmez", async () => {
    backend = wonBackend({ status: "sent" });
    backend.revision = { ...backend.revision, status: "sent" };
    mockBackend();
    renderScreen();
    await loaded();
    expect(screen.queryByText(CONVERT_LABEL)).not.toBeInTheDocument();
  });
});

describe("eski revizyon görünümü (T41)", () => {
  /** Rev.1 son (kazanıldı, dönüştürülmedi); görüntülenen Rev.0 eski (is_latest=false). */
  function viewingOldRevision() {
    const { detail } = wonBackend();
    const summary = detail.revisions[0]!;
    backend = {
      detail: { ...detail, latest_rev_no: 1, revisions: [{ ...summary, rev_no: 0, status: "sent" }, { ...summary, rev_no: 1, status: "won" }] },
      revision: { ...makeRevision({ rev_no: 0 }), status: "sent", is_latest: false, is_editable: false },
    };
    mockBackend();
  }

  it("yetkili: 'Projeye Dönüştür' bağlantısı/düğmesi HİÇ yok", async () => {
    viewingOldRevision();
    renderScreen("0");
    await loaded();
    expect(screen.queryByText(CONVERT_LABEL)).toBeNull();
    expect(screen.queryByRole("link", { name: CONVERT_LABEL })).toBeNull();
    expect(screen.queryByRole("button", { name: CONVERT_LABEL })).toBeNull();
  });

  it("yetkisiz (projects:full): pasif düğme ve gerekçesi de HİÇ yok", async () => {
    perm.levels.projects = "full";
    viewingOldRevision();
    renderScreen("0");
    await loaded();
    expect(screen.queryByRole("button", { name: CONVERT_LABEL })).toBeNull();
    expect(screen.queryByText("Projeye dönüştürme için Teklif Hazırlama sayfasında Onaylar yetkisi gerekir")).toBeNull();
  });
});

describe("dönüştürülmüş (ÜS-F5-4, T8)", () => {
  function converted(over: Partial<OfferDetailRead> = {}) {
    backend = wonBackend({
      conversion_state: "converted",
      project_id: PROJECT.id,
      project: PROJECT,
      converted_at: "2026-10-01T10:00:00Z",
      converted_by_name: "Furkan",
      ...over,
    });
    mockBackend();
  }

  it("düğme YOK; başlıkta 'Proje: {ad} →' proje rotasına (slug) gider; kilit bandı basılır", async () => {
    converted();
    renderScreen();
    await loaded();
    expect(screen.queryByText(CONVERT_LABEL)).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Proje: Güneşkent Konut →" });
    expect(link).toHaveAttribute("href", "/projeler/guneskent-konut");
    expect(screen.getByText(LOCK_BAND)).toBeInTheDocument();
  });

  it("slug yoksa proje kimliğiyle bağlanır", async () => {
    converted({ project: { ...PROJECT, slug: null } });
    renderScreen();
    await loaded();
    expect(screen.getByRole("link", { name: "Proje: Güneşkent Konut →" })).toHaveAttribute("href", `/projeler/${PROJECT.id}`);
  });

  it("proje künyesi okunamadıysa (yalnız project_id) 'Projeyi aç →' bağlantısı", async () => {
    converted({ project: null });
    renderScreen();
    await loaded();
    expect(screen.getByRole("link", { name: "Projeyi aç →" })).toHaveAttribute("href", `/projeler/${PROJECT.id}`);
    expect(screen.getByText(LOCK_BAND)).toBeInTheDocument();
  });
});

describe("Kazanıldı toast'u (ÜS-F5-25)", () => {
  async function winFromSent(level: string) {
    perm.levels.projects = level;
    const user = userEvent.setup();
    backend = wonBackend({ status: "sent", conversion_state: null });
    backend.revision = { ...backend.revision, status: "sent" };
    mockBackend();
    // Geçiş sonrası sunucu durumu: kazanıldı + dönüştürülmedi.
    vi.mocked(backendClient.POST).mockImplementation((async () => {
      backend = wonBackend();
      return ok(backend.detail);
    }) as never);
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Kazanıldı…" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Kazanıldı" }));
    return screen.findByText("Kazanıldı · projeye dönüştürme adımı açılacak");
  }

  it("yetkiliye metin AYNEN + 'Dönüştür →' bağlantısı", async () => {
    const toast = await winFromSent("admin");
    const link = within(toast.closest("[role='status']") as HTMLElement).getByRole("link", { name: "Dönüştür →" });
    expect(link).toHaveAttribute("href", `/teklif-hazirlama/${OFFER_ID}/donustur`);
  });

  it("yetkisize toast metni aynen, bağlantı YOK", async () => {
    const toast = await winFromSent("full");
    expect(within(toast.closest("[role='status']") as HTMLElement).queryByRole("link")).not.toBeInTheDocument();
  });
});
