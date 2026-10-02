import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import type { OfferDetailRead, OfferRevisionRead } from "@/lib/api/hooks/useOffers";

import { OFFER_ID, makeDetail, makeRevision, makeRevisionSummary } from "./offer-detail-fixtures";
import { OfferDetailScreen, parseRevParam } from "./OfferDetailScreen";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

const perm = vi.hoisted(() => ({ levels: { contracts: "full", projects: "admin" } as Record<string, string | undefined> }));
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() },
}));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: (moduleKey: string) => {
    const level = perm.levels[moduleKey];
    return { level, canView: level !== "none", canWrite: true, canDelete: true };
  },
}));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const EMPLOYERS = {
  items: [
    { id: "emp-1", name: "Kuzey Gayrimenkul A.Ş.", tax_number: null, contact_person: null },
    { id: "emp-2", name: "Liman İşletmeleri A.Ş.", tax_number: null, contact_person: null },
  ],
  total: 2,
};

interface Backend {
  detail: OfferDetailRead;
  revisions: Record<number, OfferRevisionRead>;
}
let backend: Backend;

function ok(data: unknown, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) } as never;
}
function fail(status: number, detail: string) {
  return { data: undefined, error: { detail }, response: new Response(null, { status }) } as never;
}

/** Taslak teklif: Rev.0/1 gönderildi (eski), Rev.2 taslak (güncel). */
function draftBackend(): Backend {
  return {
    detail: makeDetail(),
    revisions: { 0: makeRevision({ rev_no: 0 }), 1: makeRevision({ rev_no: 1 }), 2: makeRevision({ rev_no: 2 }) },
  };
}

/** Tek revizyonlu teklif, son revizyon verilen durumda (gönderilmiş/kazanılmış/…). */
function singleRevisionBackend(status: OfferRevisionRead["status"], unpriced = 0): Backend {
  const base = makeRevision({ rev_no: 0 });
  const revision: OfferRevisionRead = {
    ...base,
    status,
    is_latest: true,
    is_editable: status === "draft",
    sent_at: status === "draft" ? null : "2026-09-12T12:00:00Z",
    totals: { ...base.totals, unpriced_count: unpriced },
  };
  const summary = makeDetail().revisions[1]!;
  return {
    detail: makeDetail({
      latest_rev_no: 0,
      status,
      revisions: [{ ...summary, rev_no: 0, status, unpriced_count: unpriced }],
      history: [{ at: "2026-09-12T09:00:00Z", kind: "opened", rev_no: 0, user_id: null, user_name: null }],
    }),
    revisions: { 0: revision },
  };
}

