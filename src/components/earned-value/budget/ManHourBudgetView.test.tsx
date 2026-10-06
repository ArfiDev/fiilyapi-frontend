import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { backendClient } from "@/lib/api/client";
import { useSite } from "@/lib/api/hooks/useSites";

import { ManHourBudgetView } from "./ManHourBudgetView";
import { ACTIVE_REV_1, D_KAB, G_BET, G_IZO, I_BETON, LEAF_IZO, S_CAT, S_TML, budgetView, revision } from "./budget-fixtures";
import { defaultState, lastBody, mockPermission, renderWithQuery, wireBackend, type BackendState } from "./budget-screen-harness";

// PLN-F1.6 · Adam-Saat Bütçesi ekran akışları (şantiye rotası).
// Gerçek react-query hook'ları + sahte `backendClient`; gövdeler BİREBİR ölçülür.

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSite: vi.fn() }));

const replace = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "gunes", siteId: "a-blok" }),
  usePathname: () => "/projeler/gunes/santiyeler/a-blok/adam-saat-butcesi",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

const SITE_ID = "99999999-0000-0000-0000-000000000001";
let state: BackendState;

function setup(over: Partial<BackendState> = {}, level: string | null = "approve", query = "", siteStatus = "active") {
  state = { ...defaultState(), ...over };
  searchParams = new URLSearchParams(query);
  wireBackend(state);
  mockPermission(level);
  vi.mocked(useSite).mockReturnValue({ data: { id: SITE_ID, project: { id: "p-1" }, status: siteStatus } } as never);
  return { user: userEvent.setup(), ...renderWithQuery(<ManHourBudgetView />) };
}

function lastReplace(): URLSearchParams {
  const url = String(replace.mock.calls.at(-1)?.[0] ?? "");
  return new URLSearchParams(url.split("?")[1] ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hâller (BÜT:470-505)", () => {
  it("yükleniyor: ağaç iskeleti", () => {
    setup({ budgetPending: true });
    expect(screen.getByRole("status", { name: "" })).toBeInTheDocument();
    expect(screen.getByText("Bütçe yükleniyor")).toBeInTheDocument();
  });

  it("hata: hata kartı + Tekrar dene yeniden ister", async () => {
    const { user } = setup({ budgetStatus: 500 });
    expect(await screen.findByText("İş kalemleri alınamadı")).toBeInTheDocument();
    const before = vi.mocked(backendClient.GET).mock.calls.filter((c) => String(c[0]).endsWith("/budget")).length;
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    await waitFor(() =>
      expect(vi.mocked(backendClient.GET).mock.calls.filter((c) => String(c[0]).endsWith("/budget")).length).toBe(before + 1),
    );
  });

  it("BOQ boş: iş kalemi CTA'sı gerçek rotaya gider", async () => {
    setup({ view: budgetView({ totals: { ...budgetView().totals, item_count: 0 } }) });
    expect(await screen.findByText("Bu şantiyede henüz iş kalemi yok")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Önce İş Kalemleri'ni girin →" })).toHaveAttribute(
      "href",
      "/projeler/gunes/santiyeler/a-blok/is-kalemleri",
    );
  });

  it("şantiye kimliği UUID'ye çözülerek istenir (slug değil)", async () => {
    setup();
    await screen.findByText("Taslak — Rev 2");
    expect(backendClient.GET).toHaveBeenCalledWith("/sites/{site_id}/earned-value/budget", {
      params: { path: { site_id: SITE_ID } },
    });
  });
});

