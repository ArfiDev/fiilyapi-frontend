import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useSession } from "@/components/shell/SessionProvider";
import type { EvSettingsRead, EvSettingsSave } from "@/lib/api/models";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";
import type { MeResponse } from "@/lib/auth/types";
import { useEvSiteOptions, type EvSiteOption } from "@/lib/api/hooks/useEvSettings";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { PlanningSettingsScreen } from "./PlanningSettingsScreen";

const replace = vi.fn();
let searchParams = new URLSearchParams("site=s-a");

vi.mock("next/navigation", () => ({
  usePathname: () => "/ayarlar/planlama",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useEvSettings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEvSettings")>()),
  useEvSiteOptions: vi.fn(),
}));

const OPTIONS: EvSiteOption[] = [
  {
    siteId: "s-a",
    siteName: "A-Blok Şantiyesi",
    projectId: "p-1",
    projectName: "Güneşkent Konut",
    isCompleted: false,
  },
  {
    siteId: "s-b",
    siteName: "B-Blok Şantiyesi",
    projectId: "p-1",
    projectName: "Güneşkent Konut",
    isCompleted: true,
  },
  {
    siteId: "s-c",
    siteName: "C-Blok Şantiyesi",
    projectId: "p-1",
    projectName: "Güneşkent Konut",
    isCompleted: false,
  },
];

const SETTINGS: EvSettingsRead = {
  week_start_dow: 0,
  weekly_off_days: [6],
  standard_daily_hours: "9.00",
  tolerance_points: "2.00",
  pf_bands: {
    daily: { red_below: "0.950", green_from: "0.950", high_above: "1.050" },
    weekly: { red_below: "0.950", green_from: "1.000" },
  },
  holidays: [
    { id: "h-1", date_from: "2026-05-26", date_to: "2026-05-30", note: "Kurban Bayramı" },
    { id: "h-2", date_from: "2026-08-30", date_to: "2026-08-30", note: "Zafer Bayramı" },
  ],
  composite_metrics: [
    {
      id: "m-1",
      name: "1 m³ beton başına toplam betonarme a-s",
      measure: "spent",
      numerator_item_ids: ["i-kalip", "i-beton"],
      denominator_item_id: "i-beton",
    },
  ],
  is_default: false,
  updated_at: "2026-09-24T10:00:00Z",
  updated_by: null,
};