function mockBackend() {
  vi.mocked(backendClient.GET).mockImplementation((async (path: string, init?: { params?: { path?: { rev_no?: number } } }) => {
    if (path === "/offers/{offer_id}") return ok(backend.detail);
    if (path === "/offers/{offer_id}/revisions/{rev_no}") {
      const revision = backend.revisions[init?.params?.path?.rev_no ?? -1];
      return revision ? ok(revision) : fail(404, "Revizyon bulunamadı");
    }
    if (path === "/employers") return ok(EMPLOYERS);
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
}

let queryClient: QueryClient;
function renderScreen(revParam: string | null = null, renderItems?: Parameters<typeof OfferDetailScreen>[0]["renderItems"]) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OfferDetailScreen offerId={OFFER_ID} revParam={revParam} renderItems={renderItems} />
    </QueryClientProvider>,
  );
}

async function loaded() {
  await screen.findByRole("heading", { level: 1, name: /TKL-2026-0014/ });
  await screen.findByRole("option", { name: "Kuzey Gayrimenkul A.Ş." });
}

function callsTo(method: "POST" | "PATCH", path: string) {
  return vi.mocked(backendClient[method]).mock.calls.filter((call) => String(call[0]) === path);
}
function bodyOf(call: unknown[] | undefined): Record<string, unknown> | undefined {
  return (call?.[1] as { body?: Record<string, unknown> } | undefined)?.body;
}

const SEND = "/offers/{offer_id}/revisions/{rev_no}/send";
const WIN = "/offers/{offer_id}/revisions/{rev_no}/win";
const LOSE = "/offers/{offer_id}/revisions/{rev_no}/lose";
const WITHDRAW = "/offers/{offer_id}/revisions/{rev_no}/withdraw";
const NEW_REV = "/offers/{offer_id}/revisions";
const PATCH_OFFER = "/offers/{offer_id}";
const PATCH_REV = "/offers/{offer_id}/revisions/{rev_no}";

function button(name: string | RegExp) {
  return screen.getByRole("button", { name });
}

beforeEach(() => {
  vi.clearAllMocks();
  perm.levels = { contracts: "full", projects: "admin" };
  scope.value = { isRestricted: false, names: [] };
  backend = draftBackend();
  mockBackend();
});

describe("erişim (plan §2.3, SO-19)", () => {
  it("contracts:none → AccessDenied ve HİÇBİR uç çağrılmaz", async () => {
    perm.levels.contracts = "none";
    renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(vi.mocked(backendClient.GET)).not.toHaveBeenCalled();
  });

  it("SO-19: kısıtlı kullanıcı → detay GET 403 → AccessDenied", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(fail(403, "Yetkisiz işlem"));
    renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("SO-19: kaydederken PATCH 403 → AccessDenied", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockResolvedValue(fail(403, "Yetkisiz işlem"));
    renderScreen();
    await loaded();
    await user.type(screen.getByRole("textbox", { name: /İş adı/ }), " X");
    await user.click(button("Taslak Kaydet"));
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("görüntüleyici (contracts:view): tüm alanlar ve eylemler kapalı + salt okunur şeridi", async () => {
    perm.levels.contracts = "view";
    renderScreen();
    await loaded();
    expect(screen.getByRole("textbox", { name: /İş adı/ })).toBeDisabled();
    expect(button("Taslak Kaydet")).toBeDisabled();
    expect(button("Gönderildi İşaretle")).toBeDisabled();
    expect(screen.getByText("Görüntüleyici · yalnız okuma")).toBeInTheDocument();
  });
});

describe("taslak (son revizyon) — düzenleme + kirlilik", () => {
  it("künye, oranlar, koşullar sunucu değerleriyle dolu ve YAZILABİLİR; geçmiş + toplam basılır", async () => {
    renderScreen();
    await loaded();
    expect(screen.getByRole("textbox", { name: /İş adı/ })).toHaveValue("Güneşkent Konut Kompleksi");
    expect(screen.getByRole("textbox", { name: /İş adı/ })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: /Genel gider/ })).toHaveValue("12");
    expect(screen.getByRole("textbox", { name: /Ödeme koşulları/ })).toHaveValue("Aylık hakediş, 30 gün vadeli");
    expect(screen.getByRole("heading", { name: "Revizyon geçmişi" })).toBeInTheDocument();
    expect(screen.getByText("Toplam adam-saat")).toBeInTheDocument();
    expect(screen.getByText(/Fiyatı girilmemiş 2 kalem/)).toBeInTheDocument();
    expect(screen.queryByText(/salt okunur ·/)).not.toBeInTheDocument();
  });

  it("temiz taslak: Gönder AÇIK, Taslak Kaydet kapalı; Kazanıldı/Kaybedildi kapalı + gerekçe görünür", async () => {
    renderScreen();
    await loaded();
    expect(button("Gönderildi İşaretle")).toBeEnabled();
    expect(button("Taslak Kaydet")).toBeDisabled();
    expect(button("Kazanıldı…")).toBeDisabled();
    expect(button("Kaybedildi")).toBeDisabled();
    expect(button("Yeni Revizyon")).toBeDisabled();
    expect(screen.getByText("Önce gönderildi olarak işaretleyin")).toBeInTheDocument();
  });

  it("🔴 kirli formda Gönder KAPALI (gerekçe: önce taslağı kaydedin), Taslak Kaydet açık", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    await user.type(screen.getByRole("textbox", { name: /İş adı/ }), " 2");
    expect(button("Gönderildi İşaretle")).toBeDisabled();
    expect(button("Taslak Kaydet")).toBeEnabled();
    expect(screen.getByText("Önce taslağı kaydedin")).toBeInTheDocument();
  });

  it("değişikliği geri alınca (aynı değer) kirlilik kalkar", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    const title = screen.getByRole("textbox", { name: /İş adı/ });
    await user.type(title, "x");
    expect(button("Taslak Kaydet")).toBeEnabled();
    await user.type(title, "{Backspace}");
    expect(button("Taslak Kaydet")).toBeDisabled();
    expect(button("Gönderildi İşaretle")).toBeEnabled();
  });
});