describe("revizyon hâlleri × izin (B1-5, B1-8)", () => {
  it("taslak + draft: rozet, adım alt metni, oran girdisi düzenlenebilir", async () => {
    setup({}, "draft");
    expect(await screen.findByText("Taslak — Rev 2")).toBeInTheDocument();
    expect(screen.getByText("Aktif: Rev 1 · 02.07.2026")).toBeInTheDocument();
    expect(screen.getByText("1 grup disiplinsiz · 1 oran eksik")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Beton döküm · Temel birim oran" })).toHaveValue("1,80");
  });

  it("taslak + view: görüntüleyici şeridi; oran düz metin; eylem düğmeleri yok", async () => {
    setup({}, "view");
    expect(await screen.findByText("Görüntüleyici · yalnız okuma")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /birim oran/ })).not.toBeInTheDocument();
    expect(screen.getByText("1,80")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Katalogdan öner (tümü)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("aktif, taslak yok: 'Rev 1 aktif, taslak yok.' + Taslak aç → POST, varsayılana döner", async () => {
    const { user } = setup({ view: budgetView({ revision: ACTIVE_REV_1, editable: false }), revisions: [ACTIVE_REV_1] }, "draft", "rev=rev-1");
    expect(await screen.findByText("Rev 1 aktif, taslak yok.")).toBeInTheDocument();
    expect(screen.getByText("Aktif — Rev 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Taslak aç (Rev 2)" }));
    await waitFor(() =>
      expect(backendClient.POST).toHaveBeenCalledWith("/sites/{site_id}/earned-value/budget/revisions", {
        params: { path: { site_id: SITE_ID } },
      }),
    );
    await waitFor(() => expect(lastReplace().has("rev")).toBe(false));
  });

  it("aktif görüntülenirken taslak varsa 'Taslak Rev 2'ye dön'", async () => {
    const { user } = setup({ view: budgetView({ revision: ACTIVE_REV_1, editable: false }) }, "approve", "rev=rev-1");
    await user.click(await screen.findByRole("button", { name: "Taslak Rev 2'ye dön" }));
    expect(lastReplace().has("rev")).toBe(false);
    expect(screen.queryByRole("textbox", { name: /birim oran/ })).not.toBeInTheDocument();
  });

  it("hiç revizyon yok: bilgi kutusu, oran girilebilir (ilk yazma Rev 0)", async () => {
    setup({ view: budgetView({ revision: null }), revisions: [] }, "draft");
    expect(await screen.findByText("Bu şantiyede henüz bütçe revizyonu yok.")).toBeInTheDocument();
    expect(screen.getByText("Revizyon yok", { selector: ".ev-budget-badge" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Beton döküm · Temel birim oran" })).toBeEnabled();
  });

  it("revizyon listesi: seçim URL'e yazılır (?rev=)", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: /Revizyon/ }));
    await user.click(screen.getByRole("button", { name: /Rev 1 · Aktif/ }));
    expect(lastReplace().get("rev")).toBe("rev-1");
  });
});

