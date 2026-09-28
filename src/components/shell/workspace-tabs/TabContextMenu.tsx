"use client";

import { useEffect, useRef, useState } from "react";

import "./workspace-tabs.css";

/** Menünün viewport'a taşmadan bırakacağı en küçük boşluk (px). */
const VIEWPORT_MARGIN = 4;

export interface TabContextMenuProps {
  /** İmlecin ekran koordinatı (`clientX`/`clientY`) — menü buraya sabitlenir. */
  x: number;
  y: number;
  onCloseOthers(): void;
  onCloseRight(): void;
  onCloseAll(): void;
  onDismiss(): void;
  /** Escape ile kapanınca odağın iade edileceği eleman (sağ tıklanan sekme). */
  returnFocusTo: HTMLElement | null;
}

/**
 * Sekme şeridinin sağ tık menüsü — DAVRANIŞ + GÖRSEL (küçük, tek amaçlı).
 *
 * `ui/popover/AnchoredPopover` KULLANILMADI: o bileşen konumunu kendi DOM
 * `parentElement`ının `getBoundingClientRect`ından türetir (bir çapaya göre
 * altta/üstte açılır). Bu menü ise sağ tıklanan İMLEÇ NOKTASINA sabitlenir —
 * aynı sekme üzerinde farklı x/y'de açılabilir, sekmenin kendisi "çapa"
 * değildir. Bu yüzden Escape/dış-tık kapatma mantığı (AnchoredPopover'daki
 * ile AYNI gerekçeyle: `mousedown` — tetikleyici tıklaması dinleyici
 * kurulmadan biter) burada küçük ve bağımsız tekrarlanıyor.
 */
export function TabContextMenu({
  x,
  y,
  onCloseOthers,
  onCloseRight,
  onCloseAll,
  onDismiss,
  returnFocusTo,
}: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  // İlk konum imleç koordinatı (`x`/`y`) — menü boyutu bilinince (mount
  // sonrası, layout etkiden) viewport'a taşmayacak şekilde KIRPILIR (rv3
  // DÜŞÜK bulgusu: sağ/alt kenarda min-width 176px kesiliyordu).
  const [pos, setPos] = useState({ top: y, left: x });

  // Açılınca İLK ÖĞEYE odak (rv3 DÜŞÜK bulgusu: menü açılınca hiçbir şeye
  // odaklanmıyordu — klavye kullanıcısı ok tuşuyla gezinemiyordu).
  useEffect(() => {
    const menu = menuRef.current;
    const firstItem = menu?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    firstItem?.focus();
  }, []);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.width - VIEWPORT_MARGIN);
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.height - VIEWPORT_MARGIN);
    setPos({
      left: Math.min(x, maxLeft),
      top: Math.min(y, maxTop),
    });
  }, [x, y]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        // Odağı sağ tıklanan sekmeye iade et — dış tıklamayla kapanışta
        // (kullanıcı zaten başka bir yere tıkladı) BU yapılmaz, yalnız Escape'te.
        returnFocusTo?.focus();
        return;
      }
      // Menü İÇİ gezinme (uygulama kısayolu DEĞİL — KARARLAR §1.10'daki "ok
      // tuşu kısayolu yok" maddesi GLOBAL kısayollar içindir; bu yalnız menü
      // AÇIKKEN ve odak menü ÖĞESİNDEYKEN çalışır).
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const menu = menuRef.current;
        if (!menu) return;
        const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
        const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
        if (activeIndex === -1) return;
        event.preventDefault();
        const nextIndex =
          event.key === "ArrowDown"
            ? (activeIndex + 1) % items.length
            : (activeIndex - 1 + items.length) % items.length;
        items[nextIndex]?.focus();
      }
    }
    function onPointerDown(event: MouseEvent) {
      const menu = menuRef.current;
      if (menu !== null && !menu.contains(event.target as Node)) onDismiss();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [onDismiss, returnFocusTo]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Sekme seçenekleri"
      className="workspace-tab-menu"
      style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
    >
      <button
        type="button"
        role="menuitem"
        className="workspace-tab-menu__item"
        onClick={() => {
          onCloseOthers();
          onDismiss();
        }}
      >
        Diğerlerini kapat
      </button>
      <button
        type="button"
        role="menuitem"
        className="workspace-tab-menu__item"
        onClick={() => {
          onCloseRight();
          onDismiss();
        }}
      >
        Sağdakileri kapat
      </button>
      <button
        type="button"
        role="menuitem"
        className="workspace-tab-menu__item"
        onClick={() => {
          onCloseAll();
          onDismiss();
        }}
      >
        Tümünü kapat
      </button>
    </div>
  );
}
