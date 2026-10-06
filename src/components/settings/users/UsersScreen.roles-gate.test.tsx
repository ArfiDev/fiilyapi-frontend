import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsersScreen } from "./UsersScreen";
import { AHMET, createUsersBackend } from "./users-fake-backend.testkit";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5a · GET /roles = rol_yonetimi VEYA sayfa_izinleri Görür, YA DA kullanicilar Düzenler.
// Yalnız `ayarlar.kullanicilar` Görür olan kişide /roles 403 olurdu → istek HİÇ atılmamalı.
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

describe("UsersScreen · /roles isteği kapısı (IZN-F5a)", () => {
  it("yalnız ayarlar.kullanicilar Görür → GET /roles ATILMAZ, ekran çökmez", async () => {
    session.me = meFixture({ pages: { "ayarlar.kullanicilar": pageGrant("view") }, permissions: { users: "view" } });
    const backend = install();
    renderScreen();
    await screen.findByRole("cell", { name: /Ahmet Yılmaz/ });
    expect(backend.callsTo("GET", /^\/roles$/)).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Düzenle" })).toBeNull();
  });

  it("ayarlar.rol_yonetimi Görür → GET /roles atılır", async () => {
    session.me = meFixture({ pages: { "ayarlar.kullanicilar": pageGrant("view"), "ayarlar.rol_yonetimi": pageGrant("view") } });
    const backend = install();
    renderScreen();
    await screen.findByRole("cell", { name: /Ahmet Yılmaz/ });
    expect(backend.callsTo("GET", /^\/roles$/).length).toBeGreaterThan(0);
  });

  it("ayarlar.sayfa_izinleri Görür → GET /roles atılır", async () => {
    session.me = meFixture({ pages: { "ayarlar.kullanicilar": pageGrant("view"), "ayarlar.sayfa_izinleri": pageGrant("view") } });
    const backend = install();
    renderScreen();
    await screen.findByRole("cell", { name: /Ahmet Yılmaz/ });
    expect(backend.callsTo("GET", /^\/roles$/).length).toBeGreaterThan(0);
  });

  it("ayarlar.kullanicilar Düzenler → GET /roles atılır", async () => {
    session.me = meFixture({ pages: { "ayarlar.kullanicilar": pageGrant("edit") } });
    const backend = install();
    renderScreen();
    await screen.findByRole("cell", { name: /Ahmet Yılmaz/ });
    expect(backend.callsTo("GET", /^\/roles$/).length).toBeGreaterThan(0);
  });
});
