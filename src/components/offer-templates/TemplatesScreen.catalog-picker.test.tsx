import { useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { backendClient } from "@/lib/api/client";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { BETON, DEMIR, D_DUV, D_KAB, SIVA } from "@/components/work-item-catalog/work-item-fixtures";

import { createFakeBackend, STALE_DETAIL, type FakeBackend, type FakeOptions } from "./template-fake-backend.testkit";
import { TemplatesScreen } from "./TemplatesScreen";

/** TKL-F4.6 · Şablonlar ekranı "+ Katalogdan Ekle" (seçicinin ÜÇÜNCÜ hedefi): açılış, tek PUT, hata yolları. */

const perm = vi.hoisted(() => ({ level: "full" as string | undefined }));
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
const nav = vi.hoisted(() => ({ replace: vi.fn(), setParam: null as null | ((value: string | null) => void) }));

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({ level: perm.level, canView: perm.level !== "none", canWrite: true, canDelete: true }),
}));
// IZN-F6a · kapılar yalnız sayfa izninden karar verir: `perm.level` (modül niyeti) oturum sayfa iznine çevrilir —
// none/view = sözleşme/teklif sayfaları None/Görür, full = Düzenler (SA değil), admin = sistem yöneticisi (Sil `need: "sa"`).
vi.mock("@/components/shell/SessionProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/shell/SessionProvider")>();
  const { meFixture, pagesFor } = await import("@/lib/auth/page-grants.testkit");
  const { CONTRACTS_VIEW } = await import("@/lib/auth/page-gates");
  return {
    ...actual,
    useSession: () => {
      const level = perm.level;
      const me =
        level === "admin"
          ? meFixture({ isSystemAdmin: true })
          : level === "full"
            ? meFixture()
            : meFixture({ pages: pagesFor(CONTRACTS_VIEW, level === "view" ? "view" : "none") });
      return { ...actual.SESSION_CONTEXT_DEFAULT, me, isLoading: false };
    },
  };
});
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace, push: vi.fn() }) }));

const NEW_GROUP_VALUE = "__new__";
const CATALOG = [BETON, DEMIR, SIVA];

function options(overrides: Partial<FakeOptions> = {}): FakeOptions {
  return {
    templates: [
      {
        id: "tpl-a",
        name: "Konut · kaba inşaat",
        description: null,
        overhead_pct: "12.00",
        profit_pct: "15.00",
        is_default: true,
        usage_count: 1,
        groups: [
          { name: "Betonarme", items: [BETON.id] },
          { name: "Kalıp", items: [] },
        ],
      },
    ],
    catalog: CATALOG as unknown as Record<string, unknown>[],
    disciplines: [D_KAB, D_DUV],
    ...overrides,
  };
}

let fake: FakeBackend;

function wire(opts: FakeOptions = options()) {
  fake = createFakeBackend(opts);
  for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"] as const) {
    vi.mocked(backendClient[method]).mockImplementation(((path: string, init: never) =>
      Promise.resolve(fake.handle(method, path, init))) as never);
  }
}

function Harness() {
  const [param, setParam] = useState<string | null>(null);
  nav.setParam = setParam;
  return <TemplatesScreen templateParam={param} />;
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}

const itemsRegion = () => screen.getByRole("region", { name: "Şablon kalemleri" });
const addButton = () => within(itemsRegion()).getByRole("button", { name: "+ Katalogdan Ekle" });
const dialog = () => screen.getByRole("dialog", { name: "Katalogdan Kalem Ekle" });
const check = (pozNo: string) => within(within(dialog()).getByText(pozNo).closest("tr") as HTMLElement).getByRole("checkbox", { name: `${pozNo} seç` });
const submitButton = () => within(dialog()).getByRole("button", { name: /Kalemi Ekle|^Kalem Ekle$|Ekleniyor/ });
const puts = () => fake.callsTo("PUT", "/offers/templates/{template_id}/content");
const writes = () => fake.calls.filter((call) => call.method !== "GET");

