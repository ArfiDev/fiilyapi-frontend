import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendError } from "@/lib/api/unwrap";
import type {
  ApprovalHistoryItem,
  ApprovalHistoryResponse,
  ApprovalInboxItem,
  ApprovalInboxResponse,
  ApprovalStepRead,
} from "@/lib/api/hooks/useApprovals";
import { useApprovalInbox, useApprovalSettings } from "@/lib/api/hooks/useApprovals";

import { ApprovalsView } from "./ApprovalsView";

vi.mock("@/lib/api/hooks/useApprovals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useApprovals")>()),
  useApprovalInbox: vi.fn(),
  useApprovalSettings: vi.fn(),
}));

// OKT-F1.2 — açık sekme `?sekme=` URL parametresidir. `useRouter().replace`
// gerçekten uygulanır (düz `vi.fn()` URL'i DEĞİŞTİRMEZ → tık hiçbir şeyi
// oynatmaz): sorgu dizesi saklanır, `useSyncExternalStore` bileşeni yeniden çizer.
const nav = vi.hoisted(() => {
  let search = "";
  const listeners = new Set<() => void>();
  const replaceCalls: string[] = [];
  return {
    replaceCalls,
    reset(initialSearch = "") {
      search = initialSearch;
      replaceCalls.length = 0;
    },
    replace(href: string) {
      replaceCalls.push(href);
      const queryStart = href.indexOf("?");
      search = queryStart === -1 ? "" : href.slice(queryStart + 1);
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read: () => search,
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/onay-kutusu",
  useRouter: () => ({ replace: nav.replace, push: () => undefined, back: () => undefined }),
  useSearchParams: () => {
    const current = useSyncExternalStore(nav.subscribe, nav.read, nav.read);
    return new URLSearchParams(current);
  },
}));

beforeEach(() => nav.reset());

const THRESHOLD = "500000.00";

function step(partial: Partial<ApprovalStepRead>): ApprovalStepRead {
  return {
    step_no: 1,
    approval_role: "accounting",
    decided_at: null,
    decided_by_name: null,
    ...partial,
  };
}

function item(partial: Partial<ApprovalInboxItem> = {}): ApprovalInboxItem {
  return {
    chain_id: "chain-1",
    document_type: "subcontractor_progress_payment",
    document_id: "scpp-3",
    created_by_name: "Sercan Öztürk",
    created_at: "2026-07-20T08:52:00Z",
    threshold_snapshot: THRESHOLD,
    amount_snapshot: "1240000.00",
    current_step_no: 3,
    steps: [
      step({ step_no: 1, approval_role: "site_chief", decided_at: "2026-07-19T08:00:00Z" }),
      step({ step_no: 2, approval_role: "project_manager", decided_at: "2026-07-19T10:00:00Z" }),
      step({ step_no: 3, approval_role: "patron" }),
    ],
    title: "Akın İnşaat — Hakediş #47 (Betonarme)",
    subtitle: "Güneşkent A-Blok · Kat 6–8 · 07/2026",
    gross_amount: "1240000.00",
    net_amount: "1016800.00",
    ...partial,
  };
}

type InboxResult = ReturnType<typeof useApprovalInbox>;
type SettingsResult = ReturnType<typeof useApprovalSettings>;

function mockInbox(partial: Partial<ApprovalInboxResponse> | null, extra: Record<string, unknown> = {}) {
  const data =
    partial === null
      ? undefined
      : ({
          items: [item()],
          total: 1,
          limit: 200,
          offset: 0,
          my_approval_roles: ["patron"],
          ...partial,
        } satisfies ApprovalInboxResponse);
  vi.mocked(useApprovalInbox).mockReturnValue({
    data,
    error: null,
    isError: false,
    isLoading: false,
    ...extra,
  } as unknown as InboxResult);
}

function mockSettings(threshold: string | null, extra: Record<string, unknown> = {}) {
  vi.mocked(useApprovalSettings).mockReturnValue({
    data: threshold === null ? undefined : { approval_threshold_try: threshold },
    error: null,
    isError: false,
    isLoading: false,
    ...extra,
  } as unknown as SettingsResult);
}

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApprovalsView />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * OLUMSUZ iddia (`not.toHaveBeenCalled`) için bekleme: `waitFor` olumsuzu
 * bekçileyemez (ilk denemede geçer). Mutasyon isteği bir mikro-görevde
 * atıldığından sayacı okumadan önce kuyruğun boşalması BEKLENİR.
 */
async function flushMutations() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ApprovalsView — durumlar", () => {
  it("yükleniyor hâlinde liste yerine bekleme metni basılır", () => {
    mockInbox(null, { isLoading: true });
    mockSettings(THRESHOLD);
    renderView();
    expect(screen.getByTestId("ok-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("ok-list")).not.toBeInTheDocument();
  });

  it("liste hatasında GÖRÜNÜR hata bandı basılır", () => {
    mockInbox(null, {
      isError: true,
      error: new BackendError(500, { detail: "sunucu patladı" }),
    });
    mockSettings(THRESHOLD);
    renderView();
    expect(screen.getByTestId("ok-list-error")).toHaveTextContent("sunucu patladı");
  });

  it("403 AccessDenied'e düşer (ön yetki kapısı YOK, yalnız 403 türevi)", () => {
    mockInbox(null, { isError: true, error: new BackendError(403, null) });
    mockSettings(THRESHOLD);
    renderView();
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("boş küme özel bir metinle basılır", () => {
    mockInbox({ items: [], total: 0 });
    mockSettings(THRESHOLD);
    renderView();
    expect(screen.getByTestId("ok-empty")).toBeInTheDocument();
  });

  it("🔴 'yüklendi' bayrağı KAYNAK BAŞINA basılır (tek bayrak ikinciyi gizlerdi)", () => {
    mockInbox({});
    mockSettings(null, { isLoading: true });
    renderView();
    expect(screen.getByTestId("ok-loaded-list")).toBeInTheDocument();
    expect(screen.queryByTestId("ok-loaded-settings")).not.toBeInTheDocument();
  });

  it("ayar hatası listeyi ÖLDÜRMEZ — kartlar yaşamaya devam eder", () => {
    mockInbox({});
    mockSettings(null, { isError: true, error: new BackendError(500, null) });
    renderView();
    expect(screen.getByTestId("ok-settings-error")).toBeInTheDocument();
    expect(screen.getAllByTestId("ok-card")).toHaveLength(1);
  });

  it("kırpma bandı `items.length < total` olduğunda GÖRÜNÜR basılır", () => {
    mockInbox({ items: [item()], total: 240 });
    mockSettings(THRESHOLD);
    renderView();
    expect(screen.getByTestId("ok-truncation")).toHaveTextContent(
      "İlk 1 kayıt gösteriliyor (toplam 240) — liste eksik.",
    );
  });

  it("kırpma yoksa bant BASILMAZ (sahte uyarı yok)", () => {
    mockInbox({});
    mockSettings(THRESHOLD);
    renderView();
    expect(screen.queryByTestId("ok-truncation")).not.toBeInTheDocument();
  });
});

describe("ApprovalsView — devre-dışı yüzeyler ve gerekçeleri", () => {
  it(":33 'Tümünü Onayla' devre dışıdır ve gerekçesi GÖRÜNÜR", () => {
    mockInbox({});
    mockSettings(THRESHOLD);
    renderView();
    expect(screen.getByTestId("ok-bulk-approve")).toBeDisabled();
    expect(screen.getByTestId("ok-bulk-reason")).toHaveTextContent(
      "Toplu onay henüz desteklenmiyor; her kalem kendi kartından onaylanır.",
    );
  });

  it(":71-76 DÖRT sekme tıklanır; yalnız Benim Onayım seçilidir ve başlangıçta yalnız onun sayacı basılır", () => {
    mockInbox({ total: 7 });
    mockSettings(THRESHOLD);
    renderView();

    expect(screen.getByRole("tablist", { name: "Onay kutusu sekmeleri" })).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Tümü",
      "Benim Onayım (7)",
      "Onay Verildi",
      "Reddedildi",
    ]);
    for (const tab of tabs) expect(tab).toBeEnabled();
    expect(screen.getByRole("tab", { name: /Benim Onayım/ })).toHaveAttribute("aria-selected", "true");
    for (const name of ["Tümü", "Onay Verildi", "Reddedildi"]) {
      expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-selected", "false");
    }
    expect(screen.queryByTestId("ok-tabs-reason")).not.toBeInTheDocument();
  });

  it("🔴 satınalma kaleminin 'Detay'ı devre dışıdır (rota YOK) ve gerekçesi görünür", () => {
    mockInbox({
      items: [
        item({
          chain_id: "chain-2",
          document_type: "purchase_request",
          document_id: "pr-2",
          net_amount: null,
        }),
      ],
    });
    mockSettings(THRESHOLD);
    renderView();

    expect(screen.getByTestId("ok-card-detail")).toBeDisabled();
    expect(screen.getByTestId("ok-card-reason")).toHaveTextContent(
      "Satın alma talebinin detay ekranı henüz yazılmadı.",
    );
    // :173 TEK kutu — net kutusu HİÇ basılmaz.
    expect(screen.queryByTestId("ok-card-net")).not.toBeInTheDocument();
    expect(screen.getByTestId("ok-card-chip")).toHaveAttribute(
      "href",
      "/satinalma/talepler/pr-2/teklifler",
    );
  });

  it("bilinmeyen evrak tipi ÇÖKMEZ; kart basılır ama onay/ret DEVRE DIŞIDIR", () => {
    mockInbox({
      items: [
        item({
          chain_id: "chain-3",
          document_type: "payroll_run" as ApprovalInboxItem["document_type"],
        }),
      ],
    });
    mockSettings(THRESHOLD);
    renderView();

    expect(screen.getByTestId("ok-card-type")).toHaveTextContent("payroll_run");
    expect(screen.getByTestId("ok-card-approve")).toBeDisabled();
    expect(screen.getByTestId("ok-card-reject")).toBeDisabled();
  });
});

describe("ApprovalsView — kart içeriği (mockup :118-148)", () => {
  it("başlık, Türkçeleştirilmiş dönem, tutarlar ve eşik rozeti basılır", () => {
    mockInbox({});
    mockSettings(THRESHOLD);
    renderView();

    expect(screen.getByTestId("ok-card-title")).toHaveTextContent(
      "Akın İnşaat — Hakediş #47 (Betonarme)",
    );
    expect(screen.getByText("Güneşkent A-Blok · Kat 6–8 · Temmuz 2026")).toBeInTheDocument();
    expect(screen.getByTestId("ok-card-gross")).toHaveTextContent("₺1.240.000");
    expect(screen.getByTestId("ok-card-net")).toHaveTextContent("₺1.016.800");
    expect(screen.getByTestId("ok-card-threshold")).toHaveTextContent(
      ">₺500.000 — Patron Gerekli",
    );
  });

  it("🔴 fiyatsız kalem `0` DEĞİL `—` basar", () => {
    mockInbox({ items: [item({ gross_amount: null, net_amount: null })] });
    mockSettings(THRESHOLD);
    renderView();
    expect(screen.getByTestId("ok-card-gross")).toHaveTextContent("—");
  });

  it("patron adımı YOKSA eşik rozeti basılmaz", () => {
    mockInbox({
      items: [
        item({
          current_step_no: 2,
          steps: [
            step({ step_no: 1, approval_role: "site_chief", decided_at: "2026-07-19T08:00:00Z" }),
            step({ step_no: 2, approval_role: "accounting" }),
          ],
        }),
      ],
    });
    mockSettings(THRESHOLD);
    renderView();
    expect(screen.queryByTestId("ok-card-threshold")).not.toBeInTheDocument();
  });

  it("adım şeridi DÖRT durumu sınıfa çevirir (glif YOK)", () => {
    mockInbox({});
    mockSettings(THRESHOLD);
    renderView();
    const states = screen.getAllByTestId("ok-step").map((node) => node.dataset.state);
    expect(states).toEqual(["decided", "decided", "current-mine"]);
    // `✓`/`●`/`○` glifleri metne SIZMAMALI (fontta kapsanmıyor).
    expect(screen.getByTestId("ok-steps").textContent ?? "").not.toMatch(/[✓✗●○→⚠ℹ]/);
  });

  it("🔴 mockup'ın karşılıksız parçaları BASILMAZ (ACİL rozeti, oluşturan ROLÜ)", () => {
    mockInbox({});
    mockSettings(THRESHOLD);
    renderView();
    expect(screen.queryByText("ACİL")).not.toBeInTheDocument();
    expect(screen.getByTestId("ok-card-meta")).toHaveTextContent("20 Temmuz 2026 · Sercan Öztürk");
    expect(screen.getByTestId("ok-card-meta").textContent).not.toContain("(");
  });

  it("🔴 KAYIT NO 24 — 21:00Z sonrası oluşan onay bir gün GERİDE görünmez (UTC→TR)", () => {
    // 2026-07-20T21:30:00Z = 2026-07-21T00:30:00 Europe/Istanbul (UTC+3).
    // `slice(0,10)` UTC gününü ("20 Temmuz") basardı; TR takvim günü 21'idir.
    mockInbox({ items: [item({ created_at: "2026-07-20T21:30:00Z" })] });
    mockSettings(THRESHOLD);
    renderView();
    expect(screen.getByTestId("ok-card-meta")).toHaveTextContent("21 Temmuz 2026 · Sercan Öztürk");
  });
});

describe("ApprovalsView — ret diyaloğunun ZORUNLU gerekçe kapısı", () => {
  it("🔴 gerekçe boşken HİÇBİR istek atılmaz ve düğme disabled kalır", async () => {
    mockInbox({});
    mockSettings(THRESHOLD);
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    renderView();
    await userEvent.click(screen.getByTestId("ok-card-reject"));
    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByTestId("ok-reject-submit");

    // SIRA ÖNEMLİ: önce ÇAĞRI SAYACI. `toBeDisabled()` önce yazılırsa kusur
    // geri geldiğinde test O satırda düşer ve asıl ölçü — isteğin ATILMAMASI —
    // hiç koşmaz (b97eaa8'de fiilen bulunan sahte-yeşil).
    await userEvent.click(submit);
    await flushMutations();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(submit).toBeDisabled();
    expect(within(dialog).getByTestId("ok-reject-required")).toBeInTheDocument();
  });

  it("🔴 yalnız boşluktan oluşan gerekçede de HİÇBİR istek atılmaz", async () => {
    mockInbox({});
    mockSettings(THRESHOLD);
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    renderView();
    await userEvent.click(screen.getByTestId("ok-card-reject"));
    const dialog = screen.getByRole("dialog");
    // "   " ÜÇ karakterdir: `!== ""` ile kurulmuş bir kapı bunu GEÇİRİRDİ.
    await userEvent.type(within(dialog).getByTestId("ok-reject-reason"), "   ");
    const submit = within(dialog).getByTestId("ok-reject-submit");

    await userEvent.click(submit);
    await flushMutations();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(submit).toBeDisabled();
  });

  it("dolu gerekçede KIRPILMIŞ `reason` ile doğru aile ucuna gider", async () => {
    mockInbox({});
    mockSettings(THRESHOLD);
    let capturedUrl: string | undefined;
    let capturedBody: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const request = input as Request;
        if (String(request.url).includes("/reject")) {
          capturedUrl = request.url;
          capturedBody = await request.text();
        }
        return jsonResponse({});
      }),
    );

    renderView();
    await userEvent.click(screen.getByTestId("ok-card-reject"));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByTestId("ok-reject-reason"), "  eksik metraj  ");
    await userEvent.click(within(dialog).getByTestId("ok-reject-submit"));

    await waitFor(() => expect(capturedBody).not.toBeUndefined());
    expect(capturedUrl).toContain("/subcontractor-progress-payments/scpp-3/reject");
    expect(JSON.parse(capturedBody as string)).toEqual({ reason: "eksik metraj" });
  });

  // 🔴 Tavan TİPE GÖRE değişir (`schema.d.ts`ten ölçüldü): satınalma 2000,
  // iki hakediş ailesi 500. Tek sabit yazmak satınalma kullanıcısını 1500
  // karakterlik meşru bir gerekçeyi yazamaz hâle getirirdi.
  it("hakediş ailesinde gerekçe tavanı 500'dür", async () => {
    mockInbox({});
    mockSettings(THRESHOLD);
    renderView();
    await userEvent.click(screen.getByTestId("ok-card-reject"));
    expect(screen.getByTestId("ok-reject-reason")).toHaveAttribute("maxlength", "500");
  });

  it("satınalma ailesinde gerekçe tavanı 2000'dir", async () => {
    mockInbox({
      items: [item({ document_type: "purchase_request", document_id: "pr-2", net_amount: null })],
    });
    mockSettings(THRESHOLD);
    renderView();
    await userEvent.click(screen.getByTestId("ok-card-reject"));
    expect(screen.getByTestId("ok-reject-reason")).toHaveAttribute("maxlength", "2000");
  });
});

