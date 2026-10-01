"use client";

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { cx } from "@/lib/cx";
import { XIcon } from "@/components/ui/icons";

import { TabContextMenu } from "./TabContextMenu";
import "./workspace-tabs.css";

export interface WorkspaceTabsStripTab {
  id: string;
  title: string;
  url: string;
  pinned: boolean;
}

export interface WorkspaceTabsStripProps {
  tabs: readonly WorkspaceTabsStripTab[];
  activeId: string;
  onSelect(id: string): void;
  onClose(id: string): void;
  onCloseOthers(id: string): void;
  onCloseRight(id: string): void;
  onCloseAll(): void;
  onReorder(id: string, toIndex: number): void;
}

interface ContextMenuState {
  x: number;
  y: number;
  targetId: string;
}

interface DragState {
  draggedId: string;
  overId: string | null;
  side: "before" | "after" | null;
}

/** Başındaki `pinned` sekmelerin sayısı — bunların ÖNÜNE bırakma yasak. */
function pinnedLeadingCount(tabs: readonly WorkspaceTabsStripTab[]): number {
  let count = 0;
  for (const tab of tabs) {
    if (!tab.pinned) break;
    count++;
  }
  return count;
}

/**
 * Topbar çalışma sekmeleri şeridi — SUNUMSAL bileşen (SEKME-F1.4b).
 *
 * Store/router/oturum BİLMEZ: yalnız prop okur, olay yayar. Bağlama takma
 * (Topbar.tsx, store) paralel ajan F1.4a'nın işi.
 *
 * TASARIM KARARLARI (KARARLAR.md §1.10, mockup YOK — kullanıcı onayı ile):
 * - SEKME-F1.4c (kullanıcı onayı, daralma kuralının YERİNİ ALIR): sekme adı
 *   KISALTILMAZ, genişlik içeriğe göre belirlenir (`flex: 0 0 auto`); tek
 *   güvenlik sınırı `.workspace-tab` `max-width: 320px`. Sığmayan sekmeler
 *   `.workspace-tabs__list`in `overflow-x: auto`suyla YATAY KAYAR.
 * - "Daha fazla var" ipucu: `updateEdgeFade` gerçek kayma varlığını
 *   (`scrollLeft`/`scrollWidth`/`clientWidth`) ölçer, yalnız o yönde kayma
 *   MÜMKÜNKEN `workspace-tabs--fade-left/right` sınıfını takar. `ResizeObserver`
 *   BİLEREK kullanılmadı (jsdom'da yok, karmaşıklık artırır) — `scroll` +
 *   `resize` dinleyicisi ve sekme sayısı değiştiğinde yeniden ölçüm yeterli.
 * - Kaydırma animasyonu: aktif sekme görünür alana `list.scrollTo({ left,
 *   behavior: "auto" })` ile taşınır — `"auto"` listenin CSS
 *   `scroll-behavior`ına UYAR (MDN). Liste normalde `scroll-behavior:
 *   smooth`, `prefers-reduced-motion: reduce` altında `auto`ya düşer
 *   (`workspace-tabs.css`). Böylece azaltılmış hareket tercihi JS'te
 *   `matchMedia` YAZMADAN, tek bir CSS medya sorgusuyla karşılanır.
 *   SEKME-F2 O1 (ÖLÇÜLDÜ): hedef ELLE hesaplanır — native
 *   `scrollIntoView({inline:"nearest"})` sol (sticky panel) kenarı
 *   karşılanınca sağ kenarı hiç kontrol etmeden durabiliyordu; ayrıntı
 *   `scrollActiveIntoView`in kendi yorumunda.
 */
