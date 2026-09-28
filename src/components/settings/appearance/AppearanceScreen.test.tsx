import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceScreen } from "./AppearanceScreen";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

const PREFERENCES = {
  theme: "light",
  locale: "tr",
  currency: "TRY",
  date_format: "DD.MM.YYYY",
  density: "normal",
  accent_color: "#2563eb",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubFetch(response: () => Response) {
  vi.stubGlobal("fetch", vi.fn(async () => response()));
}

function renderScreen() {
  return renderWithClient().result;
}

function renderWithClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <AppearanceScreen />
    </QueryClientProvider>,
  );
  return { client, result };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AppearanceScreen", () => {
  it("dil/para/tarih seciciierini Select primitive'i ile render eder", async () => {
    stubFetch(() => json(PREFERENCES));

    renderScreen();

    const locale = await screen.findByLabelText("Arayüz Dili");
    const currency = screen.getByLabelText("Para Birimi");
    const dateFormat = screen.getByLabelText("Tarih Formatı");

    for (const control of [locale, currency, dateFormat]) {
      expect(control.tagName).toBe("SELECT");
      // Primitive stili: ham <select> degil, token tabanli .select sinifi.
      expect(control.className).toContain("select");
      expect(control.parentElement?.className).toContain("select-wrap");
    }
  });

  it("secim degisikligini forma yansitir", async () => {
    stubFetch(() => json(PREFERENCES));

    renderScreen();

    const currency = await screen.findByLabelText("Para Birimi");
    expect(currency).toHaveValue("TRY");

    await userEvent.selectOptions(currency, "USD");

    await waitFor(() => expect(currency).toHaveValue("USD"));
  });

  // Kayıt 419/482 — vurgu rengi/yoğunluk seçimi kaydediliyor ama arayüze
  // HİÇBİR yerde uygulanmıyordu (CSS köprüsü yok); kullanıcı yanılmasın
  // diye durum artık açıkça yazılır.
  it("vurgu rengi ve yoğunluk kartlarında 'yakında' notu görünür (kayıt 419/482)", async () => {
    stubFetch(() => json(PREFERENCES));
    renderScreen();
    await screen.findByLabelText("Arayüz Dili");

    const notes = screen.getAllByText("Seçiminiz kaydedilir; arayüze yansıtılması yakında gelecek.");
    expect(notes).toHaveLength(2);
  });
});

describe("SEKME-F1.3b — kaydedilmemiş değişiklik kaydı", () => {
  it("yüklendi + dokunulmadı → false (GET henüz dönmeden de false — async taban)", async () => {
    stubFetch(() => json(PREFERENCES));
    renderScreen();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    await screen.findByLabelText("Arayüz Dili");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir seçim değişti → true", async () => {
    stubFetch(() => json(PREFERENCES));
    renderScreen();
    const currency = await screen.findByLabelText("Para Birimi");
    await userEvent.selectOptions(currency, "USD");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt (PUT sonrası `query.data` yenilenir) → false", async () => {
    // GET her zaman GÜNCEL server durumunu döner; PUT o durumu günceller —
    // `invalidateQueries` sonrası gerçek refetch akışını taklit eder.
    let server = { ...PREFERENCES };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const request = input as Request;
        if (request.method === "PUT") {
          const body = (await request.clone().json()) as Partial<typeof PREFERENCES>;
          server = { ...server, ...body };
          return json(server);
        }
        return json(server);
      }),
    );
    renderScreen();
    const currency = await screen.findByLabelText("Para Birimi");
    await userEvent.selectOptions(currency, "USD");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
  });
});

