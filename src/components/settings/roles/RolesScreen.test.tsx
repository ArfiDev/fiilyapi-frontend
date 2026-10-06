import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RolesScreen } from "./RolesScreen";

// IZN-F6a · rol silme = `need: "sa"` (yalnız sistem yöneticisi): varsayılan oturum SA; SA olmayan test kapatır.
const session = vi.hoisted(() => ({ isSystemAdmin: true }));
vi.mock("@/components/shell/SessionProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/shell/SessionProvider")>();
  const { meFixture } = await import("@/lib/auth/page-grants.testkit");
  return {
    ...actual,
    useSession: () => ({ ...actual.SESSION_CONTEXT_DEFAULT, me: meFixture({ isSystemAdmin: session.isSystemAdmin }), isLoading: false }),
  };
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RolesScreen />
    </QueryClientProvider>,
  );
}

const base = { is_assignable: true, is_locked: false, is_system: false };
const roles = [
  { ...base, id: "r1", key: "system_admin", name: "Sistem Yöneticisi", emoji: "🛡️", description: "Tam yetki", is_system: true, is_locked: true, user_count: 1 },
  { ...base, id: "r2", key: "site_chief", name: "Şantiye Şefi", emoji: "👷", description: "Saha ekibi", user_count: 3 },
  { ...base, id: "r3", key: "finance_manager", name: "Finans Müdürü", emoji: "💰", description: "Nakit akışı", user_count: 0 },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Handler = (request: Request) => Response | undefined;

function stubFetch(handler: Handler = () => undefined, roleList: readonly object[] = roles) {
  const fetchMock = vi.fn(async (input: Request) => {
    const custom = handler(input);
    if (custom) return custom;
    if (input.url.endsWith("/roles") && input.method === "GET") return json(roleList);
    return json(null);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();
  session.isSystemAdmin = true;
});

describe("RolesScreen · Rol Yönetimi kartları", () => {
  it("her rol için kart basar: ad, kullanıcı sayısı (user_count) ve açıklama", async () => {
    stubFetch();
    renderScreen();

    const chief = await screen.findByRole("article", { name: "Şantiye Şefi" });
    expect(within(chief).getByText("3 kullanıcı")).toBeInTheDocument();
    expect(within(chief).getByText("Saha ekibi")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Finans Müdürü" })).getByText("0 kullanıcı")).toBeInTheDocument();
  });

  it("'Sayfa İzinleri'ni aç' bağlantısı o rol seçili açar (?rol=)", async () => {
    stubFetch();
    renderScreen();

    const chief = await screen.findByRole("article", { name: "Şantiye Şefi" });
    expect(within(chief).getByRole("link", { name: /Sayfa İzinleri'ni aç/ })).toHaveAttribute(
      "href",
      "/ayarlar/izin-matrisi?rol=r2",
    );
  });

  it("Sil yalnız kullanıcısı olmayan ve kilitli olmayan rolde görünür", async () => {
    stubFetch();
    renderScreen();
    await screen.findByRole("article", { name: "Şantiye Şefi" });

    const deleteButtons = screen.getAllByRole("button", { name: "Sil" });
    expect(deleteButtons).toHaveLength(1);
    expect(within(screen.getByRole("article", { name: "Finans Müdürü" })).getByRole("button", { name: "Sil" })).toBe(
      deleteButtons[0],
    );
    expect(within(screen.getByRole("article", { name: "Şantiye Şefi" })).queryByRole("button", { name: "Sil" })).toBeNull();
    expect(within(screen.getByRole("article", { name: "Sistem Yöneticisi" })).queryByRole("button", { name: "Sil" })).toBeNull();
  });

  it("'Süper' / eski düzey metni ve tam erişim bandı YOKTUR; 'Sayfa İzinleri'nde ayarlanır' notu yalnız sayfa üstünde", async () => {
    stubFetch();
    renderScreen();
    await screen.findByRole("article", { name: "Şantiye Şefi" });

    expect(screen.queryByText(/Süper/)).toBeNull();
    expect(screen.queryByText(/Modül Erişimleri/)).toBeNull();
    expect(screen.queryByText(/tam erişime sahiptir/)).toBeNull();
    // Not YALNIZ üstteki bantta: kartların içinde tekrarlanmaz.
    expect(screen.getAllByText(/İzinler Sayfa İzinleri ekranında ayarlanır/)).toHaveLength(1);
  });

  it("kilitli Sistem Yöneticisi kartı koyu kilit metniyle gelir, Kopyala sunulur", async () => {
    stubFetch();
    renderScreen();

    const admin = await screen.findByRole("article", { name: "Sistem Yöneticisi" });
    expect(within(admin).getByText(/her şey açık · değiştirilemez · silinemez/)).toBeInTheDocument();
    expect(within(admin).getByText("Sayfa İzinleri'nde kilitli")).toBeInTheDocument();
    expect(within(admin).getByRole("button", { name: "Kopyala" })).toBeInTheDocument();
  });

  it("Kopyala yeni ad sorar ve POST /roles/{id}/copy gönderir", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch((request) => {
      if (request.method === "POST" && request.url.includes("/roles/r2/copy")) {
        return json({ ...roles[1], id: "r9", name: "Şantiye Şefi 2", user_count: 0 }, 201);
      }
      return undefined;
    });
    renderScreen();

    await user.click(within(await screen.findByRole("article", { name: "Şantiye Şefi" })).getByRole("button", { name: "Kopyala" }));
    const dialog = await screen.findByRole("dialog");
    const nameInput = within(dialog).getByLabelText(/Yeni rol adı/);
    expect(nameInput).toHaveValue("Şantiye Şefi (Kopya)");
    await user.clear(nameInput);
    await user.type(nameInput, "Şantiye Şefi 2");
    await user.click(within(dialog).getByRole("button", { name: "Kopyala" }));

    await waitFor(() => {
      const copyCall = fetchMock.mock.calls.find(([request]) => request.method === "POST" && request.url.includes("/roles/r2/copy"));
      expect(copyCall).toBeDefined();
    });
    const [request] = fetchMock.mock.calls.find(([r]) => r.method === "POST" && r.url.includes("/roles/r2/copy"))!;
    expect(await request.clone().json()).toEqual({ name: "Şantiye Şefi 2", emoji: "👷", description: "Saha ekibi" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("SA olmayan (Düzenler) kullanıcıda kartlar görünür ama HİÇBİR rolde Sil yok", async () => {
    session.isSystemAdmin = false;
    stubFetch();
    renderScreen();
    await screen.findByRole("article", { name: "Finans Müdürü" });
    expect(screen.queryAllByRole("button", { name: "Sil" })).toHaveLength(0);
  });

  it("rol silme reddedilince modal açık kalır ve hata metni görünür", async () => {
    const user = userEvent.setup();
    stubFetch((request) => {
      if (request.method === "DELETE" && request.url.includes("/roles/r3")) {
        return json({ detail: "Bu role atanmış kullanıcılar var" }, 409);
      }
      return undefined;
    });
    renderScreen();

    await user.click(within(await screen.findByRole("article", { name: "Finans Müdürü" })).getByRole("button", { name: "Sil" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Sil" }));

    expect(await within(dialog).findByText(/atanmış kullanıcılar var/)).toBeInTheDocument();
    expect(within(dialog).getByText(/rolünü silmek istediğinize emin misiniz/)).toBeInTheDocument();
  });

  it("atanamaz roller (is_assignable=false) kart olmaz; atanabilir roller görünür", async () => {
    stubFetch(undefined, [
      ...roles,
      { ...base, id: "r4", key: "sayfa_rolu", name: "Sayfa Rolü", emoji: "📄", description: "", is_assignable: false, user_count: 0 },
    ]);
    renderScreen();

    expect(await screen.findByRole("article", { name: "Şantiye Şefi" })).toBeInTheDocument();
    expect(screen.queryByText("Sayfa Rolü")).not.toBeInTheDocument();
  });

  it("'Yeni' rozeti yalnız 6 yeni rol anahtarında görünür", async () => {
    stubFetch();
    renderScreen();

    expect(within(await screen.findByRole("article", { name: "Finans Müdürü" })).getByText("Yeni")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Şantiye Şefi" })).queryByText("Yeni")).toBeNull();
  });
});