async function openPicker() {
  await screen.findByRole("region", { name: "Şablon kalemleri" });
  await userEvent.click(await waitFor(() => addButton()));
  await within(await screen.findByRole("dialog", { name: "Katalogdan Kalem Ekle" })).findByText(SIVA.poz_no);
}

beforeEach(() => {
  vi.clearAllMocks();
  perm.level = "full";
  scope.value = { isRestricted: false, names: [] };
  nav.replace.mockImplementation((url: string) => {
    const param = new URL(url, "http://x").searchParams.get("sablon");
    act(() => nav.setParam?.(param));
  });
  wire();
});

afterEach(() => {
  unsavedRegistry.set("test-cleanup", null);
  vi.restoreAllMocks();
});

describe("düğme", () => {
  it("🔴 yazabilene ETKİN ve gerekçesiz (F4.5'in 'Yakında' pasifliği kalktı); tıklayınca seçici açılır, istek yazılmaz", async () => {
    renderScreen();
    await openPicker();
    expect(addButton()).toBeEnabled();
    expect(addButton()).not.toHaveAttribute("title");
    expect(dialog()).toBeInTheDocument();
    expect(screen.getByText("İş Kalemi Kataloğu'ndan şablona kalem ekle")).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it("🔴 yazamayana (görüntüleyici) düğme HİÇ yok", async () => {
    perm.level = "view";
    renderScreen();
    await screen.findByRole("region", { name: "Şablon kalemleri" });
    expect(screen.queryByRole("button", { name: /Katalogdan Ekle/ })).not.toBeInTheDocument();
  });

  it("🔴 disiplin kısıtlı tam yetkili de yazamaz: düğme yok", async () => {
    scope.value = { isRestricted: true, names: ["Betonarme"] };
    renderScreen();
    await screen.findByRole("region", { name: "Şablon kalemleri" });
    expect(screen.queryByRole("button", { name: /Katalogdan Ekle/ })).not.toBeInTheDocument();
  });
});

describe("onay → TEK PUT", () => {
  it("🔴 mevcut gruba: tek PUT (kalem seti + expected_updated_at), grup POST'u YOK, seçici kapanır, tablo yeni kalemleri gösterir", async () => {
    renderScreen();
    await openPicker();
    expect(screen.getByRole("combobox", { name: "Grup" })).toHaveDisplayValue("Kalıp");
    await userEvent.click(check(SIVA.poz_no));
    await userEvent.click(check(DEMIR.poz_no));
    await userEvent.click(submitButton());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(puts()).toHaveLength(1);
    expect(writes()).toHaveLength(1);
    const body = puts()[0]?.body as { groups: { name: string; items: { catalog_item_id: string }[] }[]; expected_updated_at: string };
    expect(body.groups).toEqual([
      { name: "Betonarme", items: [{ catalog_item_id: BETON.id }] },
      { name: "Kalıp", items: [{ catalog_item_id: SIVA.id }, { catalog_item_id: DEMIR.id }] },
    ]);
    expect(body.expected_updated_at).toBeTruthy();
    expect(await within(itemsRegion()).findByText(SIVA.poz_no)).toBeInTheDocument();
  });

  it("🔴 yeni grup: ayrı grup isteği YOK; tek PUT yeni grubu kalemleriyle sona ekler", async () => {
    renderScreen();
    await openPicker();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Grup" }), NEW_GROUP_VALUE);
    expect(screen.getByLabelText("Grup Adı")).toHaveValue("Yeni grup");
    await userEvent.clear(screen.getByLabelText("Grup Adı"));
    await userEvent.type(screen.getByLabelText("Grup Adı"), "Cephe");
    await userEvent.click(check(DEMIR.poz_no));
    await userEvent.click(submitButton());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(writes()).toHaveLength(1);
    expect((puts()[0]?.body as { groups: unknown[] }).groups).toEqual([
      { name: "Betonarme", items: [{ catalog_item_id: BETON.id }] },
      { name: "Kalıp", items: [] },
      { name: "Cephe", items: [{ catalog_item_id: DEMIR.id }] },
    ]);
  });

  it("🔴 eklenen kalem şablonda olduğundan seçici yeniden açılınca 'Şablonda var' (gizli; kaldırınca gerekçeli)", async () => {
    renderScreen();
    await openPicker();
    await userEvent.click(check(DEMIR.poz_no));
    await userEvent.click(submitButton());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await within(itemsRegion()).findByText(DEMIR.poz_no);
    await userEvent.click(addButton());
    await within(await screen.findByRole("dialog", { name: "Katalogdan Kalem Ekle" })).findByText(SIVA.poz_no);
    expect(within(dialog()).queryByText(DEMIR.poz_no)).not.toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("checkbox", { name: "Şablonda olanları gizle" }));
    expect(within(dialog()).getAllByText(/^Şablonda var · /)).toHaveLength(2);
  });
});

describe("hata yolları (editörün mevcut yolu)", () => {
  it("🔴 409: tek PUT, backend metni seçici bandında AYNEN, seçici AÇIK ve seçim korunur, detay yeniden okunur", async () => {
    wire(options({ failures: { "PUT /offers/templates/{template_id}/content": { status: 409, detail: STALE_DETAIL } } }));
    renderScreen();
    await openPicker();
    const detailGets = fake.callsTo("GET", "/offers/templates/{template_id}").length;
    await userEvent.click(check(DEMIR.poz_no));
    await userEvent.click(submitButton());
    await waitFor(() => expect(within(dialog()).getByTestId("wip-band")).toHaveTextContent(STALE_DETAIL));
    expect(puts()).toHaveLength(1);
    expect(dialog()).toBeInTheDocument();
    expect(check(DEMIR.poz_no)).toBeChecked();
    await waitFor(() => expect(fake.callsTo("GET", "/offers/templates/{template_id}").length).toBe(detailGets + 1));
  });

  it("🔴 diğer backend hatası (422) metni AYNEN bantta, seçici açık", async () => {
    wire(options({ failures: { "PUT /offers/templates/{template_id}/content": { status: 422, detail: "Katalog iş tipi bulunamadı" } } }));
    renderScreen();
    await openPicker();
    await userEvent.click(check(DEMIR.poz_no));
    await userEvent.click(submitButton());
    await waitFor(() => expect(within(dialog()).getByTestId("wip-band")).toHaveTextContent("Katalog iş tipi bulunamadı"));
    expect(dialog()).toBeInTheDocument();
  });

  it("açılışta eski editör hatası seçici bandına SIZMAZ", async () => {
    wire(options({ failures: { "PUT /offers/templates/{template_id}/content": { status: 422, detail: "Eski hata" } } }));
    renderScreen();
    await openPicker();
    await userEvent.click(check(DEMIR.poz_no));
    await userEvent.click(submitButton());
    await waitFor(() => expect(within(dialog()).getByTestId("wip-band")).toHaveTextContent("Eski hata"));
    await userEvent.click(within(dialog()).getByRole("button", { name: "Vazgeç" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(addButton());
    await within(await screen.findByRole("dialog", { name: "Katalogdan Kalem Ekle" })).findByText(SIVA.poz_no);
    expect(screen.queryByTestId("wip-band")).not.toBeInTheDocument();
  });
});

describe("kapatma", () => {
  it("🔴 Vazgeç hiçbir istek yazmaz", async () => {
    renderScreen();
    await openPicker();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it("🔴 kirli seçimle arka plan tıklaması mevcut onayı sorar; reddedilirse seçici ve seçim kalır", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderScreen();
    await openPicker();
    await userEvent.click(check(DEMIR.poz_no));
    await userEvent.click(document.querySelector(".modal-overlay") as HTMLElement);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(check(DEMIR.poz_no)).toBeChecked();
    expect(writes()).toHaveLength(0);
  });
});

/** Başka bir kullanıcı içeriği değiştirdi: backend TÜM grup/kalem kimliklerini yeniden üretir, `updated_at` ilerler. */
function otherUserReplaces(groups: { name: string; items: string[] }[]) {
  fake.handle("PUT", "/offers/templates/{template_id}/content", {
    params: { path: { template_id: "tpl-a" } },
    body: {
      groups: groups.map((group) => ({ name: group.name, items: group.items.map((id) => ({ catalog_item_id: id })) })),
      expected_updated_at: fake.row("tpl-a")?.updated_at,
    },
  } as never);
}
const ownPuts = () => puts().slice(1); // 1. = başkasının

describe("TKL-F4.6b · sunucu kimlikleri değişir (Y1/O1)", () => {
  it("🔴 Y1: seçici açıkken kimlikler değişse (409 + tazeleme) seçilen grup SESSİZCE son gruba kaymaz; ekleme seçilen gruba gider", async () => {
    renderScreen();
    await openPicker();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Grup" }), "Betonarme");
    otherUserReplaces([{ name: "Betonarme", items: [BETON.id] }, { name: "Kalıp", items: [] }]);
    const gets = fake.callsTo("GET", "/offers/templates/{template_id}").length;
    await userEvent.click(check(DEMIR.poz_no));
    await userEvent.click(submitButton());
    await waitFor(() => expect(within(dialog()).getByTestId("wip-band")).toHaveTextContent(STALE_DETAIL));
    await waitFor(() => expect(fake.callsTo("GET", "/offers/templates/{template_id}").length).toBe(gets + 1));
    expect(screen.getByRole("combobox", { name: "Grup" })).toHaveDisplayValue("Betonarme");
    await userEvent.click(submitButton());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect((ownPuts().at(-1)?.body as { groups: unknown }).groups).toEqual([
      { name: "Betonarme", items: [{ catalog_item_id: BETON.id }, { catalog_item_id: DEMIR.id }] },
      { name: "Kalıp", items: [] },
    ]);
  });

  it("🔴 Y1: seçilen grup artık yoksa (yeniden adlandırıldı) sessiz geri düşme YOK — seçim temizlenir, gönderim kilitlenir", async () => {
    renderScreen();
    await openPicker();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Grup" }), "Betonarme");
    otherUserReplaces([{ name: "Temel", items: [BETON.id] }, { name: "Kalıp", items: [] }]);
    const gets = fake.callsTo("GET", "/offers/templates/{template_id}").length;
    await userEvent.click(check(DEMIR.poz_no));
    await userEvent.click(submitButton());
    await waitFor(() => expect(fake.callsTo("GET", "/offers/templates/{template_id}").length).toBe(gets + 1));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Grup" })).toHaveDisplayValue("Grup seçin"));
    expect(submitButton()).toBeDisabled();
    expect(within(dialog()).getByTestId("wip-band")).toHaveTextContent("Seçili grup artık yok");
    expect(ownPuts()).toHaveLength(1); // yalnız 409 alan ilk deneme
    // Yeniden seçince gönderim açılır.
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Grup" }), "Temel");
    expect(submitButton()).toBeEnabled();
  });

  it("🔴 O1: aynı adlı iki grupta ikinci gruba seçilen ekleme O gruba gider (ilk eşleşmeye değil)", async () => {
    const base = options();
    wire(options({ templates: [{ ...(base.templates[0] as never as Record<string, unknown>), groups: [{ name: "Yeni grup", items: [BETON.id] }, { name: "Yeni grup", items: [] }] } as never] }));
    renderScreen();
    await openPicker();
    const combo = screen.getByRole("combobox", { name: "Grup" });
    await userEvent.selectOptions(combo, within(combo).getAllByRole("option")[1] as HTMLElement);
    await userEvent.click(check(DEMIR.poz_no));
    await userEvent.click(submitButton());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect((puts()[0]?.body as { groups: unknown }).groups).toEqual([
      { name: "Yeni grup", items: [{ catalog_item_id: BETON.id }] },
      { name: "Yeni grup", items: [{ catalog_item_id: DEMIR.id }] },
    ]);
  });
});
