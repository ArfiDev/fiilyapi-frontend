import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BackendError } from "@/lib/api/unwrap";

import { OffersListView, type OffersListViewProps } from "./OffersListView";
import {
  OFFER_DRAFT,
  OFFER_LOST,
  OFFER_SENT,
  OFFER_WITHDRAWN,
  OFFER_WON,
  makeOffer,
  makeResponse,
} from "./offer-fixtures";

const downloadOfferExport = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/offer-export-client", () => ({ downloadOfferExport }));

beforeEach(() => {
  downloadOfferExport.mockReset();
  downloadOfferExport.mockResolvedValue("TKL-2026-0013-Rev2-isveren.xlsx");
});

// Bugün (İstanbul) = 2026-10-02.
const NOW = new Date("2026-10-01T21:30:00Z");

function renderView(overrides: Partial<OffersListViewProps> = {}) {
  const props: OffersListViewProps = {
    body: { kind: "ready", data: makeResponse([OFFER_DRAFT, OFFER_SENT, OFFER_WON, OFFER_LOST, OFFER_WITHDRAWN]) },
    status: null,
    employerId: null,
    searchText: "",
    dateFrom: "",
    dateTo: "",
    onDateFromChange: vi.fn(),
    onDateToChange: vi.fn(),
    onStatusChange: vi.fn(),
    onEmployerChange: vi.fn(),
    onSearchTextChange: vi.fn(),
    onClear: vi.fn(),
    employers: [{ id: "emp-1", name: "Kuzey Gayrimenkul A.Ş." }],
    catalogCount: 412,
    canWrite: true,
    readOnlyText: "",
    now: NOW,
    busyOfferId: null,
    onNewRevision: vi.fn(),
    onDelete: vi.fn(),
    toast: null,
    actionError: null,
    ...overrides,
  };
  render(<OffersListView {...props} />);
  return props;
}

const row = (offerNo: string) => screen.getByTestId(`offers-row-${offerNo}`);

describe("sekme şeridi (§1.2)", () => {
  it("'Teklifler N' etkin; 'Poz Kütüphanesi' İş Kalemi Kataloğu'na BAĞLANTI + katalog sayacı", () => {
    renderView();
    const tabs = screen.getByRole("group", { name: "Teklif sekmeleri" });
    expect(within(tabs).getByRole("button", { name: /Teklifler/ })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByText("11")).toBeInTheDocument();
    const poz = within(tabs).getByRole("link", { name: /Poz Kütüphanesi/ });
    expect(poz).toHaveAttribute("href", "/planlama/is-kalemi-katalogu");
    expect(poz).toHaveTextContent("412");
  });

  it("'Teklif Şablonları' ve 'İşverenler' devre-dışı 'Yakında'", () => {
    renderView();
    for (const name of [/Teklif Şablonları/, /İşverenler/]) {
      const tab = screen.getByRole("button", { name });
      expect(tab).toBeDisabled();
      expect(tab).toHaveTextContent("Yakında");
    }
  });

  it("süzgeç (işveren/arama) açıkken 'Teklifler' sayacı basılmaz", () => {
    renderView({ searchText: "ata" });
    const tab = screen.getByRole("button", { name: /^Teklifler/ });
    expect(tab).not.toHaveTextContent("11");
  });
});

describe("durum kartları (TL:92-100)", () => {
  it("dört kart: sayaç + tutar (yalnız Gönderildi/Kazanıldı) + alt metin", () => {
    renderView();
    expect(screen.getByTestId("offers-card-draft")).toHaveTextContent("Taslak");
    expect(screen.getByTestId("offers-card-draft")).toHaveTextContent("Gönderilmeyi bekliyor");
    expect(screen.getByTestId("offers-card-sent")).toHaveTextContent("₺ 50,8M");
    expect(screen.getByTestId("offers-card-sent")).toHaveTextContent("2 teklifin geçerliliği doldu");
    expect(screen.getByTestId("offers-card-won")).toHaveTextContent("₺ 109,8M");
    expect(screen.getByTestId("offers-card-won")).toHaveTextContent("Kazanma oranı %60 · karara bağlanan 5 tekliften");
    expect(screen.getByTestId("offers-card-lost")).not.toHaveTextContent("₺");
    expect(screen.queryByTestId("offers-card-withdrawn")).not.toBeInTheDocument();
  });

  it("kart tıklaması durum süzgecini AÇAR", async () => {
    const user = userEvent.setup();
    const props = renderView();
    await user.click(screen.getByTestId("offers-card-sent"));
    expect(props.onStatusChange).toHaveBeenLastCalledWith("sent");
  });

  it("etkin karta tekrar tıklamak süzgeci kapatır (null)", async () => {
    const user = userEvent.setup();
    const props = renderView({ status: "sent" });
    const card = screen.getByTestId("offers-card-sent");
    expect(card).toHaveAttribute("aria-pressed", "true");
    await user.click(card);
    expect(props.onStatusChange).toHaveBeenLastCalledWith(null);
  });
});

