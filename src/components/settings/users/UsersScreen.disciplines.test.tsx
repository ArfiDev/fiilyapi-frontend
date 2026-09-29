import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsersScreen } from "./UsersScreen";

const permission = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({ level: undefined, canView: true, canWrite: permission.canWrite, canDelete: true }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/ayarlar/kullanicilar",
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ROLES = [
  { id: "r-pm", key: "project_manager", name: "Proje Müdürü", emoji: "🏗️", description: "", is_system: false },
  { id: "r-field", key: "field_engineer", name: "Saha Mühendisi", emoji: "🦺", description: "", is_system: false },
];
const DISCIPLINES = [
  { id: "d-cw", code: "CW", name: "Civil Works", color: "#2563eb", sort_order: 0, used_by_item_count: 12 },
  { id: "d-mek", code: "MEK", name: "Mekanik", color: "#64748b", sort_order: 1, used_by_item_count: 9 },
];

function stubBackend(disciplinesStatus = 200, rolesStatus = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/earned-value/disciplines")) {
        return disciplinesStatus === 200 ? json(DISCIPLINES) : json({ detail: "yetkisiz" }, disciplinesStatus);
      }
      if (url.includes("/users/u1/disciplines")) return json({ discipline_ids: ["d-cw"], disciplines: [DISCIPLINES[0]] });
      if (url.includes("/users/u2/disciplines")) return json({ discipline_ids: [], disciplines: [] });
      if (url.includes("/project-access")) return json({ all_projects: true, project_ids: [] });
      if (url.includes("/api/backend/roles/") && url.includes("/permissions")) return json([]);
      if (url.includes("/api/backend/roles")) {
        return rolesStatus === 200 ? json(ROLES) : json({ detail: "hata" }, rolesStatus);
      }
      if (url.includes("/api/backend/modules")) return json([]);
      if (url.includes("/api/backend/projects")) {
        return json({ counts: { all: 0, taahhut: 0, kendi_yatirim: 0, kat_karsiligi: 0, completed: 0 }, items: [] });
      }
      return json({
        items: [
          { id: "u1", email: "m@b.com", full_name: "Murat Çelik", title: "Saha Mühendisi", role_id: "r-field", status: "active" },
          { id: "u2", email: "k@b.com", full_name: "Kadir Arslan", title: "Proje Müdürü", role_id: "r-pm", status: "active" },
        ],
        total: 2,
        limit: 20,
        offset: 0,
      });
    }),
  );
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UsersScreen />
    </QueryClientProvider>,
  );
}

const rowOf = (name: string) => screen.getByRole("cell", { name: new RegExp(name) }).closest("tr") as HTMLElement;

describe("UsersScreen · Disiplin sütunu", () => {
  beforeEach(() => {
    permission.canWrite = true;
  });
  afterEach(() => vi.restoreAllMocks());

  it("'Disiplin' başlığı YENİ etiketiyle; hücreler atamayı gösterir", async () => {
    stubBackend();
    renderScreen();
    await screen.findByRole("cell", { name: /Murat Çelik/ });
    expect(screen.getByRole("columnheader", { name: /Disiplin\s*YENİ/ })).toBeInTheDocument();
    expect(await within(rowOf("Murat Çelik")).findByText("Civil Works")).toBeInTheDocument();
    expect(await within(rowOf("Kadir Arslan")).findByText("Tümü (kısıtsız)")).toBeInTheDocument();
  });

  it("hücreye tıklayınca atama modalı açılır; rol anahtarı yönetici uyarısına bağlanır", async () => {
    stubBackend();
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("cell", { name: /Kadir Arslan/ });
    await user.click(await within(rowOf("Kadir Arslan")).findByRole("button", { name: /Disiplin atamasını düzenle/ }));

    const dialog = await screen.findByRole("dialog", { name: "Disiplin Ataması" });
    expect(within(dialog).getByText("Kadir Arslan · Proje Müdürü")).toBeInTheDocument();
    await user.click(await within(dialog).findByRole("checkbox", { name: /Mekanik/ }));
    expect(within(dialog).getByText(/Bu kullanıcı yönetici rolünde/)).toBeInTheDocument();
  });

  it("işlemler sütunundaki 'Disiplin ataması' düğmesi de modalı açar", async () => {
    stubBackend();
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("cell", { name: /Murat Çelik/ });
    await user.click(within(rowOf("Murat Çelik")).getByRole("button", { name: "Disiplin ataması" }));
    expect(await screen.findByRole("dialog", { name: "Disiplin Ataması" })).toBeInTheDocument();
  });

  it("yazma yetkisi yoksa hücre tıklanmaz ve 'Disiplin ataması' düğmesi çizilmez", async () => {
    permission.canWrite = false;
    stubBackend();
    renderScreen();
    await screen.findByRole("cell", { name: /Murat Çelik/ });
    expect(await within(rowOf("Murat Çelik")).findByText("Civil Works")).toBeInTheDocument();
    expect(within(rowOf("Murat Çelik")).queryByRole("button", { name: /Disiplin ata/ })).not.toBeInTheDocument();
  });

  it("disiplin listesi 403 olsa da hücre ADLARI gösterir (adlar atama yanıtından gelir)", async () => {
    stubBackend(403);
    renderScreen();
    await screen.findByRole("cell", { name: /Murat Çelik/ });
    expect(await within(rowOf("Murat Çelik")).findByText("Civil Works")).toBeInTheDocument();
    expect(await within(rowOf("Kadir Arslan")).findByText("Tümü (kısıtsız)")).toBeInTheDocument();
  });

  // Ü10: yönetici uyarısı bir UI UYARISIDIR, güvenlik değil (backend zorlamaz,
  // "uyarır, engellemez"). Roller çözülemezse rol anahtarı "" olur → uyarı
  // GÖSTERİLMEZ, modal ve kayıt normal çalışır.
  it("roller yüklenemediyse (rol anahtarı çözülemez) yönetici uyarısı YOK; modal yine kullanılabilir", async () => {
    stubBackend(200, 500);
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("cell", { name: /Kadir Arslan/ });
    await user.click(await within(rowOf("Kadir Arslan")).findByRole("button", { name: /Disiplin atamasını düzenle/ }));
    const dialog = await screen.findByRole("dialog", { name: "Disiplin Ataması" });
    const mekanik = await within(dialog).findByRole("checkbox", { name: /Mekanik/ });
    await user.click(mekanik);
    expect(mekanik).toBeChecked();
    expect(within(dialog).queryByText(/Bu kullanıcı yönetici rolünde/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Kaydet" })).toBeEnabled();
  });
});