const BOQ = {
  groups: [
    {
      id: "g-1",
      name: "Kaba yapı",
      sort_order: 1,
      group_total: "0",
      items: [
        { id: "i-kalip", code: "KAB.01.01", description: "Kalıp", unit: "m²" },
        { id: "i-demir", code: "KAB.01.02", description: "Demir", unit: "ton" },
        { id: "i-beton", code: "KAB.01.03", description: "Beton", unit: "m³" },
      ],
    },
  ],
  totals: {},
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface Backend {
  settings?: () => Response | Promise<Response>;
  save?: (body: EvSettingsSave) => Response;
}

const putBodies: EvSettingsSave[] = [];

function stubBackend({ settings, save }: Backend = {}) {
  const fetchMock = vi.fn(async (input: Request) => {
    const path = new URL(input.url).pathname;
    if (/\/sites\/[^/]+\/boq$/.test(path)) return json(BOQ);
    if (/\/sites\/[^/]+\/earned-value\/settings$/.test(path)) {
      if (input.method === "PUT") {
        const body = (await input.json()) as EvSettingsSave;
        putBodies.push(body);
        return save ? save(body) : json({ ...SETTINGS, updated_at: "2026-09-25T09:00:00Z" });
      }
      return settings ? settings() : json(SETTINGS);
    }
    return json({ detail: "yok" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function setPermission(level: string | undefined) {
  vi.mocked(useSession).mockReturnValue({
    me: { permissions: level === undefined ? {} : { earned_value: level } } as unknown as MeResponse,
    isLoading: false,
  } as never);
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlanningSettingsScreen />
    </QueryClientProvider>,
  );
}

/** Form verisi yüklenene kadar DEĞERE bağlı bekle (senkron iddia yok). */
async function waitForForm() {
  await screen.findByDisplayValue("Kurban Bayramı");
}

function saveBar() {
  return screen.getByRole("region", { name: "Kaydetme çubuğu" });
}

beforeEach(() => {
  replace.mockClear();
  putBodies.length = 0;
  searchParams = new URLSearchParams("site=s-a");
  setPermission("draft");
  vi.mocked(useEvSiteOptions).mockReturnValue({
    options: OPTIONS,
    groups: [{ projectId: "p-1", projectName: "Güneşkent Konut", sites: OPTIONS }],
    isLoading: false,
    isError: false,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlanningSettingsScreen · yükleme / hata", () => {
  it("başlığı ve alt metni ekranın içinde basar", async () => {
    stubBackend();
    renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "Planlama Ayarları" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Adam-saat planlama ve ilerleme modülünün şantiye takvimi, eşikleri ve paçal metrikleri",
      ),
    ).toBeInTheDocument();
    await waitForForm();
  });

  it("ayarlar gelene kadar iskelet gösterir", async () => {
    stubBackend({ settings: () => new Promise<Response>(() => {}) });
    renderScreen();
    expect(await screen.findByText("Planlama ayarları yükleniyor")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Kaydetme çubuğu" })).not.toBeInTheDocument();
  });

  it("okuma hatasında ortak hata kartı + Tekrar dene yeniden ister (K24)", async () => {
    const user = userEvent.setup();
    let calls = 0;
    stubBackend({
      settings: () => {
        calls += 1;
        return calls === 1 ? json({ detail: "boom" }, 500) : json(SETTINGS);
      },
    });
    renderScreen();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Planlama ayarları yüklenemedi")).toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Tekrar dene" }));
    await waitForForm();
  });

  it("403'te yetki yok kartı basar", async () => {
    stubBackend({ settings: () => json({ detail: "Yetkisiz işlem" }, 403) });
    renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });
});

describe("PlanningSettingsScreen · şantiye seçimi (K1 · M7)", () => {
  it("?site= yoksa ilk DEVAM EDEN şantiyeyi seçer ve adrese geri yazar", async () => {
    searchParams = new URLSearchParams("");
    vi.mocked(useEvSiteOptions).mockReturnValue({
      options: [OPTIONS[1], OPTIONS[0]],
      groups: [{ projectId: "p-1", projectName: "Güneşkent Konut", sites: [OPTIONS[1], OPTIONS[0]] }],
      isLoading: false,
      isError: false,
    });
    stubBackend();
    renderScreen();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/ayarlar/planlama?site=s-a", { scroll: false }),
    );
  });

  it("seçili şantiyeyi proje · şantiye etiketiyle gösterir, tamamlananı işaretler", async () => {
    stubBackend();
    renderScreen();
    await waitForForm();
    const select = screen.getByRole("combobox", { name: "Şantiye" });
    expect(select).toHaveValue("s-a");
    expect(
      within(select).getByRole("option", { name: "Güneşkent Konut · B-Blok Şantiyesi · tamamlandı · salt okunur" }),
    ).toBeInTheDocument();
  });

  it("değişiklik yokken şantiye değişimi doğrudan adrese yazılır (modal yok)", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderScreen();
    await waitForForm();

    await user.selectOptions(screen.getByRole("combobox", { name: "Şantiye" }), "s-c");
    expect(replace).toHaveBeenCalledWith("/ayarlar/planlama?site=s-c", { scroll: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("kaydedilmemiş değişiklik varken uyarı modalı: yalnız Vazgeç + Değişiklikleri at ve geç (F0-8)", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderScreen();
    await waitForForm();

    const high = screen.getByRole("textbox", { name: "Günlük şüpheli yüksek eşiği" });
    await user.clear(high);
    await user.type(high, "1,08");

    await user.selectOptions(screen.getByRole("combobox", { name: "Şantiye" }), "s-c");
    const dialog = await screen.findByRole("dialog", { name: "Kaydedilmemiş değişiklikler var" });
    expect(replace).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText(
        "A-Blok Şantiyesi ayarlarında kaydedilmemiş değişiklik var. Geçiş yapılırsa (C-Blok Şantiyesi) bu değişiklikler kaybolur.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("1")).toBeInTheDocument();
    expect(within(dialog).getByText("PF bantları")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /kaydet/i })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Şantiye" })).toHaveValue("s-a");
    expect(screen.getByDisplayValue("1,08")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Şantiye" }), "s-c");
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Değişiklikleri at ve geç",
      }),
    );
    expect(replace).toHaveBeenCalledWith("/ayarlar/planlama?site=s-c", { scroll: false });
  });
});

describe("PlanningSettingsScreen · düzenle → kaydet", () => {
  it("yüklenen değerleri basar ve temiz çubuk gösterir", async () => {
    stubBackend();
    renderScreen();
    await waitForForm();

    expect(screen.getByRole("textbox", { name: "Günlük standart saat" })).toHaveValue("9");
    expect(screen.getByRole("textbox", { name: "Durum toleransı (puan)" })).toHaveValue("2,0");
    const weekStart = screen.getByRole("group", { name: "Hafta başlangıç günü" });
    expect(within(weekStart).getByRole("button", { name: "Pzt" })).toHaveAttribute("aria-pressed", "true");
    const offDays = screen.getByRole("group", { name: "Çalışılmayan haftalık günler" });
    expect(within(offDays).getByRole("button", { name: "Paz" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByDisplayValue("26.05.2026 – 30.05.2026")).toBeInTheDocument();
    expect(screen.getByText("Paz'a denk")).toBeInTheDocument();
    expect(screen.getByText("2 tarih")).toBeInTheDocument();
    expect(screen.getByText(/Haftada/)).toHaveTextContent(
      "Haftada 6 iş günü · işçi histogramı kişi = a-s ÷ (6 gün × 9 sa)",
    );
    expect(within(saveBar()).getByText("Bütün değişiklikler kaydedildi · A-Blok Şantiyesi")).toBeInTheDocument();
    expect(within(saveBar()).getByRole("button", { name: "Kaydet" })).toBeDisabled();
  });

  it("tek toplu PUT: tam gövde, tatil/paçalda id YOK; sonra 'Kaydedildi' hâli", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderScreen();
    await waitForForm();

    const weekStart = screen.getByRole("group", { name: "Hafta başlangıç günü" });
    await user.click(within(weekStart).getByRole("button", { name: "Cum" }));
    const hours = screen.getByRole("textbox", { name: "Günlük standart saat" });
    await user.clear(hours);
    await user.type(hours, "8,5");
    const offDays = screen.getByRole("group", { name: "Çalışılmayan haftalık günler" });
    await user.click(within(offDays).getByRole("button", { name: "Cmt" }));

    await user.click(screen.getByRole("button", { name: "Tatil ekle" }));
    await user.type(screen.getByRole("textbox", { name: "Tatil tarihi 3" }), "29.10.2026");
    await user.type(screen.getByRole("textbox", { name: "Tatil açıklaması 3" }), "Cumhuriyet Bayramı");
    await user.click(screen.getByRole("button", { name: "Tatili sil: Zafer Bayramı" }));

    const tolerance = screen.getByRole("textbox", { name: "Durum toleransı (puan)" });
    await user.clear(tolerance);
    await user.type(tolerance, "3");

    expect(
      within(saveBar()).getByText("3 bölümde kaydedilmemiş değişiklik var · A-Blok Şantiyesi"),
    ).toBeInTheDocument();
    await user.click(within(saveBar()).getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0]).toEqual({
      week_start_dow: 4,
      weekly_off_days: [5, 6],
      standard_daily_hours: "8.5",
      tolerance_points: "3",
      pf_bands: {
        daily: { red_below: "0.95", green_from: "0.95", high_above: "1.05" },
        weekly: { red_below: "0.95", green_from: "1.00" },
      },
      holidays: [
        { date_from: "2026-05-26", date_to: "2026-05-30", note: "Kurban Bayramı" },
        { date_from: "2026-10-29", date_to: "2026-10-29", note: "Cumhuriyet Bayramı" },
      ],
      composite_metrics: [
        {
          name: "1 m³ beton başına toplam betonarme a-s",
          measure: "spent",
          numerator_item_ids: ["i-kalip", "i-beton"],
          denominator_item_id: "i-beton",
        },
      ],
    });
    expect(
      await within(saveBar()).findByText("Kaydedildi · A-Blok Şantiyesi · denetim günlüğüne yazıldı"),
    ).toBeInTheDocument();
  });

  it("Vazgeç taslağı sunucu değerine döndürür", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderScreen();
    await waitForForm();

    const hours = screen.getByRole("textbox", { name: "Günlük standart saat" });
    await user.clear(hours);
    await user.type(hours, "7");
    await user.click(within(saveBar()).getByRole("button", { name: "Vazgeç" }));
    expect(hours).toHaveValue("9");
    expect(within(saveBar()).getByText("Bütün değişiklikler kaydedildi · A-Blok Şantiyesi")).toBeInTheDocument();
  });

  // SEKME-F1.3-FIX O7 · `PlanningSettingsForm`in `useUnsavedChanges`
  // bağlanması için davranış bekçisi — üst çubuğun GERÇEKTEN okuduğu merkezi
  // kayıt (`unsavedRegistry`) doğrudan doğrulanır (yalnız "Kaydet" düğmesinin
  // aktifliği DEĞİL — o düğme kopsa bile ayrı bir bağ olduğundan görünmez
  // kalabilirdi).
  it("yükle, dokunma → kayıt temiz; alan değiştir → kirli; kaydetme başarılı → tekrar temiz", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderScreen();
    await waitForForm();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    const hours = screen.getByRole("textbox", { name: "Günlük standart saat" });
    await user.clear(hours);
    await user.type(hours, "8");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    await user.click(within(saveBar()).getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(putBodies).toHaveLength(1));
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
  });

  it("kayıt hatasında ortak hata kartı backend mesajıyla çıkar, taslak kalır (K24)", async () => {
    const user = userEvent.setup();
    stubBackend({
      save: () => json({ detail: "Tatil aralıkları çakışıyor" }, 422),
    });
    renderScreen();
    await waitForForm();

    const hours = screen.getByRole("textbox", { name: "Günlük standart saat" });
    await user.clear(hours);
    await user.type(hours, "8");
    await user.click(within(saveBar()).getByRole("button", { name: "Kaydet" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Ayarlar kaydedilemedi")).toBeInTheDocument();
    expect(within(alert).getByText("Tatil aralıkları çakışıyor")).toBeInTheDocument();
    expect(hours).toHaveValue("8");
  });
});

describe("PlanningSettingsScreen · doğrulama", () => {
  it("haftalık yeşil < kırmızı: hata metni, önizleme —, Kaydet kapalı", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderScreen();
    await waitForForm();

    const weeklyGreen = screen.getByRole("textbox", { name: "Haftalık yeşil eşiği" });
    await user.clear(weeklyGreen);
    await user.type(weeklyGreen, "0,90");

    expect(
      screen.getByText("Sarı eşiği (yeşil alt sınırı) kırmızı sınırından küçük olamaz."),
    ).toBeInTheDocument();
    expect(
      within(saveBar()).getByText("Hatalı alan var · kaydetmeden önce düzeltin"),
    ).toBeInTheDocument();
    expect(within(saveBar()).getByRole("button", { name: "Kaydet" })).toBeDisabled();
    expect(within(saveBar()).getByRole("button", { name: "Vazgeç" })).toBeEnabled();
  });

  it("günlük şüpheli yüksek < yeşil: üçüncü eşik hata metni (M8 f)", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderScreen();
    await waitForForm();

    const high = screen.getByRole("textbox", { name: "Günlük şüpheli yüksek eşiği" });
    await user.clear(high);
    await user.type(high, "0,93");
    expect(
      screen.getByText("Şüpheli yüksek eşiği yeşil alt sınırından küçük olamaz."),
    ).toBeInTheDocument();
    expect(within(saveBar()).getByRole("button", { name: "Kaydet" })).toBeDisabled();
  });

  it("günlük saat 16'yı aşarsa ipucu hataya döner (Ek:494)", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderScreen();
    await waitForForm();

    const hours = screen.getByRole("textbox", { name: "Günlük standart saat" });
    await user.clear(hours);
    await user.type(hours, "17");
    expect(screen.getByText("1–16 arası bir değer girin")).toBeInTheDocument();
    expect(within(saveBar()).getByRole("button", { name: "Kaydet" })).toBeDisabled();
  });

  it("bütün günler çalışılmayan olursa kaydetme kapanır", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderScreen();
    await waitForForm();

    const offDays = screen.getByRole("group", { name: "Çalışılmayan haftalık günler" });
    for (const day of ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"]) {
      await user.click(within(offDays).getByRole("button", { name: day }));
    }
    expect(screen.getByText("En az bir çalışma günü olmalı")).toBeInTheDocument();
    expect(within(saveBar()).getByRole("button", { name: "Kaydet" })).toBeDisabled();
  });
});