describe("Adım 1 · Oranlar", () => {
  it("oran girişi on-blur → PATCH gövdesi (kaynak manual)", async () => {
    const { user } = setup({}, "draft");
    const input = await screen.findByRole("textbox", { name: "Beton döküm · Temel birim oran" });
    await user.clear(input);
    await user.type(input, "2,05");
    await user.tab();
    await waitFor(() =>
      expect(lastBody("PATCH", "/budget/leaves")).toEqual({
        leaves: [{ boq_item_id: I_BETON, section_id: S_TML, unit_mhr: "2.05", rate_source: "manual" }],
      }),
    );
  });

  it("değer değişmeden odak çıkarsa istek ATILMAZ", async () => {
    const { user } = setup({}, "draft");
    await user.click(await screen.findByRole("textbox", { name: "Beton döküm · Temel birim oran" }));
    await user.tab();
    expect(backendClient.PATCH).not.toHaveBeenCalled();
  });

  it("öneri popover'ı: Katalog → ÖNCE yaprak oranı (catalog), SONRA L3 katalog bağı", async () => {
    const { user } = setup({}, "draft");
    await user.click(await screen.findByRole("textbox", { name: "Beton döküm · Çatı birim oran" }));
    const pop = await screen.findByRole("dialog", { name: "Beton döküm · Çatı öneri" });
    expect(await within(pop).findByText("1,80 a-s/m³")).toBeInTheDocument();
    await user.click(within(pop).getByRole("button", { name: "Katalog" }));
    await waitFor(() => expect(vi.mocked(backendClient.PATCH)).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(backendClient.PATCH).mock.calls;
    expect(first[0]).toBe("/sites/{site_id}/earned-value/budget/leaves");
    expect((first[1] as { body: unknown }).body).toEqual({
      leaves: [{ boq_item_id: I_BETON, section_id: S_CAT, unit_mhr: "1.8", rate_source: "catalog" }],
    });
    expect(second[0]).toBe("/sites/{site_id}/earned-value/budget/items/{boq_item_id}");
    expect(second[1]).toEqual({
      params: { path: { site_id: SITE_ID, boq_item_id: I_BETON } },
      body: { catalog_item_id: "c-1" },
    });
  });

  it("öneri: GEÇMİŞ seçilince yalnız yaprak yazılır (kaynak history), bağ KURULMAZ", async () => {
    const suggestions = {
      catalog: [],
      history: [{ catalog_item_id: "c-9", discipline_id: "d", match: "exact" as const, name: "x", standard_unit_mhr: "2.05", uom: "m³" }],
    };
    const { user } = setup({ suggestions }, "draft");
    await user.click(await screen.findByRole("textbox", { name: "Beton döküm · Çatı birim oran" }));
    const pop = await screen.findByRole("dialog", { name: "Beton döküm · Çatı öneri" });
    await user.click(await within(pop).findByRole("button", { name: "Gerçekleşeni kullan" }));
    await waitFor(() =>
      expect(lastBody("PATCH", "/budget/leaves")).toEqual({
        leaves: [{ boq_item_id: I_BETON, section_id: S_CAT, unit_mhr: "2.05", rate_source: "history" }],
      }),
    );
    expect(vi.mocked(backendClient.PATCH).mock.calls.some((c) => String(c[0]).includes("/items/"))).toBe(false);
  });

  it("öneri: oran yazılamazsa bağ isteği ATILMAZ ve hata görünür", async () => {
    const { user } = setup({}, "draft");
    vi.mocked(backendClient.PATCH).mockImplementation((() =>
      Promise.resolve({ data: undefined, error: { detail: "Taslak kilitli" }, response: new Response(null, { status: 409 }) })) as never);
    await user.click(await screen.findByRole("textbox", { name: "Beton döküm · Çatı birim oran" }));
    const pop = await screen.findByRole("dialog", { name: "Beton döküm · Çatı öneri" });
    await user.click(await within(pop).findByRole("button", { name: "Katalog" }));
    expect(await screen.findByText("Taslak kilitli")).toBeInTheDocument();
    expect(vi.mocked(backendClient.PATCH)).toHaveBeenCalledTimes(1);
  });

  it("öneri: oran yazıldı ama bağ reddedildiyse bunu SÖYLER", async () => {
    const { user } = setup({}, "draft");
    vi.mocked(backendClient.PATCH).mockImplementation(((path: string) =>
      Promise.resolve(
        path.includes("/items/")
          ? { data: undefined, error: { detail: "Katalog kalemi bulunamadı" }, response: new Response(null, { status: 422 }) }
          : { data: state.view, error: undefined, response: new Response() },
      )) as never);
    await user.click(await screen.findByRole("textbox", { name: "Beton döküm · Çatı birim oran" }));
    const pop = await screen.findByRole("dialog", { name: "Beton döküm · Çatı öneri" });
    await user.click(await within(pop).findByRole("button", { name: "Katalog" }));
    expect(await screen.findByText("Oran yazıldı, katalog bağı kurulamadı: Katalog kalemi bulunamadı")).toBeInTheDocument();
  });

  it("toplu oran: seçili yapraklara tek PATCH + bildirim", async () => {
    const { user } = setup({}, "draft");
    await user.click(await screen.findByRole("checkbox", { name: "Beton döküm seç" }));
    await user.click(screen.getByRole("button", { name: "Seçili satırlara toplu oran ata · 2" }));
    await user.type(screen.getByRole("textbox", { name: "Toplu oran" }), "2,5");
    await user.click(screen.getByRole("button", { name: "Uygula" }));
    await waitFor(() =>
      expect(lastBody("PATCH", "/budget/leaves")).toEqual({
        leaves: [
          { boq_item_id: I_BETON, section_id: S_TML, unit_mhr: "2.5", rate_source: "manual" },
          { boq_item_id: I_BETON, section_id: S_CAT, unit_mhr: "2.5", rate_source: "manual" },
        ],
      }),
    );
    expect(await screen.findByText("2 satıra 2,50 a-s/birim atandı")).toBeInTheDocument();
  });

  it("Katalogdan öner (tümü): dolan + belirsiz sayıları bildirilir", async () => {
    const { user } = setup({}, "draft");
    await user.click(await screen.findByRole("button", { name: "Katalogdan öner (tümü)" }));
    expect(
      await screen.findByText(
        "3 boş satır katalogdan dolduruldu · 1 kalemde eşleşme belirsiz · ayrıntı için oran hücresindeki önerilere bakın",
      ),
    ).toBeInTheDocument();
  });

  it("M1: grup → disiplin eşleme PUT'u", async () => {
    const { user } = setup({}, "draft");
    await user.click(await screen.findByRole("button", { name: "Su yalıtımı disiplini: Seçilmedi" }));
    const menu = screen.getByRole("dialog", { name: "Su yalıtımı için disiplin seç" });
    // Şirket listesi (useEvDisciplines) ağaçta olmayan disiplini de sunar.
    expect(await within(menu).findByRole("button", { name: /Peyzaj/ })).toBeInTheDocument();
    await user.click(within(menu).getByRole("button", { name: /Kaba İnşaat/ }));
    await waitFor(() =>
      expect(lastBody("PUT", "/budget/group-disciplines")).toEqual({
        items: [{ boq_group_id: G_IZO, discipline_id: D_KAB }],
      }),
    );
    expect(await screen.findByText(/Su yalıtımı → Kaba İnşaat eşlendi/)).toBeInTheDocument();
  });

  it("M1: eşlenmiş grupta 'Disiplinsiz (eşlemeyi kaldır)' → discipline_id null; eşlenmemişte YOK", async () => {
    const { user } = setup({}, "draft");
    await user.click(await screen.findByRole("button", { name: "Su yalıtımı disiplini: Seçilmedi" }));
    const unmapped = screen.getByRole("dialog", { name: "Su yalıtımı için disiplin seç" });
    expect(within(unmapped).queryByRole("button", { name: /eşlemeyi kaldır/ })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Betonarme disiplini: Kaba İnşaat" }));
    const menu = screen.getByRole("dialog", { name: "Betonarme için disiplin seç" });
    await user.click(within(menu).getByRole("button", { name: "Disiplinsiz (eşlemeyi kaldır)" }));
    await waitFor(() =>
      expect(lastBody("PUT", "/budget/group-disciplines")).toEqual({ items: [{ boq_group_id: G_BET, discipline_id: null }] }),
    );
  });

  it("M1 yerleşimi: grup satırında seçici 2 kolon (oran+kaynak), engel rozeti 2 kolon (kendi/taş.+doğr./dol.)", async () => {
    setup({}, "draft");
    const picker = await screen.findByRole("button", { name: "Su yalıtımı disiplini: Seçilmedi" });
    expect(picker.closest("td")).toHaveAttribute("colspan", "2");
    const badge = screen.getByText("Engel · doğrudan bütçeli");
    expect(badge.closest("td")).toHaveAttribute("colspan", "2");
    const row = picker.closest("tr") as HTMLElement;
    expect(row.children).toHaveLength(9);
  });

  it("kod hücresi: grup ve yaprak için uydurma ayraç yok, EMPTY_CELL", async () => {
    setup({}, "draft");
    const leafRow = (await screen.findByRole("textbox", { name: "Beton döküm · Temel birim oran" })).closest("tr") as HTMLElement;
    expect(within(leafRow).queryByText("·")).not.toBeInTheDocument();
    expect(leafRow.children[1]).toHaveTextContent("—");
    const groupRow = screen.getByRole("button", { name: "Betonarme disiplini: Kaba İnşaat" }).closest("tr") as HTMLElement;
    expect(groupRow.children[1]).toHaveTextContent("—");
  });

  it("M4: penceresi çıkmayan Bölümsüz yaprağın altında kırmızı alt satır + BOQ bağlantısı", async () => {
    const base = budgetView();
    const pey = { ...base.disciplines[1], id: "d:pey", discipline_id: "d-pey", code: "PEY", name: "Peyzaj", color: "#16a34a" };
    const view = budgetView({
      disciplines: [base.disciplines[0], pey],
      freeze_blockers: [{ code: "missing_window", count: 1, node_ids: [LEAF_IZO] }],
    });
    setup({ view }, "draft");
    const input = await screen.findByRole("textbox", { name: "Membran yalıtım · Bölümsüz birim oran" });
    const row = input.closest("tr") as HTMLElement;
    const after = row.nextElementSibling as HTMLElement;
    expect(within(after).getByText("Penceresi çıkmıyor")).toBeInTheDocument();
    expect(within(after).getByText("Peyzaj'ın hiçbir bölümde penceresi yok; bu satır dağıtılamaz, dondurma engellenir.")).toBeInTheDocument();
    expect(within(after).getByRole("link", { name: "İş Kalemleri'nde bölüme tahsis et →" })).toHaveAttribute(
      "href",
      "/projeler/gunes/santiyeler/a-blok/is-kalemleri",
    );
    expect(row).toHaveAttribute("aria-describedby", after.querySelector("td")?.id);
  });

  it("M2: iş tipi Kendi/Taşeron seçici PATCH /items", async () => {
    const { user } = setup({}, "draft");
    await user.click(await screen.findByRole("button", { name: "Beton döküm Kendi/Taşeron: Kendi" }));
    const menu = screen.getByRole("dialog", { name: "Beton döküm Kendi/Taşeron" });
    await user.click(within(menu).getByRole("button", { name: /Taşeron/ }));
    await waitFor(() => expect(lastBody("PATCH", "/items/{boq_item_id}")).toEqual({ contractor_type: "subcon" }));
  });

  it("M2: yaprak ezmesi geri alınır (contractor_type null)", async () => {
    const { user } = setup({}, "draft");
    await user.click(await screen.findByRole("button", { name: "Beton döküm · Çatı · Kendi/Taşeron: Taşeron" }));
    await user.click(screen.getByRole("button", { name: "Ezmeyi geri al (Kendi)" }));
    await waitFor(() =>
      expect(lastBody("PATCH", "/budget/leaves")).toEqual({
        leaves: [{ boq_item_id: I_BETON, section_id: S_CAT, contractor_type: null }],
      }),
    );
  });

  it("'Yalnız oranı boş olanlar' süzgeci", async () => {
    const { user } = setup({}, "draft");
    await screen.findByRole("textbox", { name: "Beton döküm · Temel birim oran" });
    await user.click(screen.getByRole("button", { name: "Yalnız oranı boş olanlar" }));
    expect(screen.queryByRole("textbox", { name: "Beton döküm · Temel birim oran" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Beton döküm · Çatı birim oran" })).toBeInTheDocument();
  });

  it("revizyon farkı: anahtar paneli açar (K22 artış işareti)", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("switch", { name: "Revizyon farkını göster" }));
    const panel = await screen.findByRole("region", { name: "Revizyon farkı · Rev 1 → Rev 2" });
    expect(within(panel).getByText("+126")).toHaveClass("ev-budget-tone--increase");
    expect(within(panel).getByText("−114")).toHaveClass("ev-budget-tone--decrease");
  });
});

describe("Adım 4 · Baseline (B1-7 · M5 · M6)", () => {
  it("engel: disiplinsiz grup listelenir, Dondur kapalı, bağlantı Adım 1'e götürür", async () => {
    const { user } = setup({}, "approve", "adim=4");
    const blockers = await screen.findByRole("region", { name: "Dondurma engelleri" });
    expect(within(blockers).getByText(/1 BOQ grubu disiplinsiz \(doğrudan bütçeli\)/)).toBeInTheDocument();
    expect(within(blockers).getByText("Su yalıtımı")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baseline'ı Dondur" })).toBeDisabled();
    expect(screen.getByText("Engeller kapanınca etkinleşir")).toBeInTheDocument();
    await user.click(within(blockers).getByRole("button", { name: /Adım 1 · Oranlar/ }));
    expect(lastReplace().has("adim")).toBe(false);
  });

  it("engel yok: modal uyarıyı taşır, Dondur → POST /freeze, başarı mesajı", async () => {
    const view = budgetView({ freeze_blockers: [] });
    const { user } = setup({ view }, "approve", "adim=4");
    await user.click(await screen.findByRole("button", { name: "Baseline'ı Dondur" }));
    const modal = await screen.findByRole("dialog", { name: "Rev 2 baseline olarak dondurulsun mu?" });
    expect(within(modal).getByText("1 kalem oranı boş.")).toBeInTheDocument();
    expect(within(modal).getByText(/Rev 1 arşive geçer; sonraki değişiklikler Rev 3 taslağı/)).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Dondur" }));
    await waitFor(() =>
      expect(lastBody("POST", "/budget/freeze")).toEqual({ name: "Rev 2 — Temel beton revizyonu", description: null }),
    );
    expect(await screen.findByText(/Rev 2 donduruldu · 24\.09\.2026 · Ahmet Yılmaz/)).toBeInTheDocument();
  });

  it("dondurma reddedilirse (422) hata bildirimi GÖRÜNÜR", async () => {
    const { user } = setup({ view: budgetView({ freeze_blockers: [] }) }, "approve", "adim=4");
    vi.mocked(backendClient.POST).mockImplementation(((path: string) =>
      Promise.resolve(
        path.endsWith("/freeze")
          ? { data: undefined, error: { detail: "Dondurma engeli var" }, response: new Response(null, { status: 422 }) }
          : { data: state.preview, error: undefined, response: new Response() },
      )) as never);
    await user.click(await screen.findByRole("button", { name: "Baseline'ı Dondur" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Dondur" }));
    expect(await screen.findByText("Dondurma engeli var")).toBeInTheDocument();
  });

  it("draft yetkisi: Dondur ve Taslağı sil GÖRÜNMEZ", async () => {
    setup({ view: budgetView({ freeze_blockers: [] }) }, "draft", "adim=4");
    await screen.findByText("Adım 4 · Baseline'ı dondur");
    expect(screen.queryByRole("button", { name: "Baseline'ı Dondur" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Taslağı sil" })).not.toBeInTheDocument();
  });

  it("taslak sil: onay modalı → DELETE, adım 1'e döner (silme yalnız sistem yöneticisi)", async () => {
    const { user } = setup({}, "admin", "adim=4");
    await user.click(await screen.findByRole("button", { name: "Taslağı sil" }));
    const modal = await screen.findByRole("dialog", { name: "Rev 2 taslağı silinsin mi?" });
    expect(within(modal).getByText(/Aktif baseline Rev 1 değişmez/)).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Taslağı sil" }));
    await waitFor(() =>
      expect(backendClient.DELETE).toHaveBeenCalledWith("/sites/{site_id}/earned-value/budget/revisions/{revision_id}", {
        params: { path: { site_id: SITE_ID, revision_id: "rev-2" } },
      }),
    );
    await waitFor(() => expect(lastReplace().has("adim")).toBe(false));
  });

  it("aktif revizyon: tek engel 'Dondurulacak taslak yok' + Taslak aç", async () => {
    setup({ view: budgetView({ revision: ACTIVE_REV_1, editable: false }), revisions: [ACTIVE_REV_1] }, "approve", "adim=4");
    const blockers = await screen.findByRole("region", { name: "Dondurma engelleri" });
    expect(within(blockers).getByText(/Dondurulacak taslak yok/)).toBeInTheDocument();
    expect(within(blockers).getByRole("button", { name: "Taslak aç (Rev 2)" })).toBeEnabled();
  });
});

describe("Adım 2 · Zamanlama (M3)", () => {
  it("pencere popover'ı: dışına taşma uyarısı, Uygula → tam değiştirme PUT", async () => {
    const { user } = setup({}, "draft", "adim=2");
    await user.click(await screen.findByRole("button", { name: "Kaba İnşaat penceresi 06.05.26–15.07.26 — düzenle" }));
    const pop = await screen.findByRole("dialog", { name: "Kaba İnşaat · Temel penceresi" });
    const end = within(pop).getByRole("textbox", { name: "Pencere bitişi" });
    await user.clear(end);
    await user.type(end, "20.07.2026");
    expect(within(pop).getByText(/Pencere bölüm tarihinin dışına taşıyor/)).toBeInTheDocument();
    await user.click(within(pop).getByRole("button", { name: "Uygula" }));
    await waitFor(() =>
      expect(lastBody("PUT", "/budget/windows")).toEqual({
        windows: [
          { discipline_id: D_KAB, section_id: S_CAT, start_date: "2026-12-01", end_date: "2027-01-20" },
          { discipline_id: D_KAB, section_id: S_TML, start_date: "2026-05-06", end_date: "2026-07-20" },
        ],
      }),
    );
  });

  it("dağılım tipi PUT /distributions", async () => {
    const { user } = setup({}, "draft", "adim=2");
    const group = await screen.findByRole("group", { name: "Kaba İnşaat dağılım tipi" });
    await user.click(within(group).getByRole("button", { name: /Çan/ }));
    await waitFor(() =>
      expect(lastBody("PUT", "/budget/distributions")).toEqual({ items: [{ discipline_id: D_KAB, distribution: "bell" }] }),
    );
  });

  it("salt okunurda çubuk düğme değildir, dağılım kapalıdır", async () => {
    setup({}, "view", "adim=2");
    const group = await screen.findByRole("group", { name: "Kaba İnşaat dağılım tipi" });
    expect(within(group).getByRole("button", { name: /Çan/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /penceresi .* — düzenle/ })).not.toBeInTheDocument();
  });
});

describe("Adım 3 · Önizleme", () => {
  it("disiplin toplamları tablosu önizleme ucundan", async () => {
    setup({}, "draft", "adim=3");
    const table = await screen.findByRole("region", { name: "Disiplin toplamları" });
    expect(within(table).getByText("Doğrusal")).toBeInTheDocument();
    expect(within(table).getByText("Toplam doğrudan")).toBeInTheDocument();
    expect(backendClient.POST).toHaveBeenCalledWith("/sites/{site_id}/earned-value/budget/preview", {
      params: { path: { site_id: SITE_ID } },
      body: { revision_id: "rev-2", distributions: [], windows: [] },
    });
  });
});

describe("taslak revizyon satırı", () => {
  it("adım çubuğu kapısız: Adım 3'e tıklamak URL'e yazar", async () => {
    const { user } = setup({ revisions: [revision()] });
    await user.click(await screen.findByRole("button", { name: /Önizleme/ }));
    expect(lastReplace().get("adim")).toBe("3");
  });
});

describe("tamamlanmış şantiye (B1-12 · PLN-F1.6.2) — backend editable:true dönse bile salt okunur", () => {
  it("Adım 1: şerit, oran düz metin, eylem ve seçim yok", async () => {
    setup({}, "approve", "", "completed");
    expect(await screen.findByText("Tamamlanmış şantiye · bütçe salt okunur.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /birim oran/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Katalogdan öner (tümü)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /disiplini:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Kendi\/Taşeron:/ })).not.toBeInTheDocument();
  });

  it("revizyon listesinde 'Taslak aç' yok (aktif, taslak yok)", async () => {
    const { user } = setup({ view: budgetView({ revision: ACTIVE_REV_1, editable: false }), revisions: [ACTIVE_REV_1] }, "approve", "", "completed");
    await user.click(await screen.findByRole("button", { name: /Revizyon/ }));
    expect(screen.queryByRole("button", { name: /Taslak aç/ })).not.toBeInTheDocument();
  });

  it("Adım 2: pencere çubuğu tıklanmaz, dağılım kapalı", async () => {
    setup({}, "approve", "adim=2", "completed");
    const group = await screen.findByRole("group", { name: "Kaba İnşaat dağılım tipi" });
    expect(within(group).getByRole("button", { name: /Çan/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /— düzenle/ })).not.toBeInTheDocument();
  });

  it("Adım 4: Dondur ve Taslağı sil GÖRÜNMEZ, form kapalı", async () => {
    setup({ view: budgetView({ freeze_blockers: [] }) }, "approve", "adim=4", "completed");
    expect(await screen.findByText("Adım 4 · Baseline'ı dondur")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Baseline'ı Dondur" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Taslağı sil" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Revizyon adı" })).toBeDisabled();
  });

  /**
   * FIX-F2 · Ajan B madde 4 — KANIT. `useSite` hata dönerse (404/ağ, forbidden
   * DEĞİL) `site.data` `undefined` kalır, `siteId=""` `BudgetScreen`e geçer;
   * `BudgetScreen` içindeki bütçe sorgusu boş id'de sessizce idle'da durur —
   * hiç hata basılmadan SONSUZ İSKELET görünür. Emsal (`SitePlanningView.tsx:91`).
   */
  it("useSite hata dönerse (forbidden DEĞİL) BudgetScreen render EDİLMEZ, hata basılır", () => {
    state = defaultState();
    wireBackend(state);
    mockPermission("approve");
    vi.mocked(useSite).mockReturnValue({ data: undefined, isError: true, error: new Error("network") } as never);
    renderWithQuery(<ManHourBudgetView />);
    // KIRMIZI: bugün useSite hatası HİÇ kontrol edilmediği için bütçe
    // iskeleti (yükleniyor durumu) sonsuza dek gösterilir.
    expect(screen.getByText("Şantiye yüklenemedi")).toBeInTheDocument();
  });

  it("yarış: şantiye ekranda açıkken tamamlanırsa 409 mesajı bildirimde görünür", async () => {
    const { user } = setup({}, "draft");
    vi.mocked(backendClient.PATCH).mockImplementation((() =>
      Promise.resolve({
        data: undefined,
        error: { detail: "Tamamlanmış şantiyenin bütçesi salt okunurdur" },
        response: new Response(null, { status: 409 }),
      })) as never);
    const input = await screen.findByRole("textbox", { name: "Beton döküm · Temel birim oran" });
    await user.clear(input);
    await user.type(input, "2");
    await user.tab();
    expect(await screen.findByText("Tamamlanmış şantiyenin bütçesi salt okunurdur")).toBeInTheDocument();
  });
});
