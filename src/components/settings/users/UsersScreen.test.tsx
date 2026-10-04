import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsersScreen } from "./UsersScreen";
import { AHMET, AYSE, KADIR, createUsersBackend, type FakeBackendOptions } from "./users-fake-backend.testkit";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push }),
  usePathname: () => "/ayarlar/kullanicilar",
}));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UsersScreen />
    </QueryClientProvider>,
  );
}

/** Sahte backend'i global fetch'e bağlar; çağrı kayıtlarını döndürür. */
function install(options?: FakeBackendOptions) {
  const fake = createUsersBackend(options);
  vi.stubGlobal("fetch", vi.fn(fake.fetch));
  return fake;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("UsersScreen · liste", () => {
  it("sütunlar: ad + unvan, e-posta, ana rol rozeti, 'N proje' / 'Tüm projeler' rozeti, durum", async () => {
    install({ users: [AHMET, AYSE, KADIR] });
    renderScreen();

    const ahmet = (await screen.findByRole("cell", { name: /Ahmet Yılmaz/ })).closest("tr") as HTMLElement;
    expect(within(ahmet).getByText("Şantiye Şefi", { selector: ".users-cell-user__sub" })).toBeInTheDocument();
    expect(within(ahmet).getByText("ahmet.yilmaz@fiilinsaat.com")).toBeInTheDocument();
    expect(within(ahmet).getByText("Şantiye Şefi", { selector: ".role-pill" })).toBeInTheDocument();
    expect(within(ahmet).getByText("2 proje")).toBeInTheDocument();
    expect(within(ahmet).getByText("Aktif")).toBeInTheDocument();
    expect(within(ahmet).getByRole("button", { name: "Düzenle" })).toBeInTheDocument();

    const ayse = screen.getByRole("cell", { name: /Ayşe Demir/ }).closest("tr") as HTMLElement;
    expect(within(ayse).getByText("Tüm projeler")).toBeInTheDocument();
    expect(within(ayse).queryByText(/proje$/)).not.toBeInTheDocument();
  });

  it("İzinli durumu rozeti korunur", async () => {
    install({ users: [KADIR] });
    renderScreen();
    const kadir = (await screen.findByRole("cell", { name: /Kadir Arslan/ })).closest("tr") as HTMLElement;
    expect(within(kadir).getByText("İzinli")).toBeInTheDocument();
  });

  it("eski sütunlar/düğmeler yok: Disiplin, Proje Erişimi, satırda Parola/Sil", async () => {
    install();
    renderScreen();
    await screen.findByRole("cell", { name: /Ahmet Yılmaz/ });
    expect(screen.queryByRole("columnheader", { name: /Disiplin/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Proje Erişimi/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Parola" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });

  it("arama SUNUCUDA yapılır: GET /users?q= (debounce sonrası), önceki sonuç ekranı boşaltmaz", async () => {
    const backend = install({ users: [AHMET, AYSE] });
    renderScreen();
    await screen.findByRole("cell", { name: /Ahmet Yılmaz/ });
    expect(backend.callsTo("GET", /^\/users$/)[0].query.has("q")).toBe(false);

    await userEvent.type(screen.getByLabelText("Kullanıcı ara"), "ayşe");

    await waitFor(() => expect(backend.callsTo("GET", /^\/users$/).some((call) => call.query.get("q") === "ayşe")).toBe(true));
    // Debounce: her tuş vuruşu için ayrı istek ATILMAZ.
    expect(backend.callsTo("GET", /^\/users$/).filter((call) => call.query.get("q") !== null).length).toBe(1);
    await waitFor(() => expect(screen.queryByRole("cell", { name: /Ahmet Yılmaz/ })).not.toBeInTheDocument());
    expect(screen.getByRole("cell", { name: /Ayşe Demir/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Kullanıcı ara")).toHaveValue("ayşe");
  });

  it("sonuç yoksa boş durum metni", async () => {
    install({ users: [AHMET] });
    renderScreen();
    await screen.findByRole("cell", { name: /Ahmet Yılmaz/ });
    await userEvent.type(screen.getByLabelText("Kullanıcı ara"), "yokboyle");
    expect(await screen.findByText("Aramanıza uyan kullanıcı yok.")).toBeInTheDocument();
  });

  it("'+ Kullanıcı Ekle' ve 'Düzenle' modalı açar", async () => {
    install();
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "+ Kullanıcı Ekle" }));
    expect(screen.getByRole("dialog", { name: "Yeni kullanıcı" })).toBeInTheDocument();
  });
});