export function WorkspaceTabsStrip({
  tabs,
  activeId,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseRight,
  onCloseAll,
  onReorder,
}: WorkspaceTabsStripProps): JSX.Element {
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  // `role="tab"` artık dış sarmalayıcının (`tabRefs`) İÇİNDE ayrı bir eleman
  // (`.workspace-tab__hit`) — sağ tık menüsü Escape'te odağı BUNA iade eder
  // (dış sarmalayıcının kendi `tabIndex`i yok, `.focus()` no-op kalırdı).
  const tabHitRefs = useRef(new Map<string, HTMLDivElement>());
  const listRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [edgeFade, setEdgeFade] = useState({ left: false, right: false });

  // SEKME-F2 O1 bulgusu (ÖLÇÜLDÜ, `workspace-tabs.spec.ts` "O1) dar ekranda
  // aktif sekme ŞERİT İÇİNDE TAM görünür"): aktif sekmeyi kaydırma artık AYRI
  // bir efekt DEĞİL — panel genişliğini ölçen efektin (aşağıda) İÇİNE taşındı
  // VE artık native `scrollIntoView("nearest")`e DEĞİL, ELLE hesaplanmış bir
  // `scrollTo`ya dayanıyor. İKİ ayrı ÖLÇÜLMÜŞ kusur vardı:
  //
  // (1) Eskiden kaydırma yalnız `activeId` değişince, panel-genişliği
  //     ölçülmeden ÖNCE (ayrı bir efekt, TANIM SIRASI yüzünden önce
  //     çalışıyordu) tetikleniyordu — `--pinned-tab-width` henüz
  //     yazılmamışken `scroll-padding-inline-start` `var(..., 0px)`e
  //     düşüyor, kaydırma sticky panelin ARKASINDA kalan genişliği hesaba
  //     KATMADAN duruyordu (aktif sekme %0 görünür). SONRAKİ bir ölçüm
  //     CSS değişkenini düzeltiyordu ama tarayıcı GEÇMİŞ bir
  //     `scrollIntoView` çağrısını YENİDEN OYNATMIYORDU.
  // (2) Bu SIRALAMA düzeltilse bile (kaydırma HER ölçümden SONRA yeniden
  //     uygulansa da) native `scrollIntoView({inline:"nearest"})` +
  //     `scroll-padding-inline-start` ikilisi tarayıcıda TAM görünürlüğü
  //     GARANTİ ETMİYOR: ölçüldü (768px, `/ayarlar/onay-rolleri`) — aktif
  //     sekme sığacak kadar boşluk (47px > sekme 41,5px) olduğu hâlde
  //     tarayıcı yalnız %87'sini (36/41,5px) görünür kılıp DURUYORDU
  //     ("nearest" sol kenar koşulu karşılanınca sağ kenarı KONTROL ETMEDEN
  //     duruyor gibi davranıyor). Çözüm: kaydırma HEDEFİ artık `scrollTo`ya
  //     ELLE hesaplanmış bir `scrollLeft` olarak veriliyor — panelin sağından
  //     başlayan VE şeridin sağ kenarında biten görünür pencereye göre sol/
  //     sağ taşmayı AYRI AYRI kontrol eder, ikisi de aşılmıyorsa dokunmaz.
  //
  // Kaydırma HER ölçümden SONRA (ilk ölçüm + font hazır olunca + boyut
  // değişince) yeniden uygulanır, aşağıdaki tek efektte.

  // rv3 N14/kenar-solması bulgusu: eskiden yalnız `tabs.length` bağımlıydı —
  // sekme SAYISI değişmeden bir başlık uzayıp/kısalırsa (aktif sekmenin url'i
  // aynı modülde güncellenip başlık değişmeden kalsa bile genişlik değişebilir)
  // kayma ölçümü YENİLENMİYORDU. Başlıkların birleşik imzası da bağımlılığa
  // eklendi — sekme SAYISI aynı kalıp yalnız METİN değişse bile yeniden ölçülür.
  const titleSignature = tabs.map((tab) => `${tab.id}:${tab.title}`).join("|");

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    function updateEdgeFade() {
      if (!list) return;
      const { scrollLeft, scrollWidth, clientWidth } = list;
      setEdgeFade({
        left: scrollLeft > 0,
        right: scrollLeft + clientWidth < scrollWidth - 1,
      });
    }
    updateEdgeFade();
    list.addEventListener("scroll", updateEdgeFade, { passive: true });
    window.addEventListener("resize", updateEdgeFade);
    return () => {
      list.removeEventListener("scroll", updateEdgeFade);
      window.removeEventListener("resize", updateEdgeFade);
    };
  }, [tabs.length, titleSignature]);

  // Panel (`.workspace-tab--pinned`) STICKY olduğu için `scrollIntoView`
  // ("nearest") aktif sekmeyi panelin ALTINA kaydırabilir — `workspace-tabs.css`
  // bunu `scroll-padding-inline-start: var(--pinned-tab-width)` ile önler.
  // Değer burada ÖLÇÜLÜR (panel genişliği içeriğe göre değişir) ve CSS
  // özel özelliği olarak listeye yazılır.
  //
  // rv3 N14 bulgusu (DÜŞÜK, kör bekçi): font yüklenmeden ÖNCE ölçülürse
  // (fallback genişlik) değer yanlış donuyordu — `document.fonts.ready`
  // sonrası YENİDEN ölçülür. Panel içeriği aynı kalsa da PANEL kutusunun
  // genişliği layout'a bağlı değişebileceğinden (ör. pencere/parent yeniden
  // boyutlanınca) `ResizeObserver` ile de izlenir; jsdom'da tanımsız
  // olabileceğinden güvenli düşüşle (varlık kontrolü) atlanır.
  //
  // SEKME-F2 O1 (b): `list`in KENDİSİ de gözlemlenir — kırıntı/çıkış
  // düğmesi yerleşince ya da pencere/panel genişliği değişince şeridin
  // GENİŞLİĞİ değişir; bu da "aktif sekme görünür mü" hesabını etkiler.
  // Her ölçümden SONRA aktif sekme YENİDEN kaydırılır (`scrollActiveIntoView`)
  // — yukarıdaki O1 bulgusunun düzeltmesi.
  useEffect(() => {
    const list = listRef.current;
    const leadingPinnedTab = tabs.find((tab) => tab.pinned);
    const pinnedEl = leadingPinnedTab ? tabRefs.current.get(leadingPinnedTab.id) : undefined;
    if (!list || !pinnedEl) return;

    // ELLE hesaplanmış "nearest" — bkz. yukarıdaki (2) bulgusu: native
    // `scrollIntoView`in aksine sol (panel) VE sağ (şerit sonu) kenarları
    // AYRI AYRI kontrol eder, ikisi de aşılmıyorsa `list.scrollLeft`e
    // DOKUNMAZ (gereksiz/salınımlı kaydırma yok).
    //
    // 🔴 SEKME-F2 O1 (3. bulgu, ÖLÇÜLDÜ): hedef `tabRefs` (DIŞ sarmalayıcı —
    // başlık + × düğmesi + iç boşluklar, ör. 91,5px) DEĞİL `tabHitRefs` (İÇ
    // `role="tab"` — yalnız başlık, ör. 41,5px) ile alınır. Dar ekranda
    // (768px, panel ~123px) panelden ARTAN alan (~47px) DIŞ sarmalayıcıyı
    // BARINDIRAMAZ (91,5 > 47) — × düğmesini de görünür kılmaya çalışmak
    // matematiksel olarak İMKÂNSIZ bir hedef kovalar ve düzeltme hep başlığın
    // solundan FEDA EDERDİ (ölçüldü: yalnız 21/41,5px başlık görünür kalıyordu).
    // Erişilebilirlik açısından "sekme" zaten İÇ elemandır (`role="tab"`,
    // `aria-selected`) — kullanıcının OKUMASI gereken de budur; × ikincil bir
    // eylemdir ve dar alanda GEÇİCİ OLARAK panelin arkasında kalabilir, tıpkı
    // tarayıcı sekmelerinde olduğu gibi. İç eleman panelden artan alana
    // SIĞDIĞI için (41,5 < 47) bu hedef her zaman TAM karşılanabilir.
    function scrollActiveIntoView(pinnedWidthPx: number) {
      // Aktif sekme panelin KENDİSİYSE (`.workspace-tab--pinned` STICKY,
      // her zaman görünür) kaydırılacak bir şey yoktur — hesap onu "panelin
      // solunda" sanıp şeridi boşuna panel genişliği kadar sola kaydırırdı.
      if (tabs.find((tab) => tab.id === activeId)?.pinned) return;
      const active = tabHitRefs.current.get(activeId);
      if (!list || !active) return;
      const listRect = list.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      // `getBoundingClientRect` VIEWPORT koordinatı verir — şeridin KAYDIRILAN
      // İÇERİK koordinatına çevirmek için mevcut `scrollLeft` eklenir.
      const contentLeft = activeRect.left - listRect.left + list.scrollLeft;
      let contentRight = contentLeft + activeRect.width;
      // FLK-F1 (38px kaynağı, ÖLÇÜLDÜ 1440px: dış sarmalayıcı sağı − hit sağı
      // = 38px = × düğmesi + iç boşluk): yalnız hit öğesi görünür kılınınca
      // × şeridin sağında KIRPILI kalıyordu. Panelden artan alan dış
      // sarmalayıcıyı BARINDIRIYORSA (geniş ekran) sağ kenar sarmalayıcıya
      // göre hesaplanır; barındırmıyorsa (768px, bkz. yukarıdaki 3. bulgu)
      // davranış DEĞİŞMEZ: hedef yalnız hit öğesidir.
      const wrapperRect = tabRefs.current.get(activeId)?.getBoundingClientRect();
      if (wrapperRect && wrapperRect.width <= list.clientWidth - pinnedWidthPx) {
        const wrapperRight = wrapperRect.left - listRect.left + list.scrollLeft + wrapperRect.width;
        if (wrapperRight > contentRight) contentRight = wrapperRight;
      }
      const viewLeft = list.scrollLeft + pinnedWidthPx;
      const viewRight = list.scrollLeft + list.clientWidth;

      // Panelden ARTAN alana sığmayan başlık (ölçüldü: bölüm sayfası 768px'te
      // 95px başlık / 44px alan) TAM gösterilemez — o zaman başlığın BAŞI
      // panelin hemen sağına hizalanır (sağ kenara hizalamak başlığın okunan
      // kısmını panelin ARKASINA saklardı).
      const availablePx = list.clientWidth - pinnedWidthPx;
      let target: number | undefined;
      if (activeRect.width > availablePx || contentLeft < viewLeft) {
        target = contentLeft - pinnedWidthPx;
      } else if (contentRight > viewRight) {
        target = contentRight - list.clientWidth;
      }
      if (target === undefined || Math.abs(target - list.scrollLeft) < 1) return;

      const maxScrollLeft = Math.max(0, list.scrollWidth - list.clientWidth);
      const clamped = Math.max(0, Math.min(target, maxScrollLeft));
      // `?.()`: jsdom `Element.scrollTo`yu hiç tanımlamaz (ölçüldü); testler
      // bunu global olarak mock'lar, üretimde her tarayıcıda mevcuttur.
      // `behavior: "auto"` listenin KENDİ CSS `scroll-behavior`ına uyar
      // (`workspace-tabs.css` — normalde smooth, azaltılmış hareket
      // tercihinde auto).
      list.scrollTo?.({ left: clamped, behavior: "auto" });
    }

    function measureAndScroll() {
      if (!list || !pinnedEl) return;
      const pinnedWidthPx = pinnedEl.getBoundingClientRect().width;
      list.style.setProperty("--pinned-tab-width", `${pinnedWidthPx}px`);
      scrollActiveIntoView(pinnedWidthPx);
    }

    measureAndScroll();

    let cancelled = false;
    void document.fonts?.ready?.then(() => {
      if (!cancelled) measureAndScroll();
    });

    const ResizeObserverCtor = typeof ResizeObserver === "undefined" ? undefined : ResizeObserver;
    const observer = ResizeObserverCtor ? new ResizeObserverCtor(measureAndScroll) : undefined;
    observer?.observe(pinnedEl);
    observer?.observe(list);
    // FLK-F1: AKTİF sekmenin (hit öğesi) genişliği ölçümden SONRA değişirse
    // (geç başlık, ×, font) liste kutusu aynı kalır — yeniden kaydırma yalnız
    // bu gözlemle tetiklenir.
    const activeHitEl = tabHitRefs.current.get(activeId);
    if (activeHitEl) observer?.observe(activeHitEl);

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [tabs, activeId]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, id: string) {
    // rv3 ORTA bulgusu: × düğmesi (eskiden bu div'in İÇİNDE) odaklıyken Enter/
    // Space basılırsa keydown bu handler'a KABARIYOR (bubble) ve `onSelect`i
    // tetikleyip `preventDefault` düğmenin kendi tıklama üretimini engelliyordu
    // — close hiç çağrılmıyordu. × artık role=tab'in KARDEŞİ (bkz. render),
    // bu yüzden normal kullanımda bu dal artık tetiklenmez; yine de savunma
    // amaçlı KORUNUR — olay bu elemanın KENDİSİNDEN gelmiyorsa yok say.
    if (event.target !== event.currentTarget) return;
    // KARARLAR §1.10: ok tuşu gezinmesi YOK (kısayol sayılır) — yalnız
    // Enter/Space seçer, başka hiçbir tuş burada ele alınmaz.
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  }

  function handleAuxClick(event: MouseEvent<HTMLDivElement>, tab: WorkspaceTabsStripTab) {
    // Orta tık (button === 1) sekmeyi kapatır — pinned hariç.
    if (event.button === 1 && !tab.pinned) onClose(tab.id);
  }

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    // Orta tık varsayılan otomatik kaydırmayı (autoscroll ikonu) engelle.
    if (event.button === 1) event.preventDefault();
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, tab: WorkspaceTabsStripTab) {
    if (tab.pinned) return;
    event.dataTransfer.setData("text/plain", tab.id);
    event.dataTransfer.effectAllowed = "move";
    setDragState({ draggedId: tab.id, overId: null, side: null });
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, tab: WorkspaceTabsStripTab) {
    if (!dragState) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const side: "before" | "after" = event.clientX < rect.left + rect.width / 2 ? "before" : "after";
    setDragState((prev) => (prev ? { ...prev, overId: tab.id, side } : prev));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, tab: WorkspaceTabsStripTab) {
    event.preventDefault();
    if (!dragState) return;
    // Kendi üstüne bırakma: no-op (rv3 bulgusu).
    if (dragState.draggedId === tab.id) {
      setDragState(null);
      return;
    }
    const targetIndex = tabs.findIndex((candidate) => candidate.id === tab.id);
    const rawIndex = dragState.side === "before" ? targetIndex : targetIndex + 1;
    // rv3 YÜKSEK bulgusu: `tabs-reducer.ts`teki `reorderTab` sürükleneni
    // ÖNCE dizi dışına alır, SONRA `toIndex`e ekler — yani `toIndex`
    // sürüklenen ÇIKARILMIŞ dizideki hedef konumdur. Burada `rawIndex` ise
    // sürüklenen HÂLÂ dizideyken hesaplanıyor: sürüklenen hedeften ÖNCE
    // (`fromIndex < rawIndex`, yani sağa doğru bir taşıma) ise, sürüklenen
    // çıkarılınca ondan SONRAKİ tüm elemanlar bir index SOLA kayar — `rawIndex`
    // de aynı miktarda kırpılmalı, yoksa her sağa sürükleme bir fazla ileri
    // gidiyordu (3 sekmeyle test kırpılıp tesadüfen doğru çıkıyordu).
    const fromIndex = tabs.findIndex((candidate) => candidate.id === dragState.draggedId);
    const adjustedIndex = fromIndex !== -1 && fromIndex < rawIndex ? rawIndex - 1 : rawIndex;
    // Gösterge Paneli her zaman ilk sekme: 0'a bırakma KIRPILIR (1'e), yok
    // sayılmaz — kullanıcının "en sola" niyeti pinned sekmenin hemen
    // ardındaki konuma çevrilir; sessizce hiçbir şey olmaması yerine.
    const minIndex = pinnedLeadingCount(tabs);
    const toIndex = Math.max(Math.min(adjustedIndex, tabs.length), minIndex);
    onReorder(dragState.draggedId, toIndex);
    setDragState(null);
  }

  function handleDragEnd() {
    setDragState(null);
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>, tab: WorkspaceTabsStripTab) {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, targetId: tab.id });
  }

  return (
    <div
      className={cx(
        "workspace-tabs",
        edgeFade.left && "workspace-tabs--fade-left",
        edgeFade.right && "workspace-tabs--fade-right",
      )}
    >
      <div
        ref={listRef}
        className="workspace-tabs__list"
        role="tablist"
        aria-label="Çalışma sekmeleri"
        onDragOver={(event) => {
          if (dragState) event.preventDefault();
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          const isDragOver = dragState?.overId === tab.id;
          // rv3 ORTA bulgusu: × düğmesi eskiden role=tab'in İÇİNDEYDİ (axe
          // "nested-interactive" — role=tab içinde etkileşimli öğe yasak) ve
          // sekmenin erişilebilir adı "Proje B Proje B sekmesini kapat" gibi
          // KİRLENİYORDU (ad, alt ağaçtaki × düğmesinin kendi aria-label'ını
          // da yutuyor). Düzeltme: role=tab yalnız BAŞLIĞI saran KARDEŞ bir
          // eleman (`.workspace-tab__hit`), × düğmesi onun DIŞINDA, aynı ortak
          // sarmalayıcının (`.workspace-tab`) İKİNCİ çocuğu. Tıklama/sürükleme/
          // sağ-tık gibi "tüm pilli" davranışlar sarmalayıcıda KALIR — görsel
          // (flex/padding/renk) sarmalayıcıdan geldiği için DEĞİŞMEZ.
          return (
            <div
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              draggable={!tab.pinned}
              className={cx(
                "workspace-tab",
                tab.pinned && "workspace-tab--pinned",
                isActive && "workspace-tab--active",
                dragState?.draggedId === tab.id && "workspace-tab--dragging",
                isDragOver && dragState?.side === "before" && "workspace-tab--drop-before",
                isDragOver && dragState?.side === "after" && "workspace-tab--drop-after",
              )}
              onClick={() => onSelect(tab.id)}
              onAuxClick={(event) => handleAuxClick(event, tab)}
              onMouseDown={handleMouseDown}
              onContextMenu={(event) => handleContextMenu(event, tab)}
              onDragStart={(event) => handleDragStart(event, tab)}
              onDragOver={(event) => handleDragOver(event, tab)}
              onDrop={(event) => handleDrop(event, tab)}
              onDragEnd={handleDragEnd}
            >
              <div
                ref={(el) => {
                  if (el) tabHitRefs.current.set(tab.id, el);
                  else tabHitRefs.current.delete(tab.id);
                }}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                title={tab.title}
                draggable={!tab.pinned}
                className="workspace-tab__hit"
                onKeyDown={(event) => handleKeyDown(event, tab.id)}
              >
                <span className="workspace-tab__title">{tab.title}</span>
              </div>
              {!tab.pinned && (
                <button
                  type="button"
                  className="workspace-tab__close"
                  aria-label={`${tab.title} sekmesini kapat`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(tab.id);
                  }}
                >
                  <XIcon width={10} height={10} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {menu && (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          onCloseOthers={() => onCloseOthers(menu.targetId)}
          onCloseRight={() => onCloseRight(menu.targetId)}
          onCloseAll={onCloseAll}
          onDismiss={() => setMenu(null)}
          returnFocusTo={tabHitRefs.current.get(menu.targetId) ?? null}
        />
      )}
    </div>
  );
}
