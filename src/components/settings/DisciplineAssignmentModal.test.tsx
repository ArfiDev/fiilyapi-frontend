import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { DisciplineAssignmentModal } from "./DisciplineAssignmentModal";
import { backendClient } from "@/lib/api/client";
import type { UserResponse } from "@/lib/api/models";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), PUT: vi.fn() } }));

const USER = { id: "u-1", full_name: "Murat Çelik", title: "Saha Mühendisi" } as UserResponse;

const CATALOG = [
  ["d-cw", "CW", "Civil Works", 12],
  ["d-stl", "STL", "Çelik Yapı", 5],
  ["d-mek", "MEK", "Mekanik", 9],
  ["d-elk", "ELK", "Elektrik", 7],
  ["d-duv", "DUV", "Duvar & Sıva", 6],
  ["d-inc", "INC", "İnce İşler", 8],
  ["d-alt", "ALT", "Altyapı", 4],
  ["d-pey", "PEY", "Peyzaj", 3],
].map(([id, code, name, used], index) => ({
  id,
  code,
  name,
  color: "#2563eb",
  default_contractor_type: "own",
  sort_order: index,
  used_by_item_count: used,
  used_by_site_count: 0,
  user_count: 0,
}));

type Reply = { data?: unknown; error?: unknown };
const ok = (data: unknown): Promise<Reply & { response: Response }> =>
  Promise.resolve({ data, error: undefined, response: new Response() });
const fail = (status: number, body: unknown = {}) =>
  Promise.resolve({ data: undefined, error: body, response: new Response(null, { status }) });