describe("PlanningSettingsScreen · önizleme (pfBand / varianceStatus)", () => {
  it("günlük varsayılanda örnek PF 1,04 Yeşil; yeşil 1,05'e çıkınca Sarı olur", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderScreen();
    await waitForForm();

    const daily = screen.getByRole("group", { name: "Günlük PF bandı" });
    expect(within(daily).getByTestId("pf-preview-badge")).toHaveTextContent("Yeşil");

    const green = screen.getByRole("textbox", { name: "Günlük yeşil eşiği" });
    await user.clear(green);
    await user.type(green, "1,05");
    expect(within(daily).getByTestId("pf-preview-badge")).toHaveTextContent("Sarı");
    expect(within(daily).getByText("sarı arada")).toBeInTheDocument();
  });

  it("tolerans önizlemesi: −2,6 örneği 2,0'da Geride, 3'te Normal", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderScreen();
    await waitForForm();

    expect(screen.getByTestId("tolerance-preview")).toHaveTextContent("Geride");
    const tolerance = screen.getByRole("textbox", { name: "Durum toleransı (puan)" });
    await user.clear(tolerance);
    await user.type(tolerance, "3");
    expect(screen.getByTestId("tolerance-preview")).toHaveTextContent("Normal");
    expect(screen.getByText("Normal · −3,0 … +3,0")).toBeInTheDocument();
  });
});

