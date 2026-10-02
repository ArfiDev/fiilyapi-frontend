"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import {
  paginateByHeights,
  type ClosingMeasure,
  type ClosingPartId,
  type MeasuredRow,
  type OfferPrintPage,
  type PageBudgets,
} from "./print-model";

/**
 * TKL-F3.6.1 · madde 1 — teklif yazdırma sayfalarını tarayıcıda ÖLÇÜLEN yükseklikle yeniden böler.
 *
 * Statik tahmin (`PageLayout`: satır 28px) ilk render içindir. Düzen sonrası (`useLayoutEffect`, boyamadan ÖNCE)
 * her tablo satırının, her kapanış PARÇASININ (`data-print-closing-part`, TKL-F3.8.1) ve sayfa çerçevesinin GERÇEK yüksekliği okunur; `paginateByHeights`
 * (saf) yeni sayfa kümesini verir. Hiçbir metin kırpılmaz: uzun iş adı/kapsam/koşul/grup adı satırı büyütür,
 * sayfa bölünmesi buna uyar. Yerleşim ölçülemezse (jsdom/SSR: yükseklikler 0) statik sayfalama aynen kalır.
 *
 * Kök (`rootRef`) yalnız sayfaları saran `display: contents` kabıdır; ekran/baskı yerleşimini değiştirmez.
 */
export interface MeasurableRow {
  key: string;
  groupId: string;
}

/** Altlık (alt çizgi + sayfa no) için içerik alanından düşülen pay (plan §5: ≈ 40px). */
const FOOTER_RESERVE = 40;
/** Sınır çizgisi/yuvarlama gürültüsüne karşı pay. */
const SAFETY = 6;
/** `.ev-print-sheet__content` çocukları arası boşluk (print-sheet.css). */
const CONTENT_GAP = 10;
/** `.offer-print__closing` üst boşluğu (offer-print.css). */
const CLOSING_MARGIN = 8;
/** `.offer-print__closing` parçaları arası boşluk (offer-print.css `gap`). */
const CLOSING_PART_GAP = 12;
/** Yalnız tek sayfa ölçülmüşken sonraki sayfa çerçevesi için tahmin: çalışan başlık satırı. */
const RUNNING_HEAD_ESTIMATE = 28;
const DEFAULT_CONTINUED_HEAD = 28;
/** Yeniden bölme birkaç turda oturur; takılırsa son sonuç kalır. */
const MAX_PASSES = 4;

const SHEET = ".ev-print-sheet";
const CONTENT = ".ev-print-sheet__content";

function heightOf(element: Element): number {
  return element.getBoundingClientRect().height;
}

interface SheetMeasure {
  contentHeight: number;
  /** İçerik çocuklarından tablo ve kapanış DIŞINDAKİLERİN yüksekliği + tablo başı + aralarındaki boşluklar. */
  chrome: number;
}

function measureSheet(sheet: Element): SheetMeasure | null {
  const content = sheet.querySelector<HTMLElement>(CONTENT);
  if (content === null) return null;
  const children = Array.from(content.children).filter((child) => !child.hasAttribute("data-print-closing"));
  let chrome = CONTENT_GAP * Math.max(0, children.length - 1);
  for (const child of children) {
    chrome += child.tagName === "TABLE" ? (child.querySelector("thead") === null ? 0 : heightOf(child.querySelector("thead")!)) : heightOf(child);
  }
  return { contentHeight: content.clientHeight, chrome };
}

function budgetOf(measure: SheetMeasure): number {
  return measure.contentHeight - FOOTER_RESERVE - SAFETY - measure.chrome;
}

/** Basılacak her kapanış parçasının ölçülen yüksekliği; biri ölçülemezse `null`. */
function readClosing(root: HTMLElement, ids: readonly ClosingPartId[]): ClosingMeasure[] | null {
  const measures = ids.map((id) => {
    const element = root.querySelector(`[data-print-closing-part="${id}"]`);
    return { id, height: element === null ? 0 : heightOf(element) };
  });
  return measures.some((measure) => measure.height <= 0) ? null : measures;
}

