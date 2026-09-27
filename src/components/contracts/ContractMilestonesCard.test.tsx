import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PROJECT_QUERY_KEY } from "@/lib/api/hooks/useProjects";
import {
  PROJECT_TIMELINE_QUERY_KEY,
  type ProjectTimelineResponse,
  type TimelineProject,
} from "@/lib/api/hooks/useProjectTimeline";

import { ContractMilestonesCard } from "./ContractMilestonesCard";

/**
 * F-MILESTONE · E14 99-123 kartının bekçileri.
 *
 * 🔴 FİKSTÜR ÜRÜNÜN GERÇEK ŞEKLİNDEN: `e2e/mock-backend.ts` tohumunun birebir
 * kopyası (sec-1 aktif + iki milestone · sec-2 tamamlanmış + bir milestone ·
 * sec-3 tarihsiz + milestone'suz) + ikinci bir proje.
 */
const SERVER_TODAY = "2026-07-17";

const P1: TimelineProject = {
  id: "p-1",
  code: "PRJ-1",
  name: "Kule A",
  status: "active",
  start_date: "2025-03-01",
  end_date: "2026-12-01",
  contract_amount: "11200000",
  sections: [
    {
      id: "sec-1",
      name: "Kat 6–10 Kaba İnşaat",
      status: "active",
      start_date: "2026-01-01",
      end_date: "2026-09-30",
      sort_order: 0,
      depends_on_section_id: "sec-2",
      milestones: [
        { id: "ms-2", title: "Kaba inşaat teslim", milestone_date: "2026-09-30" },
        { id: "ms-1", title: "Kat 8 döşeme tamamlandı", milestone_date: "2026-05-15" },
      ],
    },
    {
      id: "sec-2",
      name: "Zemin Kat Kaba İnşaat",
      status: "completed",
      start_date: "2025-03-01",
      end_date: "2025-12-01",
      sort_order: 1,
      depends_on_section_id: null,
      milestones: [{ id: "ms-3", title: "Zemin kat teslim", milestone_date: "2025-12-01" }],
    },
    {
      id: "sec-3",
      name: "Peyzaj Düzenlemesi (Taslak)",
      status: "on_hold",
      start_date: null,
      end_date: null,
      sort_order: 2,
      depends_on_section_id: null,
      milestones: [],
    },
  ],
};

const P2: TimelineProject = {
  id: "p-2",
  code: "PRJ-2",
  name: "Villa B",
  status: "active",
  start_date: "2025-01-01",
  end_date: "2026-06-01",
  contract_amount: null,
  sections: [
    {
      id: "sec-9",
      name: "Villa B temel",
      status: "planned",
      start_date: "2026-02-01",
      end_date: "2026-04-01",
      sort_order: 0,
      depends_on_section_id: null,
      milestones: [
        { id: "ms-9", title: "BAŞKA PROJENİN MILESTONE'U", milestone_date: "2026-03-01" },
      ],
    },
  ],
};

const TIMELINE: ProjectTimelineResponse = { today: SERVER_TODAY, items: [P1, P2] };

/**
 * 🔴 M5'in ÖLÇÜM ARACI (`PageBreadcrumb.test.tsx` kanonik deseni). `fetch`i
 * mock'lamak değil, ÇAĞRILDIĞINI SAYMAK önemlidir: mock'lanmış ama çağrılmış
 * bir fetch de "ikinci istek"tir.
 */
let fetchSpy: ReturnType<typeof vi.fn>;

/**
 * Ekranın/Gantt'ın önbelleğe yazdığı hâl. Anahtarlar hook modüllerinden İTHAL
 * EDİLİR, elle yazılmaz — dize kopyalansaydı anahtar bir gün değiştiğinde bu
 * bekçi sessizce başka bir şeyi ölçerdi.
 *
 * `staleTime: Infinity`: karta ait sorgunun `queryFn`i (kırıntının aksine)
 * DOLUDUR; ölçülen şey fetch'in bastırılması değil ANAHTAR ÖZDEŞLİĞİdir. Kart
 * kendi anahtarını uydurursa tohum tutmaz → hem veri basılmaz hem fetch atılır.
 */