describe("PlanningSettingsScreen · paçal metrikler (K25)", () => {
  it("tanımı BOQ adlarıyla basar; düzenlenen metrik PUT gövdesine girer", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderScreen();
    await waitForForm();

    expect(await screen.findByText("(Kalıp + Beton harcanan) ÷ Beton m³")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Düzenle: 1 m³ beton başına toplam betonarme a-s" }));

    const editor = screen.getByRole("group", { name: "Paçal metrik düzenleyici" });
    const numerator = within(editor).getByRole("group", { name: "Pay · iş tipleri toplamı" });
    await user.click(within(numerator).getByRole("button", { name: "Demir" }));
    const measure = within(editor).getByRole("group", { name: "Pay ölçüsü" });
    await user.click(within(measure).getByRole("button", { name: "Kazanılmış a-s" }));
    await user.click(within(editor).getByRole("button", { name: "Metriği uygula" }));

    expect(screen.getByText("(Kalıp + Beton + Demir kazanılmış) ÷ Beton m³")).toBeInTheDocument();
    await user.click(within(saveBar()).getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0].composite_metrics).toEqual([
      {
        name: "1 m³ beton başına toplam betonarme a-s",
        measure: "earned",
        numerator_item_ids: ["i-kalip", "i-beton", "i-demir"],
        denominator_item_id: "i-beton",
      },
    ]);
  });

  it("yeni metrik pay ve payda seçilmeden uygulanamaz", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderScreen();
    await waitForForm();

    await user.click(screen.getByRole("button", { name: "Yeni paçal metrik" }));
    const editor = screen.getByRole("group", { name: "Paçal metrik düzenleyici" });
    const apply = within(editor).getByRole("button", { name: "Metriği uygula" });
    expect(apply).toBeDisabled();

    await user.type(within(editor).getByRole("textbox", { name: "Ad" }), "1 m² kalıp başına a-s");
    await user.click(
      within(within(editor).getByRole("group", { name: "Pay · iş tipleri toplamı" })).getByRole(
        "button",
        { name: "Kalıp" },
      ),
    );
    expect(apply).toBeDisabled();
    await user.click(
      within(
        within(editor).getByRole("group", { name: "Payda · tek iş tipinin miktarı" }),
      ).getByRole("button", { name: "Kalıp (m²)" }),
    );
    await user.click(apply);
    expect(screen.getByText("1 m² kalıp başına a-s")).toBeInTheDocument();
    expect(within(saveBar()).getByText(/1 bölümde kaydedilmemiş değişiklik var/)).toBeInTheDocument();
  });
});