function readBudgets(root: HTMLElement, closingIds: readonly ClosingPartId[]): PageBudgets | null {
  const sheets = Array.from(root.querySelectorAll(SHEET));
  const first = sheets[0] === undefined ? null : measureSheet(sheets[0]);
  if (first === null || first.contentHeight <= 0) return null;
  const second = sheets[1] === undefined ? null : measureSheet(sheets[1]);
  const restChrome = second === null ? first.chrome - firstOnlyHeight(root) + RUNNING_HEAD_ESTIMATE : second.chrome;
  const rest = budgetOf({ contentHeight: first.contentHeight, chrome: restChrome });
  const closing = readClosing(root, closingIds);
  if (closing === null) return null;
  const continuedElement = root.querySelector("[data-print-continued]");
  return {
    first: budgetOf(first),
    rest,
    closing,
    closingLead: CLOSING_MARGIN + CONTENT_GAP,
    closingGap: CLOSING_PART_GAP,
    continuedHead: continuedElement === null ? DEFAULT_CONTINUED_HEAD : heightOf(continuedElement),
  };
}

/** İlk sayfaya özgü üst bloklar (başlık + künye) — tek sayfa ölçülmüşken sonraki sayfa tahmininde çıkarılır. */
function firstOnlyHeight(root: HTMLElement): number {
  const first = root.querySelector(`${SHEET} ${CONTENT}`);
  if (first === null) return 0;
  return Array.from(first.children)
    .filter((child) => child.tagName !== "TABLE" && !child.hasAttribute("data-print-closing"))
    .reduce((sum, child) => sum + heightOf(child) + CONTENT_GAP, 0);
}

function readHeights(root: HTMLElement): Map<string, number> {
  const heights = new Map<string, number>();
  for (const element of Array.from(root.querySelectorAll("[data-print-row]"))) {
    heights.set(element.getAttribute("data-print-row")!, heightOf(element));
  }
  return heights;
}

export function pagesSignature<Row extends MeasurableRow>(pages: readonly OfferPrintPage<Row>[]): string {
  return pages
    .map(
      (page) =>
        `${page.parts.map((part) => `${part.continued ? "~" : ""}${part.rows.map((row) => row.key).join(",")}`).join("|")}#${page.closing.join(",")}`,
    )
    .join("||");
}

/** Statik sayfalardan yeniden bölünmüş sayfalar; ölçülemezse `null`. */
export function remeasurePages<Row extends MeasurableRow>(
  root: HTMLElement,
  rows: readonly Row[],
  closingIds: readonly ClosingPartId[],
): OfferPrintPage<Row>[] | null {
  const budgets = readBudgets(root, closingIds);
  if (budgets === null) return null;
  const heights = readHeights(root);
  if (rows.some((row) => (heights.get(row.key) ?? 0) <= 0)) return null;
  const entries: MeasuredRow<Row>[] = rows.map((row) => ({ row, height: heights.get(row.key)! }));
  return paginateByHeights(entries, budgets);
}

export function useMeasuredPages<Row extends MeasurableRow>(
  staticPages: OfferPrintPage<Row>[],
): { pages: OfferPrintPage<Row>[]; rootRef: RefObject<HTMLDivElement | null> } {
  const rootRef = useRef<HTMLDivElement>(null);
  const source = pagesSignature(staticPages);
  const [measured, setMeasured] = useState<{ source: string; pages: OfferPrintPage<Row>[] } | null>(null);
  const [fontsTick, setFontsTick] = useState(0);
  const pages = measured !== null && measured.source === source ? measured.pages : staticPages;
  const passes = useRef({ key: "", count: 0 });
  const signature = pagesSignature(pages);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const key = `${source}#${fontsTick}`;
    if (passes.current.key !== key) passes.current = { key, count: 0 };
    if (passes.current.count >= MAX_PASSES) return;
    passes.current.count += 1;
    const rows = staticPages.flatMap((page) => page.parts.flatMap((part) => part.rows));
    const closingIds = staticPages.flatMap((page) => page.closing);
    const next = remeasurePages(root, rows, closingIds);
    if (next !== null && pagesSignature(next) !== signature) setMeasured({ source, pages: next });
    // `staticPages` kimliği her üst render'da değişebilir; içerik kimliği `source`tur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, signature, fontsTick]);

  // Yazı tipi geç yüklenirse satır yükseklikleri değişir: yüklenince yeniden ölç.
  useLayoutEffect(() => {
    let isActive = true;
    void document.fonts?.ready.then(() => {
      if (isActive) setFontsTick((tick) => tick + 1);
    });
    return () => {
      isActive = false;
    };
  }, []);

  return { pages, rootRef };
}
