import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";

import { OfferCreateScreen } from "./OfferCreateScreen";
import { makeOffer } from "./offer-fixtures";

/**
 * TKL-F4.7 · Yeni teklif › "Nereden başlansın?" — Boş / Şablondan / Mevcut tekliften kopyala (plan §4).
 * Oran/koşul ezmesi (K-F4-3, §9 risk 2) ve TÜİK ezmesi burada EKRAN düzeyinde bağlanır.
 */
const perm = vi.hoisted(() => ({ levels: { contracts: "full", projects: "admin" } as Record<string, string | undefined> }));
const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn() } }));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: (moduleKey: string) => {
    const level = perm.levels[moduleKey];
    return { level, canView: level !== "none", canWrite: true, canDelete: true };
  },
}));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => ({ isRestricted: false, names: [] }) }));
// IZN-F6a · kapılar yalnız sayfa izninden karar verir: `perm.levels` (modül niyeti) sayfa izne çevrilir —
// contracts → teklif.teklif_hazirlama (full = Düzenler), projects → genel.projeler (admin = Düzenler).
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => {
    const offerLevel = perm.levels.contracts;
    const projectLevel = perm.levels.projects;
    const pages = {
      "teklif.teklif_hazirlama": { level: offerLevel === "full" ? "edit" : (offerLevel ?? "none"), approve: false },
      "genel.projeler": { level: projectLevel === "admin" ? "edit" : (projectLevel ?? "none"), approve: false },
    };
    return { me: { full_name: "Ahmet Yılmaz", pages }, isLoading: false, error: false, refresh: vi.fn() };
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const SETTINGS = {
  default_overhead_pct: "12.00",
  default_profit_pct: "15.00",
  default_vat_pct: "20.00",
  default_validity_days: 30,
  default_payment_terms: "Ödeme aylık hakedişle, 30 gün vadeli",
  updated_at: "2026-10-01T09:00:00Z",
};
const EMPLOYERS = {
  items: [
    { id: "emp-1", name: "Kuzey Gayrimenkul A.Ş.", tax_number: null, contact_person: null },
    { id: "emp-2", name: "Liman İşletmeleri A.Ş.", tax_number: null, contact_person: null },
  ],
  total: 2,
};

function template(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Şablon ${id}`,
    description: null,
    overhead_pct: null,
    profit_pct: null,
    is_default: false,
    group_count: 2,
    item_count: 10,
    usage_count: 0,
    updated_at: "2026-10-01T09:00:00Z",
    ...overrides,
  };
}
const T_DEFAULT = template("tpl-def", {
  name: "Konut · kaba inşaat",
  is_default: true,
  overhead_pct: "9.50",
  profit_pct: "11.00",
  item_count: 38,
  group_count: 6,
});
const T_OTHER = template("tpl-2", { name: "Dış cephe mantolama", overhead_pct: "14.00", profit_pct: "18.00", item_count: 14, group_count: 2 });
const T_PLAIN = template("tpl-3", { name: "Altyapı + çevre düzenleme", item_count: 26, group_count: 3 });

const SOURCE = makeOffer({
  offer_no: "TKL-2026-0011",
  id: "off-11",
  title: "Güneşkent Konut C-Blok",
  employer_id: "emp-2",
  employer_name: "Liman İşletmeleri A.Ş.",
  scope_summary: "Kaba inşaat · 3 blok",
  rev_no: 2,
  status: "won",
  net: "48750000.00",
});
const MASKED = makeOffer({ offer_no: "TKL-2026-0013", id: "off-13", title: "Ataköy Rezidans B Blok", status: "sent", rev_no: 0, net: null });
const SOURCE_REVISION = {
  rev_no: 2,
  validity_days: 45,
  overhead_pct: "8.00",
  profit_pct: "11.25",
  vat_pct: "10.00",
  price_escalation: "tuik",
  price_index_type: "tufe",
};

function ok(data: unknown, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) } as never;
}
function fail(status: number, detail: string) {
  return { data: undefined, error: { detail }, response: new Response(null, { status }) } as never;
}

interface Remote {
  templates: unknown[];
  offers: unknown[];
  revision: unknown;
}
function mockGets(overrides: Partial<Remote> = {}) {
  const remote: Remote = { templates: [T_DEFAULT, T_OTHER, T_PLAIN], offers: [SOURCE, MASKED], revision: ok(SOURCE_REVISION), ...overrides };
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/offers/settings") return ok(SETTINGS);
    if (path === "/employers") return ok(EMPLOYERS);
    if (path === "/offers/templates") return ok({ items: remote.templates, total: remote.templates.length });
    if (path === "/offers") return ok({ items: remote.offers, total: remote.offers.length });
    if (path === "/offers/{offer_id}/revisions/{rev_no}") return remote.revision;
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
}

function renderScreen(initialTemplateId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OfferCreateScreen initialTemplateId={initialTemplateId} />
    </QueryClientProvider>,
  );
}

async function loaded() {
  await screen.findByRole("heading", { name: "Yeni Teklif" });
  await screen.findByRole("option", { name: "Kuzey Gayrimenkul A.Ş." });
}

function postBody(): Record<string, unknown> {
  const call = vi.mocked(backendClient.POST).mock.calls.find((c) => String(c[0]) === "/offers");
  return (call?.[1] as unknown as { body: Record<string, unknown> }).body;
}
function getCalls(path: string) {
  return vi.mocked(backendClient.GET).mock.calls.filter((c) => String(c[0]) === path);
}

const gg = () => screen.getByRole("textbox", { name: /Genel gider/ });
const kar = () => screen.getByRole("textbox", { name: /Kâr/ });
const summary = () => screen.getByRole("complementary", { name: "Oluşturulacak teklif" });
const submitButton = () => screen.getByRole("button", { name: /Teklifi oluştur/ });

async function chooseTemplateStart(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: /Şablondan/ }));
  await screen.findByRole("radio", { name: /Konut · kaba inşaat/ });
}
async function chooseCopyStart(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: /Mevcut tekliften kopyala/ }));
  await screen.findByRole("radio", { name: /TKL-2026-0011/ });
}
async function fillEmployerAndTitle(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByRole("combobox", { name: /İşveren/ }), "emp-1");
  await user.type(screen.getByRole("textbox", { name: /İş adı/ }), "Ataköy Rezidans C Blok");
}

beforeEach(() => {
  vi.clearAllMocks();
  perm.levels = { contracts: "full", projects: "admin" };
  vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: "o-77", offer_no: "TKL-2026-0015" }, 201));
});

describe("başlangıç seçici (Yakında kalktı)", () => {
  it("üç seçenek de etkin; 'Yakında' rozeti ve gerekçe başlığı YOK; Boş teklif seçili gelir", async () => {
    mockGets();
    renderScreen();
    await loaded();
    for (const name of [/Boş teklif/, /Şablondan/, /Mevcut tekliften kopyala/]) {
      const option = screen.getByRole("radio", { name });
      expect(option).toBeEnabled();
      expect(option).not.toHaveAttribute("title");
    }
    expect(screen.queryByText("Yakında")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Boş teklif/ })).toBeChecked();
  });

  it("'Şablonları yönet →' şablon yönetim ekranına bağlantıdır", async () => {
    mockGets();
    renderScreen();
    await loaded();
    expect(screen.getByRole("link", { name: "Şablonları yönet →" })).toHaveAttribute("href", "/teklif-hazirlama/sablonlar");
  });

  it("boş başlangıçta şablon ve teklif listeleri HİÇ istenmez", async () => {
    mockGets();
    renderScreen();
    await loaded();
    expect(getCalls("/offers/templates")).toHaveLength(0);
    expect(getCalls("/offers")).toHaveLength(0);
  });
});

describe("Şablondan", () => {
  it("kart ızgarası: ad + 'x kalem · y grup'; VARSAYILAN şablon önseçili (kullanıcı seçince önerilir)", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await chooseTemplateStart(user);
    const group = screen.getByRole("radiogroup", { name: "Şablon" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).getByText("38 kalem · 6 grup")).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: /Konut · kaba inşaat/ })).toBeChecked();
    expect(within(group).getByRole("radio", { name: /Dış cephe mantolama/ })).not.toBeChecked();
  });

  it("varsayılan şablon listenin başında değilse de o önseçilir", async () => {
    const user = userEvent.setup();
    mockGets({ templates: [T_OTHER, template("tpl-d2", { name: "Varsayılan B", is_default: true })] });
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("radio", { name: /Şablondan/ }));
    expect(await screen.findByRole("radio", { name: /Varsayılan B/ })).toBeChecked();
  });

  it("K-F4-3 · seçim GG/Kâr'ı ŞABLON oranıyla doldurur ve gövde ŞABLON oranını taşır (ayar ezmez)", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await fillEmployerAndTitle(user);
    await chooseTemplateStart(user);
    await waitFor(() => expect(gg()).toHaveValue("9,5"));
    expect(kar()).toHaveValue("11");
    expect(within(summary()).getByText("GG %9,5 · Kâr %11 · KDV %20")).toBeInTheDocument();
    await user.click(submitButton());
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/teklif-hazirlama/o-77"));
    expect(postBody()).toMatchObject({
      template_id: "tpl-def",
      overhead_pct: "9.5",
      profit_pct: "11",
      vat_pct: "20",
      price_escalation: "fixed",
    });
    expect(postBody()).not.toHaveProperty("copy_from");
    expect(postBody()).not.toHaveProperty("payment_terms");
  });

  it("şablonda boş oran AYARDAN gelir (şablon ?? ayar)", async () => {
    const user = userEvent.setup();
    mockGets({ templates: [T_PLAIN] });
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("radio", { name: /Şablondan/ }));
    await screen.findByRole("radio", { name: /Altyapı/ });
    expect(gg()).toHaveValue("12");
    expect(kar()).toHaveValue("15");
  });

  it("şablon DEĞİŞİNCE oranlar yeni şablona göre yeniden doldurulur (elle girilen de ezilir — GECE KURALI)", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await chooseTemplateStart(user);
    await waitFor(() => expect(gg()).toHaveValue("9,5"));
    await user.clear(gg());
    await user.type(gg(), "7");
    await user.click(screen.getByRole("radio", { name: /Dış cephe mantolama/ }));
    expect(gg()).toHaveValue("14");
    expect(kar()).toHaveValue("18");
    expect(within(summary()).getByText("Şablon · Dış cephe mantolama")).toBeInTheDocument();
  });

  it("aynı şablona tekrar tıklamak elle girilen oranı ezmez", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await chooseTemplateStart(user);
    await waitFor(() => expect(gg()).toHaveValue("9,5"));
    await user.clear(gg());
    await user.type(gg(), "7");
    await user.click(screen.getByRole("radio", { name: /Konut · kaba inşaat/ }));
    expect(gg()).toHaveValue("7");
  });

  it("?sablon= : form o şablon önseçili ve 'Şablondan' açık gelir, oranlar dolu (tıklama gerekmez)", async () => {
    mockGets();
    renderScreen("tpl-2");
    await loaded();
    expect(screen.getByRole("radio", { name: /Şablondan/ })).toBeChecked();
    expect(await screen.findByRole("radio", { name: /Dış cephe mantolama/ })).toBeChecked();
    expect(gg()).toHaveValue("14");
    expect(kar()).toHaveValue("18");
    expect(within(summary()).getByText("Şablon · Dış cephe mantolama")).toBeInTheDocument();
  });

  it("?sablon= silinmiş/bilinmeyen kimlikse varsayılan şablon önseçilir", async () => {
    mockGets();
    renderScreen("yok-boyle-sablon");
    await loaded();
    expect(await screen.findByRole("radio", { name: /Konut · kaba inşaat/ })).toBeChecked();
    expect(gg()).toHaveValue("9,5");
  });

  it("?sablon= ile açılış formu kirli SAYMAZ (kullanıcı henüz bir şey yazmadı)", async () => {
    const { unsavedRegistry } = await import("@/lib/workspace-tabs/unsaved-registry");
    mockGets();
    renderScreen("tpl-2");
    await loaded();
    await screen.findByRole("radio", { name: /Dış cephe mantolama/ });
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("şablon yoksa 'Henüz şablon yok' + Şablonları yönet bağlantısı; gönderim durur", async () => {
    const user = userEvent.setup();
    mockGets({ templates: [] });
    renderScreen();
    await loaded();
    await fillEmployerAndTitle(user);
    await user.click(screen.getByRole("radio", { name: /Şablondan/ }));
    expect(await screen.findByText(/Henüz şablon yok/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Şablonları yönet →" }).length).toBeGreaterThan(0);
    await user.click(submitButton());
    expect(await screen.findByText("Bir şablon seçin")).toBeInTheDocument();
    expect(vi.mocked(backendClient.POST)).not.toHaveBeenCalled();
  });

  it("Şablondan → Boş: oranlar AYARA döner, gövdede template_id YOK", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await fillEmployerAndTitle(user);
    await chooseTemplateStart(user);
    await waitFor(() => expect(gg()).toHaveValue("9,5"));
    await user.click(screen.getByRole("radio", { name: /Boş teklif/ }));
    expect(gg()).toHaveValue("12");
    expect(kar()).toHaveValue("15");
    expect(within(summary()).getByText("Boş teklif")).toBeInTheDocument();
    await user.click(submitButton());
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(postBody()).not.toHaveProperty("template_id");
    expect(postBody()).toMatchObject({ overhead_pct: "12", profit_pct: "15" });
  });

  it("404 'Teklif şablonu bulunamadı': bant AYNEN + şablon listesi tazelenir", async () => {
    const user = userEvent.setup();
    mockGets();
    vi.mocked(backendClient.POST).mockResolvedValue(fail(404, "Teklif şablonu bulunamadı"));
    renderScreen();
    await loaded();
    await fillEmployerAndTitle(user);
    await chooseTemplateStart(user);
    expect(getCalls("/offers/templates")).toHaveLength(1);
    await user.click(submitButton());
    expect(await screen.findByText("Teklif şablonu bulunamadı")).toBeInTheDocument();
    await waitFor(() => expect(getCalls("/offers/templates").length).toBeGreaterThan(1));
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe("Mevcut tekliften kopyala", () => {
  it("liste: radyo · TKL no · iş adı · KDV hariç net (kompakt) · durum; maskeli net '—'", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await chooseCopyStart(user);
    const group = screen.getByRole("radiogroup", { name: "Kopyalanacak teklif" });
    const row = within(group).getByRole("radio", { name: /TKL-2026-0011/ });
    expect(within(row).getByText("Güneşkent Konut C-Blok")).toBeInTheDocument();
    expect(within(row).getByText("₺48,8 M")).toBeInTheDocument();
    expect(within(row).getByText("Kazanıldı")).toBeInTheDocument();
    const masked = within(group).getByRole("radio", { name: /TKL-2026-0013/ });
    expect(within(masked).getByText("—")).toBeInTheDocument();
    expect(within(masked).getByText("Gönderildi")).toBeInTheDocument();
    expect(getCalls("/offers")[0]?.[1]).toMatchObject({ params: { query: { limit: 8 } } });
  });

  it("arama kutusu sunucuya q gönderir (ilk 8 sınırı korunur); Enter formu GÖNDERMEZ", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await fillEmployerAndTitle(user);
    await chooseCopyStart(user);
    const search = screen.getByRole("searchbox", { name: "Teklif no, iş adı ya da işveren ara" });
    await user.type(search, "Liman{Enter}");
    await waitFor(() =>
      expect(getCalls("/offers").some((c) => (c[1] as { params: { query: { q?: string } } }).params.query.q === "Liman")).toBe(true),
    );
    // Form gönderilseydi (işveren + iş adı dolu) başlangıç eksikliği bandı çıkardı.
    expect(screen.queryByText("Kopyalanacak teklifi seçin")).not.toBeInTheDocument();
    expect(vi.mocked(backendClient.POST)).not.toHaveBeenCalled();
  });

  it("sonuç yoksa boş durum metni", async () => {
    const user = userEvent.setup();
    mockGets({ offers: [] });
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("radio", { name: /Mevcut tekliften kopyala/ }));
    expect(await screen.findByText("Eşleşen teklif yok")).toBeInTheDocument();
  });

  it("seçim işveren + iş adı + kapsamı satırdan, geçerlilik/GG/Kâr/KDV'yi KAYNAK REVİZYONDAN doldurur", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await chooseCopyStart(user);
    await user.click(screen.getByRole("radio", { name: /TKL-2026-0011/ }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: /İşveren/ })).toHaveValue("emp-2"));
    expect(screen.getByRole("textbox", { name: /İş adı/ })).toHaveValue("Güneşkent Konut C-Blok");
    expect(screen.getByRole("textbox", { name: /Kapsam özeti/ })).toHaveValue("Kaba inşaat · 3 blok");
    await waitFor(() => expect(gg()).toHaveValue("8"));
    expect(kar()).toHaveValue("11,25");
    expect(screen.getByRole("textbox", { name: /KDV/ })).toHaveValue("10");
    expect(screen.getByRole("textbox", { name: /Geçerlilik/ })).toHaveValue("45");
    expect(within(summary()).getByText("Kopya · TKL-2026-0011 Rev.2")).toBeInTheDocument();
  });

  it("kaynak = SON revizyon: revizyon okuması liste satırının rev_no'suyla (0 değil) yapılır", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await chooseCopyStart(user);
    await user.click(screen.getByRole("radio", { name: /TKL-2026-0011/ }));
    await waitFor(() => expect(getCalls("/offers/{offer_id}/revisions/{rev_no}")).toHaveLength(1));
    expect(getCalls("/offers/{offer_id}/revisions/{rev_no}")[0]?.[1]).toMatchObject({
      params: { path: { offer_id: "off-11", rev_no: 2 } },
    });
  });

  it("TÜİK ezmesi · gövde kaynağın price_escalation + price_index_type'ını AÇIKÇA taşır; payment/teslim/not YOK", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await chooseCopyStart(user);
    await user.click(screen.getByRole("radio", { name: /TKL-2026-0011/ }));
    await waitFor(() => expect(gg()).toHaveValue("8"));
    await user.click(submitButton());
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/teklif-hazirlama/o-77"));
    const body = postBody();
    expect(body).toMatchObject({
      employer_id: "emp-2",
      title: "Güneşkent Konut C-Blok",
      scope_summary: "Kaba inşaat · 3 blok",
      validity_days: 45,
      overhead_pct: "8",
      profit_pct: "11.25",
      vat_pct: "10",
      price_escalation: "tuik",
      price_index_type: "tufe",
      copy_from: { offer_id: "off-11", rev_no: 2 },
    });
    for (const field of ["template_id", "payment_terms", "delivery_days", "notes"]) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it("kopyada kullanıcının sonradan değiştirdiği iş adı/oran gövdeye girer (kaynağı ezer)", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await chooseCopyStart(user);
    await user.click(screen.getByRole("radio", { name: /TKL-2026-0011/ }));
    await waitFor(() => expect(gg()).toHaveValue("8"));
    const title = screen.getByRole("textbox", { name: /İş adı/ });
    await user.clear(title);
    await user.type(title, "Güneşkent D-Blok");
    await user.clear(gg());
    await user.type(gg(), "9");
    await user.click(submitButton());
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(postBody()).toMatchObject({ title: "Güneşkent D-Blok", overhead_pct: "9" });
  });

  it("kaynak seçilmeden gönderim durur: 'Kopyalanacak teklifi seçin'", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await fillEmployerAndTitle(user);
    await chooseCopyStart(user);
    await user.click(submitButton());
    expect(await screen.findByText("Kopyalanacak teklifi seçin")).toBeInTheDocument();
    expect(vi.mocked(backendClient.POST)).not.toHaveBeenCalled();
  });

  it("revizyon yüklenmeden gönderim durur (fiyat farkı bilinmeden TÜİK ezilmesin)", async () => {
    const user = userEvent.setup();
    mockGets({ revision: new Promise(() => {}) });
    renderScreen();
    await loaded();
    await chooseCopyStart(user);
    await user.click(screen.getByRole("radio", { name: /TKL-2026-0011/ }));
    await user.click(submitButton());
    expect(await screen.findByText("Kaynak teklif yükleniyor")).toBeInTheDocument();
    expect(vi.mocked(backendClient.POST)).not.toHaveBeenCalled();
  });

  it("kaynak revizyon 404: bant AYNEN + teklif listesi tazelenir; POST atılmaz", async () => {
    const user = userEvent.setup();
    mockGets({ revision: fail(404, "Teklif revizyonu bulunamadı") });
    renderScreen();
    await loaded();
    await chooseCopyStart(user);
    const before = getCalls("/offers").length;
    await user.click(screen.getByRole("radio", { name: /TKL-2026-0011/ }));
    expect(await screen.findByText("Teklif revizyonu bulunamadı")).toBeInTheDocument();
    await waitFor(() => expect(getCalls("/offers").length).toBeGreaterThan(before));
    await user.click(submitButton());
    expect(vi.mocked(backendClient.POST)).not.toHaveBeenCalled();
  });

  it("POST 404 'Teklif bulunamadı': bant AYNEN + teklif listesi tazelenir", async () => {
    const user = userEvent.setup();
    mockGets();
    vi.mocked(backendClient.POST).mockResolvedValue(fail(404, "Teklif bulunamadı"));
    renderScreen();
    await loaded();
    await chooseCopyStart(user);
    await user.click(screen.getByRole("radio", { name: /TKL-2026-0011/ }));
    await waitFor(() => expect(gg()).toHaveValue("8"));
    const before = getCalls("/offers").length;
    await user.click(submitButton());
    expect(await screen.findByText("Teklif bulunamadı")).toBeInTheDocument();
    await waitFor(() => expect(getCalls("/offers").length).toBeGreaterThan(before));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("Kopya → Boş: koşullar AYARA döner; kopya/TÜİK gövdeye sızmaz", async () => {
    const user = userEvent.setup();
    mockGets();
    renderScreen();
    await loaded();
    await chooseCopyStart(user);
    await user.click(screen.getByRole("radio", { name: /TKL-2026-0011/ }));
    await waitFor(() => expect(gg()).toHaveValue("8"));
    await user.click(screen.getByRole("radio", { name: /Boş teklif/ }));
    expect(gg()).toHaveValue("12");
    expect(screen.getByRole("textbox", { name: /Geçerlilik/ })).toHaveValue("30");
    await user.click(submitButton());
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const body = postBody();
    expect(body).not.toHaveProperty("copy_from");
    expect(body).not.toHaveProperty("price_index_type");
    expect(body.price_escalation).toBe("fixed");
  });

  it("kaynağın işvereni aktif listede yoksa da seçenek olarak görünür (boş seçim yanılsaması yok)", async () => {
    const user = userEvent.setup();
    const inactive = makeOffer({ offer_no: "TKL-2026-0007", id: "off-7", employer_id: "emp-x", employer_name: "Eski Yapı Ltd.", rev_no: 1 });
    mockGets({ offers: [inactive] });
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("radio", { name: /Mevcut tekliften kopyala/ }));
    await user.click(await screen.findByRole("radio", { name: /TKL-2026-0007/ }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: /İşveren/ })).toHaveValue("emp-x"));
    expect(screen.getByRole("option", { name: "Eski Yapı Ltd." })).toBeInTheDocument();
  });
});