describe("ApprovalsView — onay", () => {
  it("'Onayla' evrak ailesinin KENDİ ucuna GÖVDESİZ POST atar", async () => {
    mockInbox({});
    mockSettings(THRESHOLD);
    let capturedUrl: string | undefined;
    let capturedMethod: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const request = input as Request;
        if (String(request.url).includes("/approve")) {
          capturedUrl = request.url;
          capturedMethod = request.method;
        }
        return jsonResponse({});
      }),
    );

    renderView();
    await userEvent.click(screen.getByTestId("ok-card-approve"));

    await waitFor(() => expect(capturedUrl).not.toBeUndefined());
    expect(capturedUrl).toContain("/subcontractor-progress-payments/scpp-3/approve");
    expect(capturedMethod).toBe("POST");
  });

  it("onay hatası GÖRÜNÜR bantla bildirilir", async () => {
    mockInbox({});
    mockSettings(THRESHOLD);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "yalnız onay bekleyen onaylanabilir" }, 409)),
    );

    renderView();
    await userEvent.click(screen.getByTestId("ok-card-approve"));

    await waitFor(() =>
      expect(screen.getByTestId("ok-action-error")).toHaveTextContent(
        "yalnız onay bekleyen onaylanabilir",
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// OKT-F1.2 · geçmiş sekmeleri — `useApprovalHistory` GERÇEĞİ koşar, uç `fetch`
// kancasında yakalanır (hook'u mock'lamak `decision` parametresinin uca
// GERÇEKTEN ulaştığını kanıtlamazdı).
// ---------------------------------------------------------------------------

function historyItem(partial: Partial<ApprovalHistoryItem> = {}): ApprovalHistoryItem {
  return {
    ...item(),
    decision: "approved",
    decided_by: "Mehmet Kaya",
    decided_at: "2026-09-25T06:12:00Z", // 09:12 İstanbul
    reason: null,
    ...partial,
  };
}

function stubHistoryFetch(
  byDecision: Partial<Record<"all" | "approved" | "rejected", Partial<ApprovalHistoryResponse>>>,
) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String((input as Request).url));
      if (!url.pathname.endsWith("/approvals/history")) return jsonResponse({});
      urls.push(url.search);
      const decision = url.searchParams.get("decision") as "all" | "approved" | "rejected";
      const body = byDecision[decision] ?? {};
      return jsonResponse({
        items: [],
        total: 0,
        limit: 200,
        offset: 0,
        my_approval_roles: ["patron"],
        ...body,
      });
    }),
  );
  return urls;
}