describe("Taslak Kaydet — iki PATCH akışı (§3.3)", () => {
  it("yalnız iş adı → TEK PATCH /offers/{id} {title}; revizyon PATCH'i YOK; toast", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ ...backend.detail, updated_at: "2026-10-01T11:30:00Z" }));
    renderScreen();
    await loaded();
    await user.type(screen.getByRole("textbox", { name: /İş adı/ }), " II");
    await user.click(button("Taslak Kaydet"));
    await screen.findByText("Taslak kaydedildi · Rev.2 · 01.10.2026 14:30");
    expect(bodyOf(callsTo("PATCH", PATCH_OFFER)[0])).toEqual({ title: "Güneşkent Konut Kompleksi II" });
    expect(callsTo("PATCH", PATCH_REV)).toHaveLength(0);
  });

  it("yalnız GG → TEK PATCH revizyon {overhead_pct:'12.5'}; künye PATCH'i YOK", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok(backend.revisions[2]));
    renderScreen();
    await loaded();
    const gg = screen.getByRole("textbox", { name: /Genel gider/ });
    await user.clear(gg);
    await user.type(gg, "12,5");
    await user.click(button("Taslak Kaydet"));
    await waitFor(() => expect(callsTo("PATCH", PATCH_REV)).toHaveLength(1));
    expect(bodyOf(callsTo("PATCH", PATCH_REV)[0])).toEqual({ overhead_pct: "12.5" });
    expect(callsTo("PATCH", PATCH_OFFER)).toHaveLength(0);
  });

  it("ikisi de değişti → ÖNCE künye, SONRA revizyon; ilk hata durdurur (revizyon PATCH'i atılmaz) ve bant basar", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockResolvedValueOnce(fail(422, "Künye yalnız son revizyon taslak iken değiştirilebilir"));
    renderScreen();
    await loaded();
    await user.type(screen.getByRole("textbox", { name: /İş adı/ }), " II");
    const gg = screen.getByRole("textbox", { name: /Genel gider/ });
    await user.clear(gg);
    await user.type(gg, "13");
    await user.click(button("Taslak Kaydet"));
    expect(await screen.findByText("Künye yalnız son revizyon taslak iken değiştirilebilir")).toBeInTheDocument();
    expect(callsTo("PATCH", PATCH_OFFER)).toHaveLength(1);
    expect(callsTo("PATCH", PATCH_REV)).toHaveLength(0);
    expect(button("Taslak Kaydet")).toBeEnabled(); // kirli kaldı
  });

  it("künye kaydedildi, revizyon düştü → künye ARTIK temiz (yeniden gönderilmez), yalnız revizyon kirli kalır", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH)
      .mockImplementationOnce((async () => {
        backend.detail = { ...backend.detail, title: "Güneşkent Konut Kompleksi II" };
        return ok(backend.detail);
      }) as never)
      .mockResolvedValueOnce(fail(422, "Fiyat farkı «TÜİK endeksli» iken endeks türü zorunludur"))
      .mockResolvedValue(ok(backend.revisions[2]));
    renderScreen();
    await loaded();
    await user.type(screen.getByRole("textbox", { name: /İş adı/ }), " II");
    const gg = screen.getByRole("textbox", { name: /Genel gider/ });
    await user.clear(gg);
    await user.type(gg, "13");
    await user.click(button("Taslak Kaydet"));
    expect(await screen.findByText("Fiyat farkı «TÜİK endeksli» iken endeks türü zorunludur")).toBeInTheDocument();
    await user.click(button("Taslak Kaydet"));
    await waitFor(() => expect(callsTo("PATCH", PATCH_REV)).toHaveLength(2));
    expect(callsTo("PATCH", PATCH_OFFER)).toHaveLength(1); // künye ikinci kez GÖNDERİLMEDİ
  });

  it("doğrulama hatası: istek ATILMAZ; alan satır hatası + odak", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    await user.clear(screen.getByRole("textbox", { name: /İş adı/ }));
    await user.click(button("Taslak Kaydet"));
    expect(await screen.findByText("İş adı zorunlu")).toBeInTheDocument();
    expect(vi.mocked(backendClient.PATCH)).not.toHaveBeenCalled();
  });
});

