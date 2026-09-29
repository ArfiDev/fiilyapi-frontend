"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/cx";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import "./modal.css";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /**
   * Diyalog kabuğuna eklenen sınıf. Varsayılan genişlik (480px) mockup'ı iki
   * kolonlu çizilmiş formlara dar geldiğinde kullanılır — davranış değişmez.
   */
  className?: string;
  /**
   * Kayıt 50 — form "kirli" (touched/dirty) iken arka plana yanlışlıkla
   * tıklamak, onay sormadan diyaloğu kapatıp veri kaybına yol açıyordu.
   * `true` verilirse arka plan tıklamasında `window.confirm` sorulur;
   * OPSİYONELdir ve varsayılan `false` — geçmeyen çağıranların davranışı
   * DEĞİŞMEZ (additive, F-BLG T2a deseni).
   */
  isDirty?: boolean;
  /**
   * DSC-F1.2 · Başlığın altındaki ikincil satır (ör. kullanıcı adı · unvan).
   * OPSİYONEL — verilmezse başlık kabuğu BİREBİR eskisi gibi çizilir.
   */
  subtitle?: React.ReactNode;
  /** DSC-F1.2 · Başlığın solundaki öğe (ör. avatar). Opsiyonel, `subtitle` ile aynı kural. */
  leading?: React.ReactNode;
}

// Odaklanabilir ogeler — `aria-modal` tek basina tarayicida Tab'i hapsetmez,
// bu yuzden tuzak elle kurulur (a11y bulgusu: klavye kullanicisi diyalogdan
// disari sekmeliyordu).
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableElementsOf(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    // `hidden`/`display:none` ogeler Tab sirasinda yer almaz. jsdom'da
    // offsetParent guvenilir degil, bu yuzden yalniz acik gizleme elenir.
    (element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true",
  );
}

export function Modal({ title, onClose, children, footer, className, isDirty = false, subtitle, leading }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useUnsavedChanges(isDirty, "Diyalog");

  function handleOverlayClick() {
    if (isDirty && !window.confirm("Kaydedilmemiş değişiklikleriniz var. Kapatmak istediğinize emin misiniz?")) {
      return;
    }
    onClose();
  }

  // Acilista odagi diyalogun icine tasi; kapanista tetikleyen ogeye geri ver.
  // Bagimlilik listesi bilerek bos: yeniden render'da odak calinmamali.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog) {
      const [first] = focusableElementsOf(dialog);
      (first ?? dialog).focus();
    }
    return () => {
      // Tetikleyici bu arada DOM'dan cikmis olabilir — sessizce vazgec.
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  // Kayıt 58: diyalog açıkken ARKA PLAN kaydırılabilir kalıyordu.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = focusableElementsOf(dialog);
      if (focusables.length === 0) {
        // Odaklanacak ogesi olmayan diyalog: Tab hicbir yere gitmesin.
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!active || !dialog.contains(active)) {
        // Odak bir sekilde disari kacmis — geri al.
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="modal-overlay" role="presentation" onClick={handleOverlayClick}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cx("modal", className)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__head">
          {subtitle || leading ? (
            <div className="modal__head-lead">
              {leading}
              <div className="modal__head-text">
                <h2 className="modal__title">{title}</h2>
                {subtitle && <p className="modal__subtitle">{subtitle}</p>}
              </div>
            </div>
          ) : (
            <h2 className="modal__title">{title}</h2>
          )}
          <button type="button" className="modal__close" aria-label="Kapat" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
