import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RolePagesUpdate } from "@/lib/api/models";
import { PageAccessScreen } from "./PageAccessScreen";
import { buildCatalogFixture, buildRolePagesFixture } from "./page-access.fixture";

const replaceMock = vi.fn();
const refreshMock = vi.fn(async () => {});
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => "/ayarlar/izin-matrisi",
}));
// IZN-F6a · kapılar yalnız sayfa izninden karar verir (`me` yok = KAPALI): ekran tam erişimli (SA olmayan) oturumla sınanır.
vi.mock("@/components/shell/SessionProvider", async () => {
  const { meFixture } = await import("@/lib/auth/page-grants.testkit");
  const me = meFixture();
  return { useSession: () => ({ me, isLoading: false, refresh: refreshMock }) };
});

const base = { is_assignable: true, is_locked: false, is_system: false };
const roles = [
  { ...base, id: "r-admin", key: "system_admin", name: "Sistem Yöneticisi", emoji: "🛡️", description: "Tam yetki", is_system: true, is_locked: true, user_count: 1 },
  { ...base, id: "r-chief", key: "site_chief", name: "Şantiye Şefi", emoji: "👷", description: "Saha ekibi", user_count: 3 },
  { ...base, id: "r-fin", key: "finance_manager", name: "Finans Müdürü", emoji: "💰", description: "Nakit akışı", user_count: 0 },
  { ...base, id: "r-hidden", key: "atanamaz", name: "Atanamaz Rol", emoji: "📄", description: "", user_count: 0, is_assignable: false },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

interface Stub {
  pagesByRole?: Record<string, object>;
  putResponse?: (request: Request) => Response;
}

function stubFetch({ pagesByRole = {}, putResponse }: Stub = {}) {
  const fetchMock = vi.fn(async (input: Request) => {
    const url = new URL(input.url);
    const rolePages = url.pathname.match(/\/roles\/([^/]+)\/pages$/);
    if (rolePages) {
      if (input.method === "PUT") {
        if (putResponse) return putResponse(input);
        const body = (await input.clone().json()) as RolePagesUpdate;
        return json({ ...buildRolePagesFixture(rolePages[1]), pages: body.pages, hidden_fields: body.hidden_fields });
      }
      return json(pagesByRole[rolePages[1]] ?? buildRolePagesFixture(rolePages[1]));
    }
    if (url.pathname.endsWith("/roles")) return json(roles);
    if (url.pathname.endsWith("/pages")) return json(buildCatalogFixture());
    return json(null);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function putCalls(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls.filter(([request]) => request.method === "PUT");
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PageAccessScreen />
    </QueryClientProvider>,
  );
}

async function openGroup(user: ReturnType<typeof userEvent.setup>, name: RegExp | string) {
  await user.click(await screen.findByRole("button", { name: new RegExp(`^${typeof name === "string" ? name : name.source}`, "i") }));
}

beforeEach(() => {
  search = "rol=r-chief";
});

afterEach(() => {
  vi.restoreAllMocks();
  replaceMock.mockReset();
  refreshMock.mockClear();
});

describe("PageAccessScreen · rol seçimi", () => {
  it("URL'deki rolün sayfa izinlerini GET /roles/{id}/pages ile yükler; atanamaz rol listede YOK", async () => {
    const fetchMock = stubFetch();
    renderScreen();

    expect(await screen.findByRole("heading", { name: "Şantiye Şefi" })).toBeInTheDocument();
    const requested = fetchMock.mock.calls.map(([request]) => request.url);
    expect(requested.some((url) => url.endsWith("/roles/r-chief/pages"))).toBe(true);
    expect(requested.some((url) => url.includes("/roles/r-admin/pages"))).toBe(false);
    expect(screen.queryByText("Atanamaz Rol")).toBeNull();
    expect(screen.getByText(/3 kullanıcı/, { selector: ".role-panel__sub" })).toBeInTheDocument();
  });

  it("?rol= yoksa kilitli olmayan ilk rol seçilir", async () => {
    search = "";
    const fetchMock = stubFetch();
    renderScreen();

    expect(await screen.findByRole("heading", { name: "Şantiye Şefi" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([request]) => request.url.endsWith("/roles/r-chief/pages"))).toBe(true);
  });

  it("başka role tıklamak seçimi URL'e (?rol=) yazar", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("heading", { name: "Şantiye Şefi" });

    await user.click(screen.getByRole("button", { name: /Finans Müdürü/ }));

    expect(replaceMock).toHaveBeenCalledWith("/ayarlar/izin-matrisi?rol=r-fin", { scroll: false });
  });

  it("Sistem Yöneticisi koyu kilitli kutudur; 'Yeni' rozeti yalnız yeni rollerde", async () => {
    stubFetch();
    renderScreen();
    await screen.findByRole("heading", { name: "Şantiye Şefi" });

    expect(screen.getByRole("button", { name: /Sistem Yöneticisi/ })).toHaveTextContent("her şey açık · değiştirilemez");
    expect(within(screen.getByRole("button", { name: /Finans Müdürü/ })).getByText("Yeni")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /Şantiye Şefi/ })).queryByText("Yeni")).toBeNull();
  });
});