describe("AYR-F1 — sunucu verisi kirli formu ezmez ({...sunucu, ...draft})", () => {
  // GET her çağrıda `server`ın GÜNCEL hâlini döner; PUT onu günceller.
  function stubServer(initial: typeof PREFERENCES) {
    const state = { server: { ...initial } };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const request = input as Request;
        if (request.method === "PUT") {
          const body = (await request.clone().json()) as Partial<typeof PREFERENCES>;
          state.server = { ...state.server, ...body };
        }
        return json(state.server);
      }),
    );
    return state;
  }

  it("kirli form arkaplan refetch'inde EZİLMEZ; dirty true kalır", async () => {
    const state = stubServer(PREFERENCES);
    const { client } = renderWithClient();
    const currency = await screen.findByLabelText("Para Birimi");
    await userEvent.selectOptions(currency, "USD");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    // Sunucu başka alanı değiştirdi; yeni referansla gerçek refetch gelir.
    state.server = { ...state.server, locale: "en" };
    await client.invalidateQueries({ queryKey: ["preferences"] });
    await waitFor(() => expect(client.getQueryData(["preferences"])).toMatchObject({ locale: "en" }));

    expect(screen.getByLabelText("Para Birimi")).toHaveValue("USD");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("temiz formda sunucu verisi değişirse ekran yeni değeri gösterir", async () => {
    const state = stubServer(PREFERENCES);
    const { client } = renderWithClient();
    const currency = await screen.findByLabelText("Para Birimi");
    expect(currency).toHaveValue("TRY");

    state.server = { ...state.server, currency: "EUR" };
    await client.invalidateQueries({ queryKey: ["preferences"] });

    await waitFor(() => expect(screen.getByLabelText("Para Birimi")).toHaveValue("EUR"));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("başarılı kayıttan sonra form sunucuya hizalanır (dirty false, değer kalır)", async () => {
    stubServer(PREFERENCES);
    renderScreen();
    const currency = await screen.findByLabelText("Para Birimi");
    await userEvent.selectOptions(currency, "USD");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
    expect(screen.getByLabelText("Para Birimi")).toHaveValue("USD");
  });

  it("kayıttan sonra taslak bırakılır: sonraki sunucu değişimi ekrana yansır", async () => {
    const state = stubServer(PREFERENCES);
    const { client } = renderWithClient();
    await userEvent.selectOptions(await screen.findByLabelText("Para Birimi"), "USD");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));

    state.server = { ...state.server, currency: "EUR" };
    await client.invalidateQueries({ queryKey: ["preferences"] });

    await waitFor(() => expect(screen.getByLabelText("Para Birimi")).toHaveValue("EUR"));
  });

  // --- AYR-F1 ikinci tur: gerçek touched deseni (yalnız dokunulan alanlar) ---

  it("dokunulup eski değere dönülünce dirty false olur", async () => {
    stubServer(PREFERENCES);
    renderScreen();
    const currency = await screen.findByLabelText("Para Birimi");
    await userEvent.selectOptions(currency, "USD");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await userEvent.selectOptions(currency, "TRY");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("sunucu dokunulmayan alanı değiştirirse o alan yansır, dokunulan korunur", async () => {
    const state = stubServer(PREFERENCES);
    const { client } = renderWithClient();
    await userEvent.selectOptions(await screen.findByLabelText("Para Birimi"), "USD");

    state.server = { ...state.server, locale: "en" };
    await client.invalidateQueries({ queryKey: ["preferences"] });

    await waitFor(() => expect(screen.getByLabelText("Arayüz Dili")).toHaveValue("en"));
    expect(screen.getByLabelText("Para Birimi")).toHaveValue("USD");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("sunucu başka alanı değiştirdikten sonra dokunulan alan geri alınırsa sahte-kirli kalmaz", async () => {
    const state = stubServer(PREFERENCES);
    const { client } = renderWithClient();
    const currency = await screen.findByLabelText("Para Birimi");
    await userEvent.selectOptions(currency, "USD");

    state.server = { ...state.server, locale: "en" };
    await client.invalidateQueries({ queryKey: ["preferences"] });
    await waitFor(() => expect(screen.getByLabelText("Arayüz Dili")).toHaveValue("en"));

    await userEvent.selectOptions(screen.getByLabelText("Para Birimi"), "TRY");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("sunucu dokunulan alanı aynı değere getirirse dirty false olur", async () => {
    const state = stubServer(PREFERENCES);
    const { client } = renderWithClient();
    await userEvent.selectOptions(await screen.findByLabelText("Para Birimi"), "USD");

    state.server = { ...state.server, currency: "USD" };
    await client.invalidateQueries({ queryKey: ["preferences"] });

    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
  });

  it("kayıt gövdesi dokunulmayan alanlarda GÜNCEL sunucu değerini gönderir (lost update yok)", async () => {
    const state = stubServer(PREFERENCES);
    const { client } = renderWithClient();
    await userEvent.selectOptions(await screen.findByLabelText("Para Birimi"), "USD");
    state.server = { ...state.server, locale: "en" };
    await client.invalidateQueries({ queryKey: ["preferences"] });
    await waitFor(() => expect(screen.getByLabelText("Arayüz Dili")).toHaveValue("en"));

    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
    expect(state.server).toMatchObject({ currency: "USD", locale: "en" });
  });

  it("kayıt yoldayken değiştirilen alan başarıda taslakta KALIR", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let server = { ...PREFERENCES };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const request = input as Request;
        if (request.method === "PUT") {
          const body = (await request.clone().json()) as Partial<typeof PREFERENCES>;
          await gate;
          server = { ...server, ...body };
        }
        return json(server);
      }),
    );
    renderScreen();
    await userEvent.selectOptions(await screen.findByLabelText("Para Birimi"), "USD");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await userEvent.selectOptions(screen.getByLabelText("Arayüz Dili"), "en");
    release();

    await waitFor(() => expect(server.currency).toBe("USD"));
    await waitFor(() => expect(screen.getByLabelText("Para Birimi")).toHaveValue("USD"));
    expect(screen.getByLabelText("Arayüz Dili")).toHaveValue("en");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("kayıttan sonra refetch dönmeden ESKİ değer görünmez (setQueryData)", async () => {
    let server = { ...PREFERENCES };
    let putDone = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const request = input as Request;
        if (request.method === "PUT") {
          const body = (await request.clone().json()) as Partial<typeof PREFERENCES>;
          server = { ...server, ...body };
          putDone = true;
          return json(server);
        }
        if (putDone) await new Promise(() => {}); // refetch ASLA dönmez
        return json(server);
      }),
    );
    renderScreen();
    await userEvent.selectOptions(await screen.findByLabelText("Para Birimi"), "USD");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
    expect(screen.getByLabelText("Para Birimi")).toHaveValue("USD");
  });

  it("dokunulup geri alınan alan taslaktan çıkar: sonraki sunucu değişimi yansır", async () => {
    const state = stubServer(PREFERENCES);
    const { client } = renderWithClient();
    const currency = await screen.findByLabelText("Para Birimi");
    await userEvent.selectOptions(currency, "USD");
    await userEvent.selectOptions(currency, "TRY");

    state.server = { ...state.server, currency: "EUR" };
    await client.invalidateQueries({ queryKey: ["preferences"] });

    await waitFor(() => expect(screen.getByLabelText("Para Birimi")).toHaveValue("EUR"));
  });
});