describe("TKL-F3.6.1 madde 2 — kirli formda kapanış eylemi / canEdit düşünce düzenleme", () => {
  it("🔴 kirli formda (GG 12→13) 'Vazgeçildi…' KAPALI ve gerekçe 'Önce taslağı kaydedin'", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    const gg = screen.getByRole("textbox", { name: /Genel gider/ });
    await user.clear(gg);
    await user.type(gg, "13");
    expect(button("Vazgeçildi…")).toBeDisabled();
    expect(button("Vazgeçildi…")).toHaveAttribute("title", "Önce taslağı kaydedin");
  });

  it("🔴 başka yoldan canEdit düşerse (409 → revizyon artık gönderilmiş) alan SUNUCU değerine (12) döner, kayıt temiz, Taslak Kaydet kapalı", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockImplementation((async () => {
      // Başkası revizyonu gönderdi: sunucu artık gönderilmiş; kayıt 409 döner, tazeleme yeni durumu getirir.
      backend.revisions[2] = makeRevision({ rev_no: 2, status: "sent", is_editable: false, sent_at: "2026-09-29T09:00:00Z" });
      backend.detail = makeDetail({ status: "sent" });
      return fail(409, "Revizyon gönderilmiş durumda; bu işlem yapılamaz");
    }) as never);
    renderScreen();
    await loaded();
    const gg = screen.getByRole("textbox", { name: /Genel gider/ });
    await user.clear(gg);
    await user.type(gg, "13");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await user.click(button("Taslak Kaydet"));
    await waitFor(() => expect(screen.getByRole("textbox", { name: /Genel gider/ })).toBeDisabled());
    expect(screen.getByRole("textbox", { name: /Genel gider/ })).toHaveValue("12");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    expect(button("Taslak Kaydet")).toBeDisabled();

    // Düzenleme geri açılırsa (sunucu yeniden taslak) ESKİ kaydedilmemiş değer geri GELMEZ.
    backend.revisions[2] = makeRevision({ rev_no: 2 });
    backend.detail = makeDetail();
    await queryClient.invalidateQueries();
    await waitFor(() => expect(screen.getByRole("textbox", { name: /Genel gider/ })).toBeEnabled());
    expect(screen.getByRole("textbox", { name: /Genel gider/ })).toHaveValue("12");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});

describe("TKL-F3.6.1 madde 12 — 'Son kayıt' damgası", () => {
  it("🔴 kalem yazımı revizyonun updated_at'ini ilerletir ama teklif updated_at geride → İKİSİNİN en yenisi gösterilir", async () => {
    backend.detail = makeDetail({ updated_at: "2026-09-28T10:30:00Z" });
    backend.revisions[2] = makeRevision({ rev_no: 2, updated_at: "2026-09-29T14:05:00Z" });
    renderScreen();
    await loaded();
    expect(screen.getByText("29.09.2026 17:05")).toBeInTheDocument();
    expect(screen.queryByText("28.09.2026 13:30")).not.toBeInTheDocument();
  });

  it("teklif damgası daha yeniyse o gösterilir (künye PATCH'i)", async () => {
    backend.detail = makeDetail({ updated_at: "2026-09-30T08:00:00Z" });
    backend.revisions[2] = makeRevision({ rev_no: 2, updated_at: "2026-09-29T14:05:00Z" });
    renderScreen();
    await loaded();
    expect(screen.getByText("30.09.2026 11:00")).toBeInTheDocument();
  });
});

describe("TÜİK ⇄ Sabit (fiyat farkı) gövdesi", () => {
  it("Sabit → TÜİK: endeks türü seçici açılır; seçilmeden kayıt YOK; seçilince {tuik, ufe}", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok(backend.revisions[2]));
    renderScreen();
    await loaded();
    expect(screen.queryByRole("combobox", { name: /Endeks türü/ })).not.toBeInTheDocument();
    await user.click(button("TÜİK endeksli"));
    await user.click(button("Taslak Kaydet"));
    expect(await screen.findByText("Fiyat farkı «TÜİK endeksli» iken endeks türü zorunludur")).toBeInTheDocument();
    expect(vi.mocked(backendClient.PATCH)).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByRole("combobox", { name: /Endeks türü/ }), "ufe");
    await user.click(button("Taslak Kaydet"));
    await waitFor(() => expect(callsTo("PATCH", PATCH_REV)).toHaveLength(1));
    expect(bodyOf(callsTo("PATCH", PATCH_REV)[0])).toEqual({ price_escalation: "tuik", price_index_type: "ufe" });
  });

  it("TÜİK → Sabit: gövde {fixed, price_index_type: null}", async () => {
    const user = userEvent.setup();
    backend.revisions[2] = makeRevision({ rev_no: 2, price_escalation: "tuik", price_index_type: "tufe" });
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok(backend.revisions[2]));
    renderScreen();
    await loaded();
    expect(screen.getByRole("combobox", { name: /Endeks türü/ })).toHaveValue("tufe");
    await user.click(button("Sabit fiyat"));
    await user.click(button("Taslak Kaydet"));
    await waitFor(() => expect(callsTo("PATCH", PATCH_REV)).toHaveLength(1));
    expect(bodyOf(callsTo("PATCH", PATCH_REV)[0])).toEqual({ price_escalation: "fixed", price_index_type: null });
  });
});

