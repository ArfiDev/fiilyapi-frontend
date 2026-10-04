import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserAccessModal } from "./UserAccessModal";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { AHMET, AHMET_ACCESS, AYSE, createUsersBackend, type FakeBackendOptions } from "./users-fake-backend.testkit";

const session = vi.hoisted(() => ({ isAdmin: false, refresh: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({
    me: { id: "me-1", is_system_admin: session.isAdmin, pages: {} },
    isLoading: false,
    refresh: session.refresh,
  }),
}));

const onClose = vi.fn();

function renderModal(user?: typeof AHMET) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UserAccessModal user={user} onClose={onClose} />
    </QueryClientProvider>,
  );
}

async function openEdit(user = AHMET) {
  renderModal(user);
  const dialog = await screen.findByRole("dialog", { name: "Kullanıcıyı düzenle" });
  // Erişim GET'i döndü: proje satırları ya da "tüm projeler" kutusu çizilir.
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Kaydet" })).toBeEnabled());
  return dialog;
}

beforeEach(() => {
  session.isAdmin = false;
});
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

describe("UserAccessModal · düzenle", () => {
  it("ad/e-posta SALT OKUNUR; ana rol, proje satırları, disiplin çipi ve bilgi satırı mockup'a göre", async () => {
    install();
    const dialog = await openEdit();

    expect(within(dialog).getByLabelText(/Ad Soyad/)).toHaveAttribute("readonly");
    expect(within(dialog).getByLabelText(/E-posta/)).toHaveAttribute("readonly");
    expect(within(dialog).getByLabelText(/Ana rol/)).toHaveValue("r-site");
    expect(within(dialog).getByText("2 projede ekipte")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Kule A: bu projedeki rol")).toHaveValue("r-site");
    expect(within(dialog).getByLabelText("AVM: bu projedeki rol")).toHaveValue("r-field");
    expect(within(dialog).getByText("Elektrik")).toBeInTheDocument();
    expect(within(dialog).getByText("Tüm disiplinler —")).toBeInTheDocument();
    expect(within(dialog).getByText(/o projedeki rolle/)).toBeInTheDocument();
  });

  it("ana rol seçicisi atanamaz rolü gizler, kişinin ZATEN atanmış rolü atanamaz olsa da kalır", async () => {
    install({
      users: [{ ...AHMET, role_id: "r-legacy" }],
      access: { [AHMET.id]: { ...AHMET_ACCESS, role_id: "r-legacy" } },
    });
    const dialog = await openEdit({ ...AHMET, role_id: "r-legacy" });
    const select = within(dialog).getByLabelText(/Ana rol/);
    expect(within(select).getByRole("option", { name: "Eski Rol" })).toBeInTheDocument();
  });

  it("atanamaz rol, kişide yoksa seçicide görünmez; proje rolü seçicisinde Sistem Yöneticisi yok", async () => {
    install();
    const dialog = await openEdit();
    expect(within(dialog).getByLabelText(/Ana rol/)).not.toHaveTextContent("Eski Rol");
    expect(within(dialog).getByLabelText(/Ana rol/)).toHaveTextContent("Sistem Yöneticisi");
    expect(within(dialog).getByLabelText("Kule A: bu projedeki rol")).not.toHaveTextContent("Sistem Yöneticisi");
  });

  it("proje ekle: zaten ekli projeler listede YOK; yeni satır ana rolle gelir ve çıkar × ile silinir", async () => {
    install();
    const dialog = await openEdit();
    const add = within(dialog).getByLabelText("Projeye ekle");
    expect(within(add).queryByRole("option", { name: "Kule A" })).not.toBeInTheDocument();
    expect(within(add).queryByRole("option", { name: "AVM" })).not.toBeInTheDocument();

    await userEvent.selectOptions(add, "Villa B");
    expect(within(dialog).getByText("3 projede ekipte")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Villa B: bu projedeki rol")).toHaveValue("r-site");
    // Eklenen proje artık seçilemez; tüm projeler eklenince seçici kalkar.
    expect(within(dialog).queryByLabelText("Projeye ekle")).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Villa B projesinden çıkar" }));
    expect(within(dialog).getByText("2 projede ekipte")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Projeye ekle")).toBeInTheDocument();
  });

  it("proje rolü ve disiplin çipi değişir; boş disiplin 'Tüm disiplinler —' gösterir", async () => {
    install();
    const dialog = await openEdit();

    await userEvent.selectOptions(within(dialog).getByLabelText("AVM: bu projedeki rol"), "Proje Müdürü");
    expect(within(dialog).getByLabelText("AVM: bu projedeki rol")).toHaveValue("r-pm");

    await userEvent.selectOptions(within(dialog).getByLabelText("AVM: disiplin ekle"), "MEK · Mekanik");
    expect(within(dialog).getByRole("button", { name: "AVM: Mekanik disiplinini kaldır" })).toBeInTheDocument();
    // "+ Disiplin" seçeneklerinden seçilen düştü.
    expect(within(within(dialog).getByLabelText("AVM: disiplin ekle")).queryByRole("option", { name: /MEK/ })).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Kule A: Elektrik disiplinini kaldır" }));
    expect(within(dialog).getAllByText("Tüm disiplinler —")).toHaveLength(1); // AVM'de MEK var, Kule A boşaldı
    expect(within(dialog).queryByText("Elektrik", { selector: ".dsc-chip__name" })).not.toBeInTheDocument();
  });

  it("'Tüm projelere erişir' işaretlenince tablo gizlenir, kutu çıkar; işaret kalkınca satırlar geri gelir", async () => {
    install();
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Tüm projelere erişir/ }));

    expect(within(dialog).queryByRole("table", { name: "Proje ekibi" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("Tüm projelere erişir · disiplin kısıtı yok")).toBeInTheDocument();
    expect(within(dialog).getByText(/ana rolle \(Şantiye Şefi\) açılır/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Tüm projelere erişir/ }));
    expect(within(dialog).getByRole("table", { name: "Proje ekibi" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Kule A: bu projedeki rol")).toBeInTheDocument();
  });

  it("zaten tüm projeler olan kişide kutu işaretli açılır (mockup Durum 3)", async () => {
    install();
    const dialog = await openEdit(AYSE);
    expect(within(dialog).getByRole("checkbox", { name: /Tüm projelere erişir/ })).toBeChecked();
    expect(within(dialog).getByText("Tüm projelere erişir · disiplin kısıtı yok")).toBeInTheDocument();
  });

  it("Kaydet TEK PUT access gövdesi gönderir (rol + proje + disiplin); değişmeyen unvan için PATCH YOK", async () => {
    const backend = install();
    const dialog = await openEdit();
    await userEvent.selectOptions(within(dialog).getByLabelText("AVM: disiplin ekle"), "ELK · Elektrik");
    await userEvent.selectOptions(within(dialog).getByLabelText("Projeye ekle"), "Villa B");
    await userEvent.selectOptions(within(dialog).getByLabelText(/Ana rol/), "Proje Müdürü");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const puts = backend.callsTo("PUT", /\/access$/);
    expect(puts).toHaveLength(1);
    expect(puts[0].path).toBe("/users/u-ahmet/access");
    expect(puts[0].body).toEqual({
      role_id: "r-pm",
      all_projects: false,
      projects: [
        { project_id: "p-avm", role_id: "r-field", discipline_ids: ["d-elk"] },
        { project_id: "p-kule", role_id: "r-site", discipline_ids: ["d-elk"] },
        { project_id: "p-villa", role_id: "r-site", discipline_ids: [] },
      ],
    });
    expect(backend.callsTo("PATCH", /^\/users\/[^/]+$/)).toHaveLength(0);
  });

  it("all_projects=true iken PUT gövdesi projects: [] taşır", async () => {
    const backend = install();
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Tüm projelere erişir/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(backend.callsTo("PUT", /\/access$/)[0].body).toEqual({ role_id: "r-site", all_projects: true, projects: [] });
  });

  it("unvan/durum değişimi mevcut PATCH /users/{id}'ye gider; erişim değişmediyse PUT YOK", async () => {
    const backend = install();
    const dialog = await openEdit();
    await userEvent.clear(within(dialog).getByLabelText("Unvan"));
    await userEvent.type(within(dialog).getByLabelText("Unvan"), "Proje Şefi");
    await userEvent.selectOptions(within(dialog).getByLabelText("Durum"), "İzinli");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(backend.callsTo("PATCH", /^\/users\/u-ahmet$/)[0].body).toEqual({ title: "Proje Şefi", status: "on_leave" });
    expect(backend.callsTo("PUT", /\/access$/)).toHaveLength(0);
  });

  it("Pasifleştir durumu taslakta pasife çeker (Kaydet ile PATCH) ve düğme Aktifleştir olur", async () => {
    const backend = install();
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole("button", { name: "Pasifleştir" }));
    expect(within(dialog).getByRole("button", { name: "Aktifleştir" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(backend.callsTo("PATCH", /^\/users\/u-ahmet$/)[0].body).toEqual({ status: "passive" });
  });

  it("422 detail metni olduğu gibi gösterilir, modal açık kalır, taslak korunur", async () => {
    install({
      putAccess: () => ({ status: 422, json: { detail: "Aynı proje iki kez eklenemez: p-kule" } }),
    });
    const dialog = await openEdit();
    await userEvent.selectOptions(within(dialog).getByLabelText("AVM: disiplin ekle"), "ELK · Elektrik");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    expect(await within(dialog).findByText("Aynı proje iki kez eklenemez: p-kule")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "AVM: Elektrik disiplinini kaldır" })).toBeInTheDocument();
  });

  it("ana rol boşsa istek ATILMAZ, kullanıcı metni gösterilir", async () => {
    const backend = install();
    const dialog = await openEdit();
    await userEvent.selectOptions(within(dialog).getByLabelText(/Ana rol/), "Seçin…");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(await within(dialog).findByText("Ana rol seçin.")).toBeInTheDocument();
    expect(backend.callsTo("PUT", /\/access$/)).toHaveLength(0);
  });

  it("ana rol Sistem Yöneticisi iken eklenen proje satırının rolü BOŞ gelir; seçilmeden istek ATILMAZ", async () => {
    const backend = install();
    const dialog = await openEdit();
    await userEvent.selectOptions(within(dialog).getByLabelText(/Ana rol/), "Sistem Yöneticisi");
    await userEvent.selectOptions(within(dialog).getByLabelText("Projeye ekle"), "Villa B");
    expect(within(dialog).getByLabelText("Villa B: bu projedeki rol")).toHaveValue("");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(await within(dialog).findByText("Her proje için bir rol seçin.")).toBeInTheDocument();
    expect(backend.callsTo("PUT", /\/access$/)).toHaveLength(0);
  });

  it("kaydedilmemiş değişiklik kayıt defterine işlenir; kapanınca temizlenir", async () => {
    install();
    const { unmount } = renderModal(AHMET);
    const dialog = await screen.findByRole("dialog", { name: "Kullanıcıyı düzenle" });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Kaydet" })).toBeEnabled());
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Tüm projelere erişir/ }));
    await waitFor(() => expect(unsavedRegistry.labels()).toContain("Kullanıcı"));
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});

describe("UserAccessModal · Sil / parola sıfırla", () => {
  it("Sil yalnız Sistem Yöneticisinde görünür (fail-closed)", async () => {
    install();
    const dialog = await openEdit();
    expect(within(dialog).queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });

  it("Sistem Yöneticisi Sil'e basınca onay ister, onaylayınca DELETE atar ve kapanır", async () => {
    session.isAdmin = true;
    const backend = install();
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole("button", { name: "Sil" }));
    const confirm = await screen.findByRole("dialog", { name: "Kullanıcıyı Sil" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Sil" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(backend.callsTo("DELETE", /^\/users\/u-ahmet$/)).toHaveLength(1);
  });

  it("onay penceresindeyken Escape ana modalı KAPATMAZ", async () => {
    session.isAdmin = true;
    install();
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole("button", { name: "Sil" }));
    await screen.findByRole("dialog", { name: "Kullanıcıyı Sil" });
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Kullanıcıyı Sil" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Kullanıcıyı düzenle" })).toBeInTheDocument();
  });

  it("parola sıfırla akışı korunur: PATCH /users/{id}/password, ana modal açık kalır", async () => {
    session.isAdmin = true;
    const backend = install();
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole("button", { name: "Parola sıfırla" }));
    const reset = await screen.findByRole("dialog", { name: /Parola Sıfırla/ });
    await userEvent.type(within(reset).getByLabelText(/Yeni Parola/), "yeniparola123");
    await userEvent.click(within(reset).getByRole("button", { name: "Sıfırla" }));
    await waitFor(() => expect(backend.callsTo("PATCH", /\/password$/)).toHaveLength(1));
    expect(backend.callsTo("PATCH", /\/password$/)[0].body).toEqual({ new_password: "yeniparola123" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Parola Sıfırla/ })).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Kullanıcıyı düzenle" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("UserAccessModal · yeni kullanıcı", () => {
  async function fillNewUser(dialog: HTMLElement) {
    await userEvent.type(within(dialog).getByLabelText(/Ad Soyad/), "Yeni Kişi");
    await userEvent.type(within(dialog).getByLabelText(/E-posta/), "yeni@fiilinsaat.com");
    await userEvent.type(within(dialog).getByLabelText(/Parola/), "gizli-parola-1");
    await userEvent.selectOptions(within(dialog).getByLabelText(/Ana rol/), "Şantiye Şefi");
    await userEvent.selectOptions(within(dialog).getByLabelText("Projeye ekle"), "Kule A");
  }

  it("POST /users sonra PUT /users/{yeni id}/access (iki istek, sırayla)", async () => {
    const backend = install();
    renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Yeni kullanıcı" });
    await fillNewUser(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const post = backend.callsTo("POST", /^\/users$/);
    expect(post).toHaveLength(1);
    expect(post[0].body).toMatchObject({
      email: "yeni@fiilinsaat.com",
      full_name: "Yeni Kişi",
      password: "gizli-parola-1",
      role_id: "r-site",
    });
    const put = backend.callsTo("PUT", /\/access$/);
    expect(put).toHaveLength(1);
    expect(put[0].path).toBe("/users/u-new/access");
    expect(put[0].body).toEqual({
      role_id: "r-site",
      all_projects: false,
      projects: [{ project_id: "p-kule", role_id: "r-site", discipline_ids: [] }],
    });
    expect(backend.calls.findIndex((c) => c.method === "POST" && c.path === "/users")).toBeLessThan(
      backend.calls.findIndex((c) => c.method === "PUT"),
    );
  });

  it("PUT başarısızsa kullanıcı OLUŞTURULDU mesajı + Yeniden dene; yeniden deneme POST'u TEKRARLAMAZ", async () => {
    let attempt = 0;
    const backend = install({
      putAccess: () => {
        attempt += 1;
        return attempt === 1
          ? { status: 422, json: { detail: "Proje bulunamadı: p-kule" } }
          : { status: 200, json: { role_id: "r-site", all_projects: false, projects: [] } };
      },
    });
    renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Yeni kullanıcı" });
    await fillNewUser(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    expect(
      await within(dialog).findByText(/Kullanıcı oluşturuldu, ancak erişim kaydedilemedi: Proje bulunamadı: p-kule/),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText(/E-posta/)).toBeDisabled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Yeniden dene" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(backend.callsTo("POST", /^\/users$/)).toHaveLength(1);
    expect(backend.callsTo("PUT", /\/access$/)).toHaveLength(2);
  });

  it("POST hatası (ör. e-posta kayıtlı) gösterilir ve PUT ATILMAZ", async () => {
    const backend = install({
      postUser: () => ({ status: 409, json: { detail: "Bu e-posta zaten kayıtlı" } }),
    });
    renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Yeni kullanıcı" });
    await fillNewUser(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(await within(dialog).findByText("Bu e-posta zaten kayıtlı")).toBeInTheDocument();
    expect(backend.callsTo("PUT", /\/access$/)).toHaveLength(0);
  });

  it("zorunlu alanlar eksikse istek ATILMAZ", async () => {
    const backend = install();
    renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Yeni kullanıcı" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(await within(dialog).findByText("Ad soyad zorunludur.")).toBeInTheDocument();
    expect(backend.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });
});