describe("ApprovalsView — geçmiş sekmeleri (OKT-F1.2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sekmeye tıklayınca URL ?sekme= olur ve DOĞRU decision ile /approvals/history çağrılır", async () => {
    mockInbox({ total: 4 });
    mockSettings(THRESHOLD);
    const urls = stubHistoryFetch({ rejected: { items: [historyItem({ decision: "rejected" })], total: 2 } });
    renderView();

    await userEvent.click(screen.getByRole("tab", { name: "Reddedildi" }));

    await waitFor(() => expect(urls).toEqual(["?decision=rejected&limit=200"]));
    expect(nav.replaceCalls.at(-1)).toBe("/onay-kutusu?sekme=reddedilen");
    expect(screen.getByRole("tab", { name: /Reddedildi/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Benim Onayım/ })).toHaveAttribute("aria-selected", "false");
  });

  it.each([
    ["Tümü", "tumu", "all"],
    ["Onay Verildi", "onaylanan", "approved"],
  ])("'%s' sekmesi ?sekme=%s yazar ve decision=%s ister", async (name, param, decision) => {
    mockInbox({});
    mockSettings(THRESHOLD);
    const urls = stubHistoryFetch({});
    renderView();

    await userEvent.click(screen.getByRole("tab", { name }));

    await waitFor(() => expect(urls).toEqual([`?decision=${decision}&limit=200`]));
    expect(nav.replaceCalls.at(-1)).toBe(`/onay-kutusu?sekme=${param}`);
  });

  it("Benim Onayım'a dönmek ?sekme= parametresini SİLER (varsayılan URL'e yazılmaz)", async () => {
    nav.reset("sekme=onaylanan");
    mockInbox({});
    mockSettings(THRESHOLD);
    stubHistoryFetch({});
    renderView();

    await userEvent.click(screen.getByRole("tab", { name: /Benim Onayım/ }));

    expect(nav.replaceCalls.at(-1)).toBe("/onay-kutusu");
    expect(screen.getByRole("tab", { name: /Benim Onayım/ })).toHaveAttribute("aria-selected", "true");
  });

  it("?sekme=reddedilen ile açılınca Reddedildi seçili gelir", async () => {
    nav.reset("sekme=reddedilen");
    mockInbox({});
    mockSettings(THRESHOLD);
    stubHistoryFetch({});
    renderView();

    expect(screen.getByRole("tab", { name: /Reddedildi/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Benim Onayım/ })).toHaveAttribute("aria-selected", "false");
    await waitFor(() => expect(screen.getByTestId("ok-empty")).toBeInTheDocument());
  });

  it("🔴 diğer sekmeler için EKSTRA istek atılmaz — yüklenmemiş sekme sayaçsızdır", async () => {
    mockInbox({ total: 4 });
    mockSettings(THRESHOLD);
    const urls = stubHistoryFetch({ approved: { items: [historyItem()], total: 12 } });
    renderView();

    await userEvent.click(screen.getByRole("tab", { name: "Onay Verildi" }));

    await waitFor(() => expect(screen.getByRole("tab", { name: "Onay Verildi (12)" })).toBeInTheDocument());
    expect(urls).toEqual(["?decision=approved&limit=200"]);
    expect(screen.getByRole("tab", { name: "Tümü" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Reddedildi" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Benim Onayım (4)" })).toBeInTheDocument();
  });

  it("Onay Verildi kartı: 'Onaylandı' rozeti + 'Karar: Ad · tarih'; Onayla/Reddet YOK, Detay VAR", async () => {
    nav.reset("sekme=onaylanan");
    mockInbox({});
    mockSettings(THRESHOLD);
    stubHistoryFetch({ approved: { items: [historyItem()], total: 1 } });
    renderView();

    const card = await screen.findByTestId("ok-card");
    expect(within(card).getByTestId("ok-card-decision-badge")).toHaveTextContent("Onaylandı");
    expect(within(card).getByTestId("ok-card-decision-by")).toHaveTextContent(
      "Karar: Mehmet Kaya · 25.09.2026 09:12",
    );
    expect(within(card).queryByTestId("ok-card-decision-reason")).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /Onayla/ })).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /Reddet/ })).not.toBeInTheDocument();
    expect(within(card).getByTestId("ok-card-detail")).toBeInTheDocument();
    expect(within(card).getByTestId("ok-card-title")).toHaveTextContent("Akın İnşaat");
  });

  it("Reddedildi kartı: 'Reddedildi' rozeti + 'Gerekçe: …'", async () => {
    nav.reset("sekme=reddedilen");
    mockInbox({});
    mockSettings(THRESHOLD);
    stubHistoryFetch({
      rejected: {
        items: [historyItem({ decision: "rejected", reason: "Metraj eksik", decided_by: "Ayşe Demir" })],
        total: 1,
      },
    });
    renderView();

    const card = await screen.findByTestId("ok-card");
    expect(within(card).getByTestId("ok-card-decision-badge")).toHaveTextContent("Reddedildi");
    expect(within(card).getByTestId("ok-card-decision-by")).toHaveTextContent("Karar: Ayşe Demir ·");
    expect(within(card).getByTestId("ok-card-decision-reason")).toHaveTextContent("Gerekçe: Metraj eksik");
    expect(within(card).queryByRole("button", { name: /Onayla|Reddet/ })).not.toBeInTheDocument();
  });

  it("karar veren yoksa 'Karar: —'; ret gerekçesi null ise Gerekçe satırı BASILMAZ", async () => {
    nav.reset("sekme=reddedilen");
    mockInbox({});
    mockSettings(THRESHOLD);
    stubHistoryFetch({
      rejected: {
        items: [historyItem({ decision: "rejected", decided_by: null, decided_at: null, reason: null })],
        total: 1,
      },
    });
    renderView();

    const card = await screen.findByTestId("ok-card");
    expect(within(card).getByTestId("ok-card-decision-by")).toHaveTextContent(/^Karar: —$/);
    expect(within(card).queryByTestId("ok-card-decision-reason")).not.toBeInTheDocument();
  });

  it("Tümü'de sürmekte olan zincir nötr 'Bekliyor · 2. adım' rozeti taşır ve karar satırı basmaz", async () => {
    nav.reset("sekme=tumu");
    mockInbox({});
    mockSettings(THRESHOLD);
    stubHistoryFetch({
      all: {
        items: [
          historyItem({
            chain_id: "chain-pending",
            decision: "pending",
            decided_by: null,
            decided_at: null,
            current_step_no: 2,
          }),
          historyItem({ chain_id: "chain-done" }),
        ],
        total: 2,
      },
    });
    renderView();

    const cards = await screen.findAllByTestId("ok-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByTestId("ok-card-decision-badge")).toHaveTextContent("Bekliyor · 2. adım");
    expect(within(cards[0]).queryByTestId("ok-card-decision-by")).not.toBeInTheDocument();
    expect(within(cards[1]).getByTestId("ok-card-decision-badge")).toHaveTextContent("Onaylandı");
  });

  it.each([
    ["tumu", "Görünür onay zinciri yok"],
    ["onaylanan", "Onayladığınız evrak yok"],
    ["reddedilen", "Reddedilen evrak yok"],
  ])("?sekme=%s boş kümede '%s' basar", async (param, message) => {
    nav.reset(`sekme=${param}`);
    mockInbox({});
    mockSettings(THRESHOLD);
    stubHistoryFetch({});
    renderView();

    expect(await screen.findByTestId("ok-empty")).toHaveTextContent(message);
  });

  it("Benim Onayım boş durumu AYNEN korunur", () => {
    mockInbox({ items: [], total: 0 });
    mockSettings(THRESHOLD);
    renderView();
    expect(screen.getByTestId("ok-empty")).toHaveTextContent("Onayınızı bekleyen kalem yok.");
  });

  it("geçmiş sorgusu hata verirse GÖRÜNÜR hata bandı basılır", async () => {
    nav.reset("sekme=onaylanan");
    mockInbox({});
    mockSettings(THRESHOLD);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ detail: "geçmiş patladı" }, 500)));
    renderView();

    expect(await screen.findByTestId("ok-list-error")).toHaveTextContent("geçmiş patladı");
  });

  it("geçmiş sekmesinde 403 AccessDenied'e düşer", async () => {
    nav.reset("sekme=tumu");
    mockInbox({});
    mockSettings(THRESHOLD);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ detail: "yasak" }, 403)));
    renderView();

    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("Benim Onayım'da Onayla/Reddet düğmeleri hâlâ vardır ve rozet YOKTUR", () => {
    mockInbox({});
    mockSettings(THRESHOLD);
    renderView();

    const card = screen.getByTestId("ok-card");
    expect(within(card).getByTestId("ok-card-approve")).toBeEnabled();
    expect(within(card).getByTestId("ok-card-reject")).toBeEnabled();
    expect(within(card).queryByTestId("ok-card-decision")).not.toBeInTheDocument();
  });
});