describe("PlanningSettingsScreen · paçal metrik silme (CEO kararı b)", () => {
  const METRIC = "1 m³ beton başına toplam betonarme a-s";

  it("Sil metriği taslaktan çıkarır, kirli sayacı artırır; PUT gövdesinde metrik YOK", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderScreen();
    await waitForForm();

    await user.click(screen.getByRole("button", { name: `Paçal metriği sil: ${METRIC}` }));
    expect(screen.queryByText(METRIC)).not.toBeInTheDocument();
    expect(putBodies).toHaveLength(0);
    expect(
      within(saveBar()).getByText("1 bölümde kaydedilmemiş değişiklik var · A-Blok Şantiyesi"),
    ).toBeInTheDocument();

    await user.click(within(saveBar()).getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0].composite_metrics).toEqual([]);
  });

  it("düzenleyicide açık olan metrik silinince düzenleyici kapanır", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderScreen();
    await waitForForm();

    await user.click(screen.getByRole("button", { name: `Düzenle: ${METRIC}` }));
    expect(screen.getByRole("group", { name: "Paçal metrik düzenleyici" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `Paçal metriği sil: ${METRIC}` }));
    expect(screen.queryByRole("group", { name: "Paçal metrik düzenleyici" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yeni paçal metrik" })).toBeInTheDocument();
  });

  it("salt okunurda Sil düğmesi basılmaz", async () => {
    setPermission("view");
    stubBackend();
    renderScreen();
    await waitForForm();
    expect(await screen.findByText(METRIC)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `Paçal metriği sil: ${METRIC}` }),
    ).not.toBeInTheDocument();
  });
});