describe("eski revizyon (?rev=1) — salt okunur", () => {
  it("🔴 TÜM alanlar disabled + bant (gönderim tarihi) + 'Güncel revizyona dön' + hiçbir eylem açık değil", async () => {
    renderScreen("1");
    await screen.findByText(/salt okunur ·/);
    await screen.findByRole("option", { name: "Kuzey Gayrimenkul A.Ş." });
    const banner = screen.getByRole("note");
    expect(within(banner).getByText("Rev.1")).toBeInTheDocument();
    expect(within(banner).getByText(/işverene 12\.09\.2026 tarihinde gönderildi/)).toBeInTheDocument();
    for (const field of [...screen.getAllByRole("textbox"), ...screen.getAllByRole("combobox")]) {
      expect(field).toBeDisabled();
    }
    for (const name of ["TÜİK endeksli", "Sabit fiyat", "+ Yeni işveren"]) expect(button(name)).toBeDisabled();
    for (const name of ["Taslak Kaydet", "Yeni Revizyon", "Gönderildi İşaretle", "Kazanıldı…", "Kaybedildi", "Vazgeçildi…"]) {
      expect(button(name)).toBeDisabled();
    }
    expect(screen.getByRole("link", { name: "Güncel revizyona dön →" })).toHaveAttribute("href", "/teklif-hazirlama/offer-14");
  });

  it("gönderilip kaybedilmiş eski revizyonun bandı da GÖNDERİM gününü söyler (gerçek veri: lost ⇒ sent_at dolu)", async () => {
    backend.detail = makeDetail({
      revisions: makeDetail().revisions.map((revision) =>
        revision.rev_no === 0 ? { ...revision, status: "lost", lost_at: "2026-09-02T12:00:00Z" } : revision,
      ),
    });
    renderScreen("0");
    expect(await screen.findByText(/işverene 28\.08\.2026 tarihinde gönderildi/)).toBeInTheDocument();
    expect(screen.queryByText(/kaybedildi ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ilk teklif/)).not.toBeInTheDocument();
  });

  it("revizyon seçici: seçim URL'ye yazılır (?rev=); güncele dönüş rev'i KALDIRIR", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: /Revizyon\s*Rev\.2 \(güncel\)/ }));
    const menu = screen.getByRole("dialog", { name: "Revizyon seç" });
    const labels = within(menu).getAllByRole("button").map((item) => item.textContent ?? "");
    expect(labels).toHaveLength(3);
    expect(labels[0]).toMatch(/^Rev\.2 \(güncel\)/);
    expect(labels[0]).not.toContain("salt okunur");
    expect(labels[1]).toMatch(/^Rev\.1.*salt okunur$/);
    expect(labels[2]).toMatch(/^Rev\.0.*salt okunur$/);
    await user.click(within(menu).getByRole("button", { name: /^Rev\.1/ }));
    expect(nav.replace).toHaveBeenCalledWith("/teklif-hazirlama/offer-14?rev=1");
  });

  it("olmayan revizyon (?rev=9) → 'Rev.9 bulunamadı' + güncele dönüş", async () => {
    renderScreen("9");
    expect(await screen.findByText("Rev.9 bulunamadı")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Güncel revizyona dön" })).toHaveAttribute("href", "/teklif-hazirlama/offer-14");
  });
});