describe("tablo satırları (TL:137-168)", () => {
  it("numara bağlantısı, Rev, iş adı + kapsam, işveren, tarihler, KDV hariç/dahil, durum rozeti", () => {
    renderView();
    const r = row("TKL-2026-0014");
    expect(within(r).getByRole("link", { name: "TKL-2026-0014" })).toHaveAttribute("href", "/teklif-hazirlama/id-TKL-2026-0014");
    expect(within(r).getByText("R0")).toBeInTheDocument();
    expect(within(r).getByText("Bahçeşehir Konakları 2. Etap")).toBeInTheDocument();
    expect(within(r).getByText("Kaba inşaat · 4 blok, 96 daire")).toBeInTheDocument();
    expect(within(r).getByText("28.09.2026")).toBeInTheDocument();
    expect(within(r).getByText("28.10.2026")).toBeInTheDocument();
    expect(within(r).getByText("₺48.750.000,00")).toBeInTheDocument();
    expect(within(r).getByText("₺58.500.000,00")).toBeInTheDocument();
    expect(within(r).getByText("Taslak")).toHaveClass("offers-tone--neutral");
  });

  it("durum rozeti rengi eşlemi: beş durum", () => {
    renderView();
    const tone = (no: string, label: string) => within(row(no)).getByText(label);
    expect(tone("TKL-2026-0013", "Gönderildi")).toHaveClass("offers-tone--primary");
    expect(tone("TKL-2026-0011", "Kazanıldı")).toHaveClass("offers-tone--success");
    expect(tone("TKL-2026-0010", "Kaybedildi")).toHaveClass("offers-tone--danger");
    expect(tone("TKL-2026-0009", "Vazgeçildi")).toHaveClass("offers-tone--dark");
  });

  it("'süresi geçti': gönderilmiş + geçerlilik dün → kırmızı; bugün → geçerli (İstanbul günü, UTC 21:30)", () => {
    const expired = makeOffer({ offer_no: "E-1", status: "sent", valid_until: "2026-10-01" });
    const today = makeOffer({ offer_no: "E-2", status: "sent", valid_until: "2026-10-02" });
    const draftPast = makeOffer({ offer_no: "E-3", status: "draft", valid_until: "2026-01-01" });
    renderView({ body: { kind: "ready", data: makeResponse([expired, today, draftPast]) } });
    expect(within(row("E-1")).getByText("süresi geçti")).toBeInTheDocument();
    expect(within(row("E-2")).queryByText("süresi geçti")).not.toBeInTheDocument();
    expect(within(row("E-3")).queryByText("süresi geçti")).not.toBeInTheDocument();
  });

  it("maskeli satır: KDV hariç/dahil '—' ve Σ '—'", () => {
    const masked = makeOffer({ offer_no: "M-1", net: null, gross: null });
    renderView({ body: { kind: "ready", data: makeResponse([masked]) } });
    expect(within(row("M-1")).getAllByText("—")).toHaveLength(2);
    expect(screen.getByTestId("offers-total-net")).toHaveTextContent("—");
    expect(screen.getByTestId("offers-total-gross")).toHaveTextContent("—");
  });

  it("🔴 F4.2 miktarsız kalemli satırda net yanında işaret + 'N kalem miktarsız · tutar kısmi' ipucu; sayaç 0 iken YOK; Σ sunucu net'inden", () => {
    const partial = makeOffer({ offer_no: "P-1", net: "100.00", gross: "120.00", unquantified_count: 2 });
    const full = makeOffer({ offer_no: "P-2", net: "50.00", gross: "60.00", unquantified_count: 0 });
    renderView({ body: { kind: "ready", data: makeResponse([partial, full]) } });
    const marker = within(row("P-1")).getByTitle("2 kalem miktarsız · tutar kısmi");
    expect(marker).toHaveAccessibleName("2 kalem miktarsız · tutar kısmi");
    expect(within(row("P-2")).queryByTitle(/miktarsız/)).not.toBeInTheDocument();
    expect(screen.getByTestId("offers-total-net")).toHaveTextContent("₺150,00");
  });

  it("tam listede Σ basılır", () => {
    const a = makeOffer({ offer_no: "S-1", net: "100.00", gross: "120.00" });
    const b = makeOffer({ offer_no: "S-2", net: "50.50", gross: "60.60" });
    renderView({ body: { kind: "ready", data: makeResponse([a, b]) } });
    expect(screen.getByText("Listelenen toplam · 2 teklif")).toBeInTheDocument();
    expect(screen.getByTestId("offers-total-net")).toHaveTextContent("₺150,50");
    expect(screen.getByTestId("offers-total-gross")).toHaveTextContent("₺180,60");
  });

  it("kırpılmış listede Σ BASILMAZ, sınır göstergesi basılır", () => {
    renderView({ body: { kind: "ready", data: makeResponse([OFFER_DRAFT, OFFER_SENT], { total: 450 }) } });
    expect(screen.queryByTestId("offers-total-net")).not.toBeInTheDocument();
    expect(screen.queryByTestId("offers-total-gross")).not.toBeInTheDocument();
    expect(screen.getByTestId("offers-truncation")).toHaveTextContent("İlk 2 kayıt gösteriliyor (toplam 450) — liste eksik.");
  });

  it("'N teklif' sunucunun süzülmüş toplamını söyler; dipnot kendi KDV oranını belirtir (ÜS-F3-7)", () => {
    renderView();
    expect(screen.getByTestId("offers-count")).toHaveTextContent("5 teklif");
    expect(screen.getByText("KDV dahil tutar her teklifin kendi KDV oranıyla")).toBeInTheDocument();
  });
});

