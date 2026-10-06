import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsersScreen } from "./UsersScreen";
import { AHMET, createUsersBackend } from "./users-fake-backend.testkit";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5a · GET /roles = rol_yonetimi VEYA sayfa_izinleri Görür, YA DA kullanicilar Düzenler.
// IZN-F5a.2 · liste rol adını/anahtarını `UserResponse.role_name/role_key`'den okur: /roles yetkisiz
// (yalnız kullanicilar Görür) kişide de rol görünür ve liste /roles'u HİÇ istemez.
const session = vi.hoisted(() => ({ me: null as unknown }));
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: session.me, isLoading: false, refresh: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/ayarlar/kullanicilar",
}));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UsersScreen />
    </QueryClientProvider>,
  );
}

function install() {
  const fake = createUsersBackend({ users: [AHMET] });
  vi.stubGlobal("fetch", vi.fn(fake.fetch));
  return fake;
}

beforeEach(() => {
  session.me = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UsersScreen · rol hücresi role_name/role_key'den (IZN-F5a.2)", () => {
  it("yalnız ayarlar.kullanicilar Görür → rol adı görünür, GET /roles ATILMAZ, ekran çökmez", async () => {
    session.me = meFixture({ pages: { "ayarlar.kullanicilar": pageGrant("view") } });
    const backend = install();
    renderScreen();
    const row = (await screen.findByRole("cell", { name: /Ahmet Yılmaz/ })).closest("tr") as HTMLElement;
    expect(within(row).getByText("Şantiye Şefi", { selector: ".role-pill" })).toBeInTheDocument();
    expect(backend.callsTo("GET", /^\/roles$/)).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Düzenle" })).toBeNull();
  });

  it("rol adı kullanıcı satırından gelir (rol listesinden değil)", async () => {
    session.me = meFixture({ pages: { "ayarlar.kullanicilar": pageGrant("view") } });
    const fake = createUsersBackend({ users: [{ ...AHMET, role_name: "Satırdan Gelen Ad", role_key: "patron" }] });
    vi.stubGlobal("fetch", vi.fn(fake.fetch));
    renderScreen();
    const row = (await screen.findByRole("cell", { name: /Ahmet Yılmaz/ })).closest("tr") as HTMLElement;
    expect(within(row).getByText("Satırdan Gelen Ad", { selector: ".role-pill" })).toBeInTheDocument();
  });

  it("role_name boşsa '—' basılır", async () => {
    session.me = meFixture({ pages: { "ayarlar.kullanicilar": pageGrant("view") } });
    const fake = createUsersBackend({ users: [{ ...AHMET, role_name: "", role_key: "" }] });
    vi.stubGlobal("fetch", vi.fn(fake.fetch));
    renderScreen();
    const row = (await screen.findByRole("cell", { name: /Ahmet Yılmaz/ })).closest("tr") as HTMLElement;
    expect(row.querySelector(".role-pill")).toBeNull();
    expect(within(row).getByText("—")).toBeInTheDocument();
  });
});