describe("PageAccessScreen · düzenleme", () => {
  it("segment değişimi sayacı artırır ve satırda 'önce: X' etiketi çıkar", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderScreen();
    await openGroup(user, "Saha");

    expect(screen.queryByText(/kaydedilmemiş değişiklik/)).toBeNull();
    const kira = screen.getByRole("group", { name: "Makine & Ekipman › Kira Hakedişi erişim düzeyi" });
    await user.click(within(kira).getByRole("button", { name: "Görmez" }));

    expect(screen.getByRole("status")).toHaveTextContent("1 kaydedilmemiş değişiklik");
    expect(screen.getByText("önce: Görür")).toBeInTheDocument();
    expect(within(kira).getByRole("button", { name: "Görmez" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(kira).getByRole("button", { name: "Düzenler" }));
    expect(screen.getByRole("status")).toHaveTextContent("1 kaydedilmemiş değişiklik");
    await user.click(within(kira).getByRole("button", { name: "Görür" }));
    expect(screen.queryByText(/kaydedilmemiş değişiklik/)).toBeNull();
  });

  it("grup başlığındaki 'tümü:' seçici grubun tüm sayfalarını değiştirir", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderScreen();
    await openGroup(user, "Saha");

    await user.click(within(screen.getByRole("group", { name: "Saha grubunun tümü" })).getByRole("button", { name: "Görmez" }));

    // Saha 6 sayfa: 5'i Düzenler, 1'i Görür idi → hepsi değişti.
    expect(screen.getByRole("status")).toHaveTextContent("6 kaydedilmemiş değişiklik");
    expect(screen.getByRole("button", { name: /^Saha/ })).toHaveTextContent("6 Görmez");
  });

  it("Görmez'e geçince Onaylar devre dışı kalır, işareti kalkar ve kullanıcıya gösterilir", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderScreen();
    await openGroup(user, "Saha");

    const approve = screen.getByRole("checkbox", { name: "Günlük Kayıt · Onaylar" });
    expect(approve).toBeChecked();
    expect(approve).toBeEnabled();

    await user.click(within(screen.getByRole("group", { name: "Günlük Kayıt erişim düzeyi" })).getByRole("button", { name: "Görmez" }));

    expect(approve).toBeDisabled();
    expect(approve).not.toBeChecked();
    expect(screen.getByText("Onaylar kaldırıldı")).toBeInTheDocument();
    expect(screen.getByText("önce: Düzenler")).toBeInTheDocument();
  });

  it("Onaylar kutucuğu yalnız onay eylemi olan sayfada çizilir", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderScreen();
    await openGroup(user, "Saha");

    expect(screen.getByRole("checkbox", { name: "Günlük Kayıt · Onaylar" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Puantaj · Onaylar" })).toBeNull();
  });

  it("Vazgeç taslağı sunucu durumuna döndürür", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderScreen();
    await openGroup(user, "Saha");
    await user.click(within(screen.getByRole("group", { name: "Saha grubunun tümü" })).getByRole("button", { name: "Görür" }));
    expect(screen.getByRole("status")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Vazgeç" }));

    expect(screen.queryByText(/kaydedilmemiş değişiklik/)).toBeNull();
    expect(screen.getByRole("button", { name: /^Saha/ })).toHaveTextContent("5 Düzenler");
  });

  it("kaydedilmemiş değişiklik varken başka role geçmek onay ister; onaylanmadan URL değişmez", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderScreen();
    await openGroup(user, "Saha");
    await user.click(within(screen.getByRole("group", { name: "Saha grubunun tümü" })).getByRole("button", { name: "Görmez" }));

    await user.click(screen.getByRole("button", { name: /Finans Müdürü/ }));

    const dialog = await screen.findByRole("dialog");
    expect(replaceMock).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Düzenlemeye dön" }));
    expect(replaceMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Finans Müdürü/ }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Değişiklikleri at" }));
    expect(replaceMock).toHaveBeenCalledWith("/ayarlar/izin-matrisi?rol=r-fin", { scroll: false });
  });
});