describe("durum geçişleri", () => {
  it("gönderilmiş: Kazanıldı… → onay modalı → POST win; toast mockup metni; kazanılana KATALOG da tazelenir (win)", async () => {
    const user = userEvent.setup();
    backend = singleRevisionBackend("sent");
    mockBackend();
    vi.mocked(backendClient.POST).mockResolvedValue(ok(backend.detail));
    renderScreen();
    await loaded();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(button("Kazanıldı…"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/TKL-2026-0014 Rev\.0 kazanıldı olarak işaretlensin mi\?/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Kazanıldı" }));
    expect(await screen.findByText("Kazanıldı · projeye dönüştürme adımı açılacak")).toBeInTheDocument();
    expect(callsTo("POST", WIN)).toHaveLength(1);
    expect(invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey))).toContain('["catalog-items"]');
  });

  it("🔴 409: sunucu metni AYNEN basılır ve DETAY + LİSTE sorguları tazelenir", async () => {
    const user = userEvent.setup();
    backend = singleRevisionBackend("sent");
    mockBackend();
    vi.mocked(backendClient.POST).mockResolvedValue(
      fail(409, "Revizyon gönderilmiş durumda; bu işlem yapılamaz"),
    );
    renderScreen();
    await loaded();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(button("Kaybedildi"));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Kaybedildi İşaretle" }));
    expect((await screen.findAllByText("Revizyon gönderilmiş durumda; bu işlem yapılamaz")).length).toBeGreaterThan(0);
    const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(keys).toContain('["offer","offer-14"]');
    expect(keys).toContain('["offers"]');
  });

  it("SO-9: kalemsiz Gönder 422 → 'Teklifte kalem yok' AYNEN (bant); durum değişmez", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.POST).mockResolvedValue(fail(422, "Teklifte kalem yok"));
    backend = singleRevisionBackend("draft", 0);
    mockBackend();
    renderScreen();
    await loaded();
    await user.click(button("Gönderildi İşaretle"));
    expect(await screen.findByText("Teklifte kalem yok")).toBeInTheDocument();
    expect(callsTo("POST", SEND)).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fiyatsız kalem varken Gönder ONAY ister (N kalem uyarısı); onayla → POST send + toast (geçerlilik gün)", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.POST).mockResolvedValue(ok(backend.detail));
    renderScreen();
    await loaded();
    await user.click(button("Gönderildi İşaretle"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("2 kalemde fiyat yok; tutara dahil değil. Yine de gönderildi işaretlensin mi?")).toBeInTheDocument();
    expect(callsTo("POST", SEND)).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Gönderildi İşaretle" }));
    expect(await screen.findByText("Gönderildi olarak işaretlendi · geçerlilik 30 gün")).toBeInTheDocument();
    expect(callsTo("POST", SEND)).toHaveLength(1);
  });

  it("🔴 F4.2 miktarsız kalem varken Gönderildi İşaretle PASİF + gerekçe görünür; tıklamak POST atmaz", async () => {
    const user = userEvent.setup();
    backend = singleRevisionBackend("draft", 0);
    backend.revisions[0] = { ...backend.revisions[0]!, totals: { ...backend.revisions[0]!.totals, unquantified_count: 2 } };
    mockBackend();
    renderScreen();
    await loaded();
    expect(button("Gönderildi İşaretle")).toBeDisabled();
    expect(screen.getByText("Miktarı girilmemiş kalem var")).toBeInTheDocument();
    await user.click(button("Gönderildi İşaretle"));
    expect(callsTo("POST", SEND)).toHaveLength(0);
  });

  it("🔴 F4.2 taze okuma yolu: önbellek 0 ama taze revizyonda miktarsız var → onay modalı AÇILMAZ, POST atılmaz, metin görünür", async () => {
    const user = userEvent.setup();
    backend = singleRevisionBackend("draft", 0);
    mockBackend();
    renderScreen();
    await loaded();
    expect(button("Gönderildi İşaretle")).toBeEnabled();
    backend.revisions[0] = { ...backend.revisions[0]!, totals: { ...backend.revisions[0]!.totals, unquantified_count: 1 } };
    await user.click(button("Gönderildi İşaretle"));
    // gerekçe (düğme altı, taze veriyle) + bant: İKİ görünüm
    await waitFor(() => expect(screen.getAllByText("Miktarı girilmemiş kalem var")).toHaveLength(2));
    expect(callsTo("POST", SEND)).toHaveLength(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("🔴 F4.2 yarışta sunucu 422 'Miktarı girilmemiş kalem var' → metin AYNEN bantta + revizyon tazelenir", async () => {
    const user = userEvent.setup();
    backend = singleRevisionBackend("draft", 0);
    mockBackend();
    vi.mocked(backendClient.POST).mockResolvedValue(fail(422, "Miktarı girilmemiş kalem var"));
    renderScreen();
    await loaded();
    const readsBefore = vi.mocked(backendClient.GET).mock.calls.filter((call) => String(call[0]) === "/offers/{offer_id}/revisions/{rev_no}").length;
    await user.click(button("Gönderildi İşaretle"));
    expect(await screen.findByText("Miktarı girilmemiş kalem var")).toBeInTheDocument();
    await waitFor(() => {
      const reads = vi.mocked(backendClient.GET).mock.calls.filter((call) => String(call[0]) === "/offers/{offer_id}/revisions/{rev_no}").length;
      expect(reads).toBeGreaterThan(readsBefore + 1); // taze okuma (gönderim öncesi) + 422 sonrası tazeleme
    });
  });

  it("fiyatsız kalem YOKSA Gönder onaysız doğrudan atılır (mockup)", async () => {
    const user = userEvent.setup();
    backend = singleRevisionBackend("draft", 0);
    mockBackend();
    vi.mocked(backendClient.POST).mockResolvedValue(ok(backend.detail));
    renderScreen();
    await loaded();
    await user.click(button("Gönderildi İşaretle"));
    await waitFor(() => expect(callsTo("POST", SEND)).toHaveLength(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("taslak: Vazgeçildi… onay (kapanır; yeni revizyon açılamaz) → POST withdraw", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.POST).mockResolvedValue(ok(backend.detail));
    renderScreen();
    await loaded();
    await user.click(button("Vazgeçildi…"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Teklif vazgeçildi olarak kapanır; yeni revizyon açılamaz.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Vazgeçildi" }));
    await waitFor(() => expect(callsTo("POST", WITHDRAW)).toHaveLength(1));
  });

  it("gönderilmiş: Yeni Revizyon → POST …/revisions → yeni rev'e geçer (?rev=3) + toast", async () => {
    const user = userEvent.setup();
    backend = singleRevisionBackend("sent");
    mockBackend();
    vi.mocked(backendClient.POST).mockResolvedValue(ok(makeRevision({ rev_no: 1 })));
    renderScreen();
    await loaded();
    await user.click(button("Yeni Revizyon"));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/teklif-hazirlama/offer-14?rev=1"));
    expect(callsTo("POST", NEW_REV)).toHaveLength(1);
    expect(await screen.findByText("Rev.1 oluşturuldu · Rev.0 salt okunur")).toBeInTheDocument();
  });

  it("Yeni Revizyon (URL'de rev YOK): detay tazelemesi görünümü yeni güncel revizyona çevirse de ?rev=1'e geçer + toast görünür", async () => {
    // TKL-F3.8 AŞAMA B kırmızısı (e2e offers.spec): gerçek ağda tazelemeler AYRI döner; detay (latest_rev_no=1)
    // eski revizyonun okumasından ÖNCE inerse görünüm yeni anahtarla yeniden kurulur ve `mutate()` geri çağrıları
    // (yönlendirme + toast) SÖNERDİ. Arka uç burada DURUMLUDUR: POST sonrası detay iki revizyon döner.
    const user = userEvent.setup();
    backend = singleRevisionBackend("sent");
    mockBackend();
    const rev1: OfferRevisionRead = { ...makeRevision({ rev_no: 1 }), status: "draft", is_latest: true, is_editable: true };
    vi.mocked(backendClient.POST).mockImplementation((async (path: string) => {
      if (path !== NEW_REV) throw new Error(`beklenmeyen POST ${path}`);
      const sent0 = backend.revisions[0]!;
      backend = {
        detail: {
          ...backend.detail,
          latest_rev_no: 1,
          status: "draft",
          revisions: [...backend.detail.revisions, makeRevisionSummary({ rev_no: 1 })],
        },
        revisions: { 0: { ...sent0, is_latest: false, is_editable: false }, 1: rev1 },
      };
      return ok(rev1, 201);
    }) as never);
    const baseGet = vi.mocked(backendClient.GET).getMockImplementation() as unknown as (path: string, init?: unknown) => Promise<unknown>;
    const REFETCH_LAG_MS = 50;
    vi.mocked(backendClient.GET).mockImplementation((async (path: string, init?: { params?: { path?: { rev_no?: number } } }) => {
      if (path === "/offers/{offer_id}/revisions/{rev_no}" && init?.params?.path?.rev_no === 0 && backend.detail.latest_rev_no === 1) {
        await new Promise((resolve) => setTimeout(resolve, REFETCH_LAG_MS));
      }
      return baseGet(path, init);
    }) as never);
    renderScreen();
    await loaded();
    await user.click(button("Yeni Revizyon"));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/teklif-hazirlama/offer-14?rev=1"));
    expect(callsTo("POST", NEW_REV)).toHaveLength(1);
    expect(await screen.findByText("Rev.1 oluşturuldu · Rev.0 salt okunur")).toBeInTheDocument();
  });

  it("kazanılmış: hiçbir eylem açık değil; gerekçeler görünür; alanlar kapalı", async () => {
    backend = singleRevisionBackend("won");
    mockBackend();
    renderScreen();
    await loaded();
    for (const name of ["Taslak Kaydet", "Yeni Revizyon", "Gönderildi İşaretle", "Kazanıldı…", "Kaybedildi", "Vazgeçildi…"]) {
      expect(button(name)).toBeDisabled();
    }
    expect(screen.getByText("Kazanılan teklif kesinleşti; yeni revizyon açılamaz")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /İş adı/ })).toBeDisabled();
  });

  it("SO-1: vazgeçilene yeni revizyon KAPALI; kaybedilene AÇIK", async () => {
    backend = singleRevisionBackend("withdrawn");
    mockBackend();
    const view = renderScreen();
    await loaded();
    expect(button("Yeni Revizyon")).toBeDisabled();
    view.unmount();
    backend = singleRevisionBackend("lost");
    mockBackend();
    renderScreen();
    await loaded();
    expect(button("Yeni Revizyon")).toBeEnabled();
  });
});

describe("Kaybedildi modalı (T37 + T30)", () => {
  async function openLose(user: ReturnType<typeof userEvent.setup>) {
    backend = singleRevisionBackend("sent");
    mockBackend();
    vi.mocked(backendClient.POST).mockResolvedValue(ok(backend.detail));
    renderScreen();
    await loaded();
    await user.click(button("Kaybedildi"));
    return screen.getByRole("dialog");
  }
  function loseCall() {
    return callsTo("POST", LOSE)[0] as unknown as [string, Record<string, unknown>];
  }

  it("🔴 iki alan boş → gövde HİÇ gönderilmez (body anahtarı yok)", async () => {
    const user = userEvent.setup();
    const dialog = await openLose(user);
    await user.click(within(dialog).getByRole("button", { name: "Kaybedildi İşaretle" }));
    await waitFor(() => expect(callsTo("POST", LOSE)).toHaveLength(1));
    expect(loseCall()[1]).not.toHaveProperty("body");
  });

  it("🔴 yalnız neden → {lost_reason}; kazanan tutar anahtarı YOK", async () => {
    const user = userEvent.setup();
    const dialog = await openLose(user);
    await user.type(within(dialog).getByRole("textbox", { name: /Kayıp nedeni/ }), "Fiyat yüksek");
    await user.click(within(dialog).getByRole("button", { name: "Kaybedildi İşaretle" }));
    await waitFor(() => expect(callsTo("POST", LOSE)).toHaveLength(1));
    expect(loseCall()[1]).toHaveProperty("body", { lost_reason: "Fiyat yüksek" });
  });

  it("kazanan tutar T30: '61.250.000,50' → '61250000.50' METİN; '28.5' belirsiz → istek YOK", async () => {
    const user = userEvent.setup();
    const dialog = await openLose(user);
    const amount = within(dialog).getByRole("textbox", { name: /Kazanan teklif tutarı/ });
    await user.type(amount, "28.5");
    await user.click(within(dialog).getByRole("button", { name: "Kaybedildi İşaretle" }));
    expect(await within(dialog).findByText("Ondalık için virgül kullanın (ör. 28,50)")).toBeInTheDocument();
    expect(callsTo("POST", LOSE)).toHaveLength(0);
    await user.clear(amount);
    await user.type(amount, "61.250.000,50");
    await user.click(within(dialog).getByRole("button", { name: "Kaybedildi İşaretle" }));
    await waitFor(() => expect(callsTo("POST", LOSE)).toHaveLength(1));
    expect(loseCall()[1]).toHaveProperty("body", { winning_amount: "61250000.50" });
    expect(await screen.findByText("Kaybedildi olarak işaretlendi")).toBeInTheDocument();
  });
});

describe("F3.6 yuvası", () => {
  it("renderItems verilmezse kalem bölgesi HİÇ basılmaz (yer tutucu yok)", async () => {
    renderScreen();
    await loaded();
    expect(screen.queryByText(/Kalemler/)).not.toBeInTheDocument();
  });

  it("renderItems bağlam alır: teklif, revizyon no, revizyon verisi, düzenlenebilirlik", async () => {
    const renderItems = vi.fn(() => <section aria-label="kalem yuvası">yuva</section>);
    renderScreen(null, renderItems);
    await loaded();
    expect(await screen.findByRole("region", { name: "kalem yuvası" })).toBeInTheDocument();
    expect(renderItems).toHaveBeenLastCalledWith(
      expect.objectContaining({ offerId: OFFER_ID, revNo: 2, canEdit: true, revision: expect.objectContaining({ rev_no: 2 }) }),
    );
  });

  it("eski revizyonda yuva canEdit=false alır", async () => {
    const renderItems = vi.fn(() => <span>yuva</span>);
    renderScreen("1", renderItems);
    await screen.findByText(/salt okunur ·/);
    expect(renderItems).toHaveBeenLastCalledWith(expect.objectContaining({ revNo: 1, canEdit: false }));
  });
});

describe("parseRevParam (?rev= URL durumu)", () => {
  it("rakam → no (0 geçerli); boş / rakam dışı / ondalık / negatif → güncel revizyon", () => {
    expect(parseRevParam("2")).toBe(2);
    expect(parseRevParam("0")).toBe(0);
    for (const bad of [null, "", "abc", "-1", "1.5", "2x"]) expect(parseRevParam(bad)).toBeUndefined();
  });
});

describe("sekme şeridi", () => {
  it("'Teklifler' sekmesi listeye bağlanır; poz kütüphanesi kataloğa", async () => {
    renderScreen();
    await loaded();
    expect(screen.getByRole("link", { name: "Teklifler" })).toHaveAttribute("href", "/teklif-hazirlama");
    expect(screen.getByRole("link", { name: "Poz Kütüphanesi" })).toBeInTheDocument();
  });
});