describe("PlanningSettingsScreen · salt okunur (B1-8 · F0-8)", () => {
  it("view yetkisinde alanlar kapalı, Kaydet çubuğu yok, şantiye seçici açık", async () => {
    setPermission("view");
    stubBackend();
    renderScreen();
    await waitForForm();

    expect(screen.getByRole("note")).toHaveTextContent(
      "Salt okunur. Planlama ayarlarını değiştirmek için Planlama (earned_value) modülünde taslak yetkisi gerekir. Şantiye seçici açık kalır.",
    );
    expect(screen.getByRole("textbox", { name: "Günlük standart saat" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Günlük yeşil eşiği" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tatil ekle" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Yeni paçal metrik" })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "Kaydetme çubuğu" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Şantiye" })).toBeEnabled();
  });

  it("tamamlanmış şantiye yetkiden bağımsız salt okunurdur", async () => {
    searchParams = new URLSearchParams("site=s-b");
    setPermission("admin");
    stubBackend();
    renderScreen();
    await waitForForm();

    expect(screen.getByRole("note")).toHaveTextContent(
      "Salt okunur. Tamamlanmış şantiye · ayarlar salt okunur. Şantiye seçici açık kalır.",
    );
    expect(screen.getByRole("textbox", { name: "Durum toleransı (puan)" })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "Kaydetme çubuğu" })).not.toBeInTheDocument();
  });

  it("draft yetkisinde salt okunur şeridi yoktur", async () => {
    stubBackend();
    renderScreen();
    await waitForForm();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Günlük standart saat" })).toBeEnabled();
  });
});

// IZN-F5b madde 9 · ayar yazma (PUT .../earned-value/settings) = YALNIZ ayarlar.planlama Düzenler (EV_SETTINGS_EDIT);
// bütçe sayfaları (adam-saat bütçesi) ayar ekranını yazılabilir YAPMAZ.
describe("PlanningSettingsScreen · yazma kapısı EV_SETTINGS_EDIT (IZN-F5b)", () => {
  function setPages(me: ReturnType<typeof meFixture>) {
    vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as never);
  }

  it("ayarlar.planlama Düzenler → alanlar yazılabilir (modül earned_value view olsa da)", async () => {
    setPages(meFixture({ pages: { "ayarlar.planlama": pageGrant("edit") }, permissions: { earned_value: "view" } }));
    stubBackend();
    renderScreen();
    await waitForForm();
    expect(screen.getByRole("textbox", { name: "Günlük standart saat" })).toBeEnabled();
  });

  it("yalnız adam-saat bütçesi Düzenler (modül earned_value view) → ayar alanları salt okunur", async () => {
    setPages(meFixture({ pages: { "planlama.adam_saat_butcesi": pageGrant("edit") }, permissions: { earned_value: "view" } }));
    stubBackend();
    renderScreen();
    await waitForForm();
    expect(screen.getByRole("textbox", { name: "Günlük standart saat" })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "Kaydetme çubuğu" })).not.toBeInTheDocument();
  });
});