function seededClient(timeline: ProjectTimelineResponse | null = TIMELINE): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData([PROJECT_QUERY_KEY, "p-1"], { id: "p-1", name: "Kule A" });
  // 🔴 "Tohumlama" `null`la kapatılır, `undefined`la DEĞİL: `undefined` JS'te
  // VARSAYILAN PARAMETREYİ tetikler. İlk yazımda `seededClient(null)`
  // sessizce TAM tohumu kuruyordu ve "yükleme hâli" testi aslında YÜKLENMİŞ
  // hâli ölçüyordu (ölçüldü, kırmızıydı).
  if (timeline !== null) client.setQueryData([PROJECT_TIMELINE_QUERY_KEY], timeline);
  return client;
}

function renderCard(client: QueryClient = seededClient(), projectId = "p-1") {
  return render(
    <QueryClientProvider client={client}>
      <ContractMilestonesCard projectId={projectId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchSpy = vi.fn(() => Promise.reject(new Error("kart ağa ÇIKMAMALI")));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ─── M1 · küme = projenin TÜM bölümleri ─────────────────────────────────── */

describe("Milestone Takvimi — küme (kullanıcı kararı 2026-08-29)", () => {
  it("projenin İKİ ayrı bölümünün milestone'larını da basar", () => {
    renderCard();

    const rows = screen.getAllByTestId("ecd-ms-row");
    expect(rows).toHaveLength(3);
    expect(screen.getAllByTestId("ecd-ms-group")).toHaveLength(2);
    expect(
      screen.getAllByTestId("ecd-ms-title").map((node) => node.textContent),
    ).toEqual(["Zemin kat teslim", "Kat 8 döşeme tamamlandı", "Kaba inşaat teslim"]);
  });

  it("BAŞKA projenin milestone'ı BASILMAZ (pozitif kontrol)", () => {
    renderCard();
    expect(screen.queryByText("BAŞKA PROJENİN MILESTONE'U")).not.toBeInTheDocument();
    expect(screen.queryByText("Villa B temel")).not.toBeInTheDocument();
  });

  it("milestone'suz bölüm başlığı basılmaz", () => {
    renderCard();
    expect(screen.queryByText("Peyzaj Düzenlemesi (Taslak)")).not.toBeInTheDocument();
  });
});

/* ─── M2 · durum SUNUCU damgasından türer ────────────────────────────────── */

describe("durum türevi — `today` SUNUCUDAN gelir", () => {
  /**
   * 🔴 M2'nin ASIL ÖLÇÜM ARACI ve saate bağlı OLMAYAN hâli.
   *
   * Sunucu damgası ESKİ (2020), milestone ise istemcinin gerçek "şimdi"sinden
   * KESİN OLARAK GEÇMİŞTE (2024). `new Date()`e kayan bir mutant bunu ZORUNLU
   * olarak "Tamamlandı" basar — bugün de, beş yıl sonra da. Sunucunun damgasını
   * okuyan doğru kod "Planlandı" basar.
   *
   * Sahte saat KURULMAZ: `vi.setSystemTime` bir gün kaldırılırsa bekçi sessizce
   * kör kalırdı; bu kurgu ölçüm gücünü GERÇEK saatten bağımsız taşır.
   */
  it("🔴 sunucu damgası ESKİYSE, istemcinin geçmişinde kalan milestone yine 'Planlandı'dır", () => {
    const stale: ProjectTimelineResponse = {
      today: "2020-01-01",
      items: [
        {
          ...P1,
          sections: [
            {
              ...P1.sections[0]!,
              milestones: [{ id: "ms-p", title: "Eski damga", milestone_date: "2024-06-01" }],
            },
          ],
        },
      ],
    };
    renderCard(seededClient(stale));

    expect(screen.getByTestId("ecd-ms-meta")).toHaveTextContent("1 Haziran 2024 · Planlandı");
  });

  it("her satırın durumu ve tam tarihi sunucunun damgasına göre basılır", () => {
    renderCard();

    const metas = screen.getAllByTestId("ecd-ms-meta").map((node) => node.textContent);
    expect(metas).toEqual([
      "1 Aralık 2025 · Tamamlandı",
      "15 Mayıs 2026 · Tamamlandı",
      "30 Eylül 2026 · Planlandı",
    ]);
  });

  it("SINIR GÜNÜ: `milestone_date == today` olan satır 'Planlandı' tarafındadır", () => {
    const boundary: ProjectTimelineResponse = {
      today: SERVER_TODAY,
      items: [
        {
          ...P1,
          sections: [
            {
              ...P1.sections[0]!,
              milestones: [{ id: "ms-b", title: "Bugünkü teslim", milestone_date: SERVER_TODAY }],
            },
          ],
        },
      ],
    };
    renderCard(seededClient(boundary));

    expect(screen.getByTestId("ecd-ms-meta")).toHaveTextContent("17 Temmuz 2026 · Planlandı");
  });

  it("üçüncü durum ('Devam Ediyor') BÖLÜMÜN kendi enum'undan gelir", () => {
    renderCard();

    const metas = screen.getAllByTestId("ecd-ms-section-meta").map((node) => node.textContent);
    expect(metas).toEqual(["Mar–Ara 2025 · Tamamlandı", "Oca–Eyl 2026 · Devam Ediyor"]);
  });

  it("tarihi olmayan bölüm için UYDURMA aralık basılmaz, yalnız durum yazılır", () => {
    const undated: ProjectTimelineResponse = {
      today: SERVER_TODAY,
      items: [
        {
          ...P1,
          sections: [
            {
              ...P1.sections[2]!,
              milestones: [{ id: "ms-u", title: "Peyzaj teslim", milestone_date: "2026-11-01" }],
            },
          ],
        },
      ],
    };
    renderCard(seededClient(undated));

    expect(screen.getByTestId("ecd-ms-section-meta")).toHaveTextContent("Beklemede");
    expect(screen.getByTestId("ecd-ms-section-meta").textContent).not.toContain("·");
  });
});

/* ─── M3 · uydurma veri YOK ──────────────────────────────────────────────── */

describe("uydurma veri yasağı (mockup 104-120)", () => {
  const MOCKUP_FAKES = [
    "Temel ve Bodrum Katlar",
    "Kat 1–5 Kaba İnşaat",
    "İnce İşler ve Cephe",
    "Teslimat & Kesin Kabul",
    "Nis–Tem 2025",
  ];

  it("mockup'ın sahte milestone metinlerinin HİÇBİRİ basılmaz", () => {
    renderCard();
    for (const fake of MOCKUP_FAKES) {
      expect(screen.queryByText(fake)).not.toBeInTheDocument();
    }
  });

  it("gerçek veri gelince YÜKLEME İSKELETİ kalkar (pozitif kontrol)", () => {
    const { container } = renderCard();
    expect(container.querySelector(".ecd-ms__skeleton")).toBeNull();
    expect(screen.queryByTestId("ecd-milestones-loading")).not.toBeInTheDocument();
    expect(screen.getByTestId("ecd-milestones")).toBeInTheDocument();
  });

  it("veri YOKKEN iskelet basılır ve `aria-hidden`dır (metin uydurulmaz)", () => {
    // 🔴 `fetch` REDDETMEZ, ASKIDA KALIR: reddeden bir sorgu `act` içinde
    // anında hata dalına geçer ve bu test yükleme hâlini HİÇ göremezdi
    // (ilk yazımda tam olarak öyle oldu — ölçüldü, kırmızıydı).
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const { container } = renderCard(seededClient(null));

    const skeleton = container.querySelector(".ecd-ms__skeleton");
    expect(skeleton).not.toBeNull();
    expect(skeleton?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("ecd-milestones-loading")).toHaveTextContent("Yükleniyor…");
    expect(screen.queryByTestId("ecd-milestones")).not.toBeInTheDocument();
  });
});

/* ─── M4 · boş hâl ≠ kapsam dışı hâl ─────────────────────────────────────── */

describe("iki AYRI boş cümle", () => {
  it("proje takvimde var ama milestone yoksa: 'kayıtlı milestone yok'", () => {
    const bare: ProjectTimelineResponse = {
      today: SERVER_TODAY,
      items: [{ ...P1, sections: [] }],
    };
    renderCard(seededClient(bare));

    expect(screen.getByTestId("ecd-milestones-empty")).toHaveTextContent(
      "Bu projede kayıtlı milestone yok.",
    );
    expect(screen.queryByTestId("ecd-milestones-scope")).not.toBeInTheDocument();
  });

  it("proje takvimde HİÇ YOKSA: 'kapsamınızda görünmüyor' — AYRI cümle", () => {
    const other: ProjectTimelineResponse = { today: SERVER_TODAY, items: [P2] };
    renderCard(seededClient(other));

    expect(screen.getByTestId("ecd-milestones-scope")).toHaveTextContent(
      "Bu projenin takvimi kapsamınızda görünmüyor.",
    );
    expect(screen.queryByTestId("ecd-milestones-empty")).not.toBeInTheDocument();
  });

  it("iki cümle AYNI METNE ÇÖKMEZ", () => {
    const bare: ProjectTimelineResponse = { today: SERVER_TODAY, items: [{ ...P1, sections: [] }] };
    const { unmount } = renderCard(seededClient(bare));
    const emptyText = screen.getByTestId("ecd-milestones-empty").textContent;
    unmount();

    renderCard(seededClient({ today: SERVER_TODAY, items: [P2] }));
    const scopeText = screen.getByTestId("ecd-milestones-scope").textContent;

    expect(emptyText).not.toBe(scopeText);
  });
});

/* ─── M5 · ikinci istek YOK ──────────────────────────────────────────────── */

describe("önbellek paylaşımı — ikinci istek yok", () => {
  it("Gantt'ın ısıttığı önbellekten okur ve HİÇBİR ağ isteği atmaz", async () => {
    renderCard();

    expect(screen.getAllByTestId("ecd-ms-row")).toHaveLength(3);
    // Mutasyon: karta kendi `useQuery`sini (kendi anahtarını) ver → kırmızı.
    await Promise.resolve();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("anahtar ÜST GÖRÜNÜMÜNKÜYLE aynı: proje adı sorgusu da yeniden açılmaz", async () => {
    const client = seededClient();
    renderCard(client);

    await Promise.resolve();
    expect(client.getQueryCache().findAll().map((query) => query.queryHash).sort()).toEqual(
      [
        JSON.stringify([PROJECT_QUERY_KEY, "p-1"]),
        JSON.stringify([PROJECT_TIMELINE_QUERY_KEY]),
      ].sort(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/* ─── hata dalı ──────────────────────────────────────────────────────────── */

describe("hata dalı", () => {
  it("takvim yüklenemezse iskelette DONMAZ, gerekçeli mesaj basar", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData([PROJECT_QUERY_KEY, "p-1"], { id: "p-1", name: "Kule A" });
    renderCard(client);

    // Tohumsuz takvim sorgusu `queryFn`e düşer, `fetch` reddeder.
    await waitFor(() =>
      expect(screen.getByTestId("ecd-milestones-error")).toHaveTextContent(
        "Milestone takvimi yüklenemedi",
      ),
    );
  });

  /**
   * 🔴 403 GENEL HATAYA ÇÖKMEZ. Bu hâl ULAŞILABİLİR: ekran `contracts:view`,
   * takvim `projects:view` ister (İKİ FARKLI MODÜL). "Yüklenemedi" demek
   * geçici bir arıza vaat ederdi. Mutasyon: 403'ü hata dalına indir → kırmızı.
   */
  it("403: yetki sınırı SÖYLENİR, 'yüklenemedi' DENMEZ", async () => {
    // 🔴 Hata NESNESİ elle kurulmaz: `fetch` GERÇEK bir 403 yanıtı döndürür ve
    // `BackendError`ı ürünün kendi `unwrap`ı üretir. Bekçi böylece ölçtüğü yolu
    // kendisi kurmaz.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: "forbidden" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData([PROJECT_QUERY_KEY, "p-1"], { id: "p-1", name: "Kule A" });
    renderCard(client);

    await waitFor(() =>
      expect(screen.getByTestId("ecd-milestones-forbidden")).toHaveTextContent(
        "Milestone takvimini görme yetkiniz yok.",
      ),
    );
    expect(screen.queryByTestId("ecd-milestones-error")).not.toBeInTheDocument();
  });

  it("403 OLMAYAN hata yine 'yüklenemedi'dir (pozitif kontrol)", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData([PROJECT_QUERY_KEY, "p-1"], { id: "p-1", name: "Kule A" });
    renderCard(client);

    await waitFor(() =>
      expect(screen.getByTestId("ecd-milestones-error")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("ecd-milestones-forbidden")).not.toBeInTheDocument();
  });

  it("başlık HER hâlde durur (bölüm SİLİNMEZ kuralı)", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderCard(seededClient(null));
    const card = screen.getByRole("region", { name: "Milestone Takvimi" });
    expect(within(card).getByRole("heading", { name: "Milestone Takvimi" })).toBeInTheDocument();
  });
});