interface Setup {
  assigned?: string[];
  catalog?: unknown[];
  getCatalog?: () => Promise<unknown>;
  getUser?: () => Promise<unknown>;
}
function setupBackend({ assigned = [], catalog = CATALOG, getUser, getCatalog }: Setup = {}) {
  vi.mocked(backendClient.GET).mockImplementation(((path: string) => {
    if (path === "/earned-value/disciplines") return getCatalog ? getCatalog() : ok(catalog);
    if (path === "/users/{user_id}/disciplines") return getUser ? getUser() : ok({ discipline_ids: assigned });
    throw new Error(`beklenmeyen yol: ${path}`);
  }) as never);
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderModal(props: { roleKey?: string; onClose?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn();
  render(<DisciplineAssignmentModal user={USER} roleKey={props.roleKey ?? "field_engineer"} onClose={onClose} />, {
    wrapper,
  });
  return { onClose };
}

const saveButton = () => screen.getByRole("button", { name: "Kaydet" });
const box = (name: RegExp) => screen.getByRole("checkbox", { name });
/** Satır var VE etkin (atama GET'i döndü) olana dek bekler — yüklenirken kutular kapalıdır. */
async function findBox(name: RegExp) {
  const element = await screen.findByRole("checkbox", { name });
  await waitFor(() => expect(element).toBeEnabled());
  return element;
}

describe("DisciplineAssignmentModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBackend();
  });

  it("Kaydet YALNIZ kirliyken etkindir; seçimi geri alınca yeniden kapanır", async () => {
    const user = userEvent.setup();
    renderModal();
    await findBox(/Civil Works/);
    expect(saveButton()).toBeDisabled();

    await user.click(box(/Civil Works/));
    expect(saveButton()).toBeEnabled();

    await user.click(box(/Civil Works/));
    expect(saveButton()).toBeDisabled();
  });

  it("sunucudaki atama işaretli açılır ve n / N sayacı ile canlı özet güncellenir", async () => {
    const user = userEvent.setup();
    setupBackend({ assigned: ["d-cw"] });
    renderModal();
    await waitFor(() => expect(box(/Civil Works/)).toBeChecked());
    expect(screen.getByText("1 / 8 seçili")).toBeInTheDocument();
    expect(screen.getByText("1 disiplinle sınırlı")).toBeInTheDocument();

    await user.click(box(/Mekanik/));
    expect(screen.getByText("2 / 8 seçili")).toBeInTheDocument();
    expect(screen.getByText("2 disiplinle sınırlı")).toBeInTheDocument();

    await user.click(box(/Civil Works/));
    await user.click(box(/Mekanik/));
    expect(screen.getByText("0 / 8 seçili")).toBeInTheDocument();
    expect(screen.getByText("Kısıtsız — tüm disiplinleri görür")).toBeInTheDocument();
  });

  it("satırda kod, ad ve 'N iş tipi' (used_by_item_count) gösterir", async () => {
    renderModal();
    const row = (await findBox(/Civil Works/)).closest("label") as HTMLElement;
    expect(within(row).getByText("CW")).toBeInTheDocument();
    expect(within(row).getByText("12 iş tipi")).toBeInTheDocument();
  });

  it("arama kod VEYA ada göre süzer; eşleşme yoksa boş sonuç metni çıkar", async () => {
    const user = userEvent.setup();
    renderModal();
    await findBox(/Civil Works/);
    const search = screen.getByPlaceholderText("Disiplin ara (kod ya da ad)");

    await user.type(search, "el");
    expect(screen.getByRole("checkbox", { name: /Elektrik/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Çelik/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Mekanik/ })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "MEK");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);

    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getByText(/"zzz" ile eşleşen disiplin yok/)).toBeInTheDocument();
  });

  it("arama süzgeci seçimi silmez", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(await findBox(/Civil Works/));
    await user.type(screen.getByPlaceholderText("Disiplin ara (kod ya da ad)"), "mek");
    expect(screen.getByText("1 / 8 seçili")).toBeInTheDocument();
  });

  it("Kaydet PUT gövdesi: seçili disiplin kimlikleri", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PUT).mockImplementation((() => ok({ discipline_ids: ["d-cw", "d-elk"] })) as never);
    const { onClose } = renderModal();
    await user.click(await findBox(/Civil Works/));
    await user.click(box(/Elektrik/));
    await user.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(backendClient.PUT).toHaveBeenCalledWith("/users/{user_id}/disciplines", {
      params: { path: { user_id: "u-1" } },
      body: { discipline_ids: ["d-cw", "d-elk"] },
    });
  });

  it("tüm seçimi kaldırmak boş liste yollar (= kısıtsız)", async () => {
    const user = userEvent.setup();
    setupBackend({ assigned: ["d-cw"] });
    vi.mocked(backendClient.PUT).mockImplementation((() => ok({ discipline_ids: [] })) as never);
    renderModal();
    await waitFor(() => expect(box(/Civil Works/)).toBeChecked());
    await user.click(box(/Civil Works/));
    await user.click(saveButton());

    await waitFor(() => expect(backendClient.PUT).toHaveBeenCalled());
    expect(vi.mocked(backendClient.PUT).mock.calls[0][1]).toMatchObject({ body: { discipline_ids: [] } });
  });

  describe("yönetici uyarısı", () => {
    it.each(["system_admin", "patron", "project_manager"])("%s + en az bir seçim → uyarı görünür", async (roleKey) => {
      const user = userEvent.setup();
      renderModal({ roleKey });
      await user.click(await findBox(/Mekanik/));
      expect(screen.getByText(/Bu kullanıcı yönetici rolünde/)).toBeInTheDocument();
    });

    it("yönetici rolünde ama seçim boşken uyarı YOK", async () => {
      renderModal({ roleKey: "project_manager" });
      await findBox(/Mekanik/);
      expect(screen.queryByText(/Bu kullanıcı yönetici rolünde/)).not.toBeInTheDocument();
    });

    it("yönetici olmayan rolde seçim olsa da uyarı YOK; kayıt engellenmez", async () => {
      const user = userEvent.setup();
      renderModal({ roleKey: "site_chief" });
      await user.click(await findBox(/Mekanik/));
      expect(screen.queryByText(/Bu kullanıcı yönetici rolünde/)).not.toBeInTheDocument();
    });

    it("uyarı varken Kaydet yine etkindir (engellemez)", async () => {
      const user = userEvent.setup();
      renderModal({ roleKey: "system_admin" });
      await user.click(await findBox(/Mekanik/));
      expect(saveButton()).toBeEnabled();
    });
  });

  describe("kaydetme hatası", () => {
    it("503 → mesaj + Tekrar dene; seçim KORUNUR ve yeniden deneme aynı gövdeyi yollar", async () => {
      const user = userEvent.setup();
      vi.mocked(backendClient.PUT)
        .mockImplementationOnce((() => fail(503)) as never)
        .mockImplementationOnce((() => ok({ discipline_ids: ["d-cw", "d-stl"] })) as never);
      const { onClose } = renderModal();
      await user.click(await findBox(/Civil Works/));
      await user.click(box(/Çelik/));
      await user.click(saveButton());

      expect(await screen.findByText("Kaydedilemedi.")).toBeInTheDocument();
      expect(screen.getByText(/Sunucu yanıt vermedi \(503\)/)).toBeInTheDocument();
      expect(box(/Civil Works/)).toBeChecked();
      expect(box(/Çelik/)).toBeChecked();

      await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(backendClient.PUT).toHaveBeenCalledTimes(2);
      expect(vi.mocked(backendClient.PUT).mock.calls[1][1]).toMatchObject({
        body: { discipline_ids: ["d-cw", "d-stl"] },
      });
    });

    it("backend `detail` metni varsa o basılır (backendErrorMessage kanonu)", async () => {
      const user = userEvent.setup();
      vi.mocked(backendClient.PUT).mockImplementation((() => fail(404, { detail: "Disiplin bulunamadı" })) as never);
      renderModal();
      await user.click(await findBox(/Civil Works/));
      await user.click(saveButton());
      expect(await screen.findByText(/Disiplin bulunamadı/)).toBeInTheDocument();
    });
  });

  describe("yükleme hatası", () => {
    it("kullanıcının disiplinleri 503 → hata + Tekrar dene yeniden getirir ve atama gelir", async () => {
      const user = userEvent.setup();
      let calls = 0;
      setupBackend({
        getUser: () => {
          calls += 1;
          return calls === 1 ? fail(503) : ok({ discipline_ids: ["d-pey"] });
        },
      });
      renderModal();
      expect(await screen.findByText("Disiplinler yüklenemedi.")).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
      await waitFor(() => expect(box(/Peyzaj/)).toBeChecked());
      expect(screen.queryByText("Disiplinler yüklenemedi.")).not.toBeInTheDocument();
    });

    it("kullanıcı seçim yaptıktan SONRA yeniden gelen sunucu verisi seçimi ezmez", async () => {
      const user = userEvent.setup();
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(<DisciplineAssignmentModal user={USER} roleKey="field_engineer" onClose={() => {}} />, {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      });
      await user.click(await findBox(/Mekanik/));

      setupBackend({ assigned: ["d-cw"] });
      await client.invalidateQueries({ queryKey: ["user-disciplines"] });

      await waitFor(() => expect(vi.mocked(backendClient.GET).mock.calls.length).toBeGreaterThan(2));
      expect(box(/Mekanik/)).toBeChecked();
      expect(box(/Civil Works/)).not.toBeChecked();
    });
  });

  it("katalog boşsa boş durum + Birim Oran Kataloğu bağlantısı; Kaydet kapalı", async () => {
    setupBackend({ catalog: [] });
    renderModal();
    expect(await screen.findByText("Henüz disiplin tanımlı değil")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Birim Oran Kataloğu'na git/ });
    expect(link).toHaveAttribute("href", "/planlama/birim-oran-katalogu");
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("Kısıtsız — tüm disiplinleri görür")).toBeInTheDocument();
  });

  it("disiplin listesi 403 (earned_value izni yok) → çökmez, yetki mesajı; liste yok, Kaydet kapalı", async () => {
    setupBackend({ assigned: ["d-cw"], getCatalog: () => fail(403) });
    renderModal();
    expect(await screen.findByText("Disiplin listesini görme yetkiniz yok.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Disiplinler yüklenemedi.")).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  describe("kirli kapatma onayı", () => {
    it("kirli değilken Vazgeç doğrudan kapatır", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();
      await findBox(/Civil Works/);
      await user.click(screen.getByRole("button", { name: "Vazgeç" }));
      expect(onClose).toHaveBeenCalled();
    });

    it("kirliyken Vazgeç onay sorar; 'Vazgeç' (onaydaki) modalda tutar, 'Değişiklikleri at' kapatır", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();
      await user.click(await findBox(/Civil Works/));
      await user.click(screen.getByRole("button", { name: "Vazgeç" }));

      const confirm = screen.getByRole("alertdialog", { name: "Kaydedilmemiş değişiklikler var" });
      expect(onClose).not.toHaveBeenCalled();
      expect(within(confirm).getByText(/Disiplin seçiminiz kaydedilmedi/)).toBeInTheDocument();

      await user.click(within(confirm).getByRole("button", { name: "Vazgeç" }));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(box(/Civil Works/)).toBeChecked();
      expect(onClose).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Vazgeç" }));
      await user.click(screen.getByRole("button", { name: "Değişiklikleri at" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("× ve Esc de kirliyken onay sorar", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();
      await user.click(await findBox(/Civil Works/));
      await user.click(screen.getByRole("button", { name: "Kapat" }));
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("kirli seçim merkezi kaydedilmemiş-değişiklik kaydına bağlanır", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(await findBox(/Civil Works/));
    expect(unsavedRegistry.getSnapshot()).toBe(true);
    await user.click(box(/Civil Works/));
    expect(unsavedRegistry.getSnapshot()).toBe(false);
  });

  it("kaydetme sürerken Kaydediliyor… gösterilir ve Vazgeç kapalıdır", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PUT).mockImplementation((() => new Promise(() => {})) as never);
    renderModal();
    await user.click(await findBox(/Civil Works/));
    await user.click(saveButton());
    expect(await screen.findByText("Kaydediliyor…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vazgeç" })).toBeDisabled();
  });

  describe("kayıt sürerken", () => {
    async function startSaving() {
      const user = userEvent.setup();
      vi.mocked(backendClient.PUT).mockImplementation((() => new Promise(() => {})) as never);
      const { onClose } = renderModal();
      await user.click(await findBox(/Civil Works/));
      await user.click(saveButton());
      await screen.findByText("Kaydediliyor…");
      return { user, onClose };
    }

    it("Esc, × ve arka plan tıklaması modalı KAPATMAZ (veri kaybı/çift gönderim yok)", async () => {
      const { user, onClose } = await startSaving();
      await user.keyboard("{Escape}");
      await user.click(screen.getByRole("button", { name: "Kapat" }));
      await user.click(screen.getByRole("dialog").parentElement as HTMLElement);
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "Disiplin Ataması" })).toBeInTheDocument();
    });

    it("onay kutuları kapalıdır — seçim değişemez", async () => {
      const { user } = await startSaving();
      for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
      await user.click(box(/Mekanik/));
      expect(box(/Mekanik/)).not.toBeChecked();
      expect(box(/Civil Works/)).toBeChecked();
    });
  });

  it("başlık ve alt başlık: Disiplin Ataması · ad · unvan", async () => {
    renderModal();
    await findBox(/Civil Works/);
    expect(screen.getByRole("dialog", { name: "Disiplin Ataması" })).toBeInTheDocument();
    expect(screen.getByText("Murat Çelik · Saha Mühendisi")).toBeInTheDocument();
    expect(screen.getByText(/Hiç disiplin seçilmezse kullanıcı kısıtsızdır/)).toBeInTheDocument();
  });
});