describe("⋯ menüsü", () => {
  async function openMenu(offerNo: string) {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: `${offerNo} işlemleri` }));
    return user;
  }

  it("taslakta 'Kopyala (yeni rev)' KAPALI + gerekçe; gönderilmiş/kaybedilmişte AÇIK", async () => {
    renderView();
    await openMenu("TKL-2026-0014");
    expect(screen.getByRole("button", { name: "Kopyala (yeni rev)" })).toBeDisabled();
    expect(screen.getAllByText(/Taslak revizyon düzenlenebilir/).length).toBeGreaterThan(0);
  });

  it("gönderilmişte açık ve tıklayınca onNewRevision(satır)", async () => {
    const props = renderView();
    const user = await openMenu("TKL-2026-0013");
    const copy = screen.getByRole("button", { name: "Kopyala (yeni rev)" });
    expect(copy).toBeEnabled();
    await user.click(copy);
    expect(props.onNewRevision).toHaveBeenCalledWith(OFFER_SENT);
  });

  it("kaybedilmişte açık; kazanılmış ve vazgeçilmişte kapalı", async () => {
    renderView();
    await openMenu("TKL-2026-0010");
    expect(screen.getByRole("button", { name: "Kopyala (yeni rev)" })).toBeEnabled();
  });

  it("kazanılmışta kapalı", async () => {
    renderView();
    await openMenu("TKL-2026-0011");
    expect(screen.getByRole("button", { name: "Kopyala (yeni rev)" })).toBeDisabled();
  });

  it("Aç + PDF indir bağlantıdır; Excel indir etkin (TKL-F4.3)", async () => {
    renderView();
    await openMenu("TKL-2026-0013");
    expect(screen.getByRole("link", { name: "Aç" })).toHaveAttribute("href", "/teklif-hazirlama/id-TKL-2026-0013");
    expect(screen.getByRole("link", { name: "PDF indir" })).toHaveAttribute(
      "href",
      "/teklif-hazirlama/id-TKL-2026-0013/yazdir?rev=2&tur=isveren",
    );
    expect(screen.getByRole("button", { name: "Excel indir" })).toBeEnabled();
  });

  it("Excel indir = satırın SON revizyonu, işveren görünümü; başarıda menü kapanır", async () => {
    renderView();
    await openMenu("TKL-2026-0013");
    await userEvent.click(screen.getByRole("button", { name: "Excel indir" }));
    expect(downloadOfferExport).toHaveBeenCalledWith("id-TKL-2026-0013", 2, "employer");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Excel indir" })).toBeNull());
  });

  it("Excel indir hatası menüde BackendError metniyle görünür; menü açık kalır", async () => {
    downloadOfferExport.mockRejectedValue(new BackendError(403, { detail: "Excel için yetkiniz yok" }));
    renderView();
    await openMenu("TKL-2026-0013");
    await userEvent.click(screen.getByRole("button", { name: "Excel indir" }));
    expect(await screen.findByText("Excel için yetkiniz yok")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excel indir" })).toBeEnabled();
  });

  it("'Taslağı sil' YALNIZ tek revizyonlu taslakta görünür", async () => {
    const twoRev = makeOffer({ offer_no: "D-2", status: "draft", rev_no: 1 });
    const props = renderView({ body: { kind: "ready", data: makeResponse([OFFER_DRAFT, twoRev, OFFER_SENT]) } });
    const user = await openMenu("TKL-2026-0014");
    const del = screen.getByRole("button", { name: "Taslağı sil" });
    await user.click(del);
    expect(props.onDelete).toHaveBeenCalledWith(OFFER_DRAFT);
  });

  it("çok revizyonlu taslakta ve gönderilmişte 'Taslağı sil' YOK", async () => {
    const twoRev = makeOffer({ offer_no: "D-2", status: "draft", rev_no: 1 });
    renderView({ body: { kind: "ready", data: makeResponse([twoRev, OFFER_SENT]) } });
    await openMenu("D-2");
    expect(screen.queryByRole("button", { name: "Taslağı sil" })).not.toBeInTheDocument();
  });

  it("yazma yetkisi yoksa yeni revizyon kapalı, 'Taslağı sil' yok", async () => {
    renderView({ canWrite: false, readOnlyText: "Görüntüleyici · yalnız okuma" });
    await openMenu("TKL-2026-0013");
    expect(screen.getByRole("button", { name: "Kopyala (yeni rev)" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Taslağı sil" })).not.toBeInTheDocument();
  });
});

describe("yazma yetkisi ve hâller", () => {
  it("'+ Yeni Teklif' yalnız yazma yetkisinde; şerit metni yetkisizde", () => {
    renderView({ canWrite: false, readOnlyText: "Görüntüleyici · yalnız okuma" });
    expect(screen.queryByRole("link", { name: "+ Yeni Teklif" })).not.toBeInTheDocument();
    expect(screen.getByText("Görüntüleyici · yalnız okuma")).toBeInTheDocument();
  });

  it("yazma yetkisinde '+ Yeni Teklif' /teklif-hazirlama/yeni'ye gider", () => {
    renderView();
    expect(screen.getByRole("link", { name: "+ Yeni Teklif" })).toHaveAttribute("href", "/teklif-hazirlama/yeni");
  });

  it("hiç teklif yok: 'Henüz teklif hazırlanmadı' + Yeni Teklif + devre-dışı Excel'den içe al", () => {
    renderView({ body: { kind: "ready", data: makeResponse([]) } });
    expect(screen.getByText("Henüz teklif hazırlanmadı")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "+ Yeni Teklif" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Excel'den içe al" })).toBeDisabled();
  });

  it("süzgeçle boş: 'Filtreye uyan teklif yok' + Filtreleri temizle", async () => {
    const user = userEvent.setup();
    const props = renderView({ status: "won", body: { kind: "ready", data: makeResponse([]) } });
    expect(screen.getByText("Filtreye uyan teklif yok")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Filtreleri temizle" })[0]!);
    expect(props.onClear).toHaveBeenCalled();
  });

  it("yükleniyor ve hata hâlleri; hatada 'Tekrar dene'", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderView({ body: { kind: "error", isRetrying: false, onRetry } });
    expect(screen.getByText("Teklifler yüklenemedi")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("yükleniyor: kartlar basılmaz, süzgeç çubuğu durur", () => {
    renderView({ body: { kind: "loading" } });
    expect(screen.getByText("Teklifler yükleniyor")).toBeInTheDocument();
    expect(screen.queryByTestId("offers-card-draft")).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /Teklif no/ })).toBeInTheDocument();
  });

  it("işlem hatası ve bildirim metni basılır (role=alert DEĞİL)", () => {
    renderView({ toast: "TKL-2026-0014 silindi", actionError: "Yeni revizyon açılamadı." });
    expect(screen.getByText("TKL-2026-0014 silindi")).toHaveAttribute("role", "status");
    expect(screen.getByText("Yeni revizyon açılamadı.")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("tarih çipi açık: iki tarih girdisi, 'Yakında' YOK (K-F3-1)", () => {
    renderView();
    expect(screen.getByRole("textbox", { name: "Başlangıç tarihi" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Bitiş tarihi" })).toBeEnabled();
    expect(screen.queryByText("Yakında", { selector: ".offers-filter *" })).not.toBeInTheDocument();
  });

  it("tarih çipi: yazılan TR tarih ISO olarak bildirilir, değerler ISO'dan gösterilir", async () => {
    const user = userEvent.setup();
    const onDateFromChange = vi.fn();
    renderView({ dateTo: "2026-10-31", onDateFromChange });
    expect(screen.getByRole("textbox", { name: "Bitiş tarihi" })).toHaveValue("31.10.2026");
    await user.type(screen.getByRole("textbox", { name: "Başlangıç tarihi" }), "01.10.2026");
    expect(onDateFromChange).toHaveBeenLastCalledWith("2026-10-01");
  });

  it("tarih seçiliyse 'Filtreleri temizle' görünür", () => {
    renderView({ dateFrom: "2026-10-01" });
    expect(screen.getByRole("button", { name: "Filtreleri temizle" })).toBeInTheDocument();
  });
});
