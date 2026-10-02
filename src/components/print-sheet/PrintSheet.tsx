import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import "./print-sheet.css";

/**
 * PLN-F3.4 · A4 yazdırma sayfası çerçevesi (varsayılan yatay; TKL-F3.7 `orientation`) — GİR yazdırma önizlemesi
 * (`Planlama - Günlük İlerleme Raporu.dc.html:299-386`: 1123×794 px ekran
 * önizlemesi = 297×210 mm A4 yatay; `@page { size: A4 landscape }` gerçek
 * yazdırmada). Sayfa içeriği (`children`) çağıranın (`DailyReportScreen`)
 * sorumluluğundadır — bu bileşen yalnız ÇERÇEVE + sayfa altlığıdır.
 *
 * Ekranda önizleme .ev-print-sheet__page 1123×794 px sabit boyutta kalır
 * (mockup ölçüsü); `@media print`te bu boyut gerçek A4'e devredilir
 * (`print-sheet.css`).
 */
export type PrintSheetOrientation = "landscape" | "portrait";

export interface PrintSheetProps {
  children: ReactNode;
  page: number;
  pageCount: number;
  footer?: ReactNode;
  className?: string;
  /**
   * TKL-F3.7 · sayfa yönü. Varsayılan `landscape` (GİR/QURR bugünkü sabit yatay davranışı, 1123×794 px,
   * `print-sheet.css`teki `@page` yatay kuralı). `portrait` → A4 dikey (794×1123 px); `@page size` belge
   * başına TEK olduğundan dikey sayfa kendi `@page` kuralını `<style>` ile basar (belgede daha geç →
   * CSS dosyasındaki yatay kuralı yener) ve bileşen sökülünce kural da gider.
   */
  orientation?: PrintSheetOrientation;
}

const PORTRAIT_PAGE_RULE = "@media print { @page { size: A4 portrait; margin: 0; } }";

export function PrintSheet({ children, page, pageCount, footer, className, orientation = "landscape" }: PrintSheetProps) {
  const isPortrait = orientation === "portrait";
  return (
    <div
      className={cx("ev-print-sheet", isPortrait && "ev-print-sheet--portrait", className)}
      data-page={page}
      data-page-count={pageCount}
      data-orientation={orientation}
    >
      {isPortrait && <style data-print-page-size>{PORTRAIT_PAGE_RULE}</style>}
      <div className="ev-print-sheet__content">{children}</div>
      {footer != null && (
        <div className="ev-print-sheet__footer">
          {footer}
          <span className="ev-print-sheet__page-no">
            Sayfa {page} / {pageCount}
          </span>
        </div>
      )}
    </div>
  );
}