describe("PageAccessScreen · Kaydet", () => {
  it("TEK PUT gönderir: değişmeyenler dahil 100 anahtar + hidden_fields; başarıda oturum tazelenir", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderScreen();
    await openGroup(user, "Saha");
    await user.click(
      within(screen.getByRole("group", { name: "Makine & Ekipman › Kira Hakedişi erişim düzeyi" })).getByRole("button", { name: "Düzenler" }),
    );
    await user.click(screen.getByRole("checkbox", { name: /Maliyet ve kâr/ }));

    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    const calls = putCalls(fetchMock);
    expect(calls).toHaveLength(1);
    const [request] = calls[0];
    expect(new URL(request.url).pathname.endsWith("/roles/r-chief/pages")).toBe(true);
    const body = (await request.clone().json()) as RolePagesUpdate;
    expect(Object.keys(body.pages)).toHaveLength(100);
    expect(body.pages["saha.makine_kira"]).toEqual({ level: "edit", approve: false });
    expect(body.pages["genel.gosterge_paneli"]).toEqual({ level: "view", approve: false });
    expect(body.hidden_fields).toEqual(["maliyet_kar", "maas_kisisel"]);
    // Başarıdan sonra taslak temiz: sayaç kalkar.
    await waitFor(() => expect(screen.queryByText(/kaydedilmemiş değişiklik/)).toBeNull());
  });

  it("422 detay metnini olduğu gibi gösterir ve taslağı KORUR", async () => {
    stubFetch({
      putResponse: () => json({ detail: "genel.onay_kutusu: onay eylemi yok · saha.puantaj: sayfa eksik" }, 422),
    });
    const user = userEvent.setup();
    renderScreen();
    await openGroup(user, "Saha");
    await user.click(within(screen.getByRole("group", { name: "Saha grubunun tümü" })).getByRole("button", { name: "Görmez" }));

    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "genel.onay_kutusu: onay eylemi yok · saha.puantaj: sayfa eksik",
    );
    expect(screen.getByRole("status")).toHaveTextContent("6 kaydedilmemiş değişiklik");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("değişiklik yokken Kaydet ve Vazgeç devre dışıdır", async () => {
    stubFetch();
    renderScreen();
    await screen.findByRole("heading", { name: "Şantiye Şefi" });

    expect(screen.getByRole("button", { name: "Kaydet" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Vazgeç" })).toBeDisabled();
  });
});

describe("PageAccessScreen · kilitli rol", () => {
  it("Sistem Yöneticisi salt okunurdur: Kaydet/Vazgeç yok, segment ve kutucuklar devre dışı", async () => {
    search = "rol=r-admin";
    stubFetch({ pagesByRole: { "r-admin": buildRolePagesFixture("r-admin", { is_locked: true, hidden_fields: [] }) } });
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("heading", { name: "Sistem Yöneticisi" });
    await openGroup(user, "Genel");
    await openGroup(user, "Saha");

    expect(screen.queryByRole("button", { name: "Kaydet" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Vazgeç" })).toBeNull();
    expect(screen.getByText(/değiştirilemez/, { selector: ".role-panel__locked" })).toBeInTheDocument();
    for (const button of within(screen.getByRole("group", { name: "Gösterge Paneli erişim düzeyi" })).getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByRole("checkbox", { name: /Maliyet ve kâr/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Günlük Kayıt · Onaylar" })).toBeDisabled();
  });
});

describe("PageAccessScreen · hassas alanlar", () => {
  it("6 kutucuk basılır; sunucudaki hidden_fields işaretli gelir", async () => {
    stubFetch();
    renderScreen();
    await screen.findByRole("heading", { name: "Şantiye Şefi" });

    const section = screen.getByRole("region", { name: "Hassas alanlar" });
    expect(within(section).getAllByRole("checkbox")).toHaveLength(6);
    expect(within(section).getByRole("checkbox", { name: /Maaş ve kişisel bilgiler/ })).toBeChecked();
    expect(within(section).getByRole("checkbox", { name: /Tüm tutarlar/ })).not.toBeChecked();
  });

});

describe("PageAccessScreen · yetki", () => {
  it("403 (rol listesi) AccessDenied gösterir", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ detail: "yasak" }, 403)));
    renderScreen();
    expect(await screen.findByText(/yetkiniz yok|erişim/i)).toBeInTheDocument();
  });
});
