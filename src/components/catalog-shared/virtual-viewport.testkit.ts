/**
 * jsdom yerleşim hesaplamaz: kaydırma kabı ve satırlar 0 yükseklik görür → sanallaştırıcı (VIRTUALIZE_MIN_ROWS ve üstü)
 * HİÇ satır basmaz. Bu yardımcı `offsetHeight/offsetWidth` (kap ölçümü) ve `getBoundingClientRect` (satır ölçümü) taklit eder:
 * `data-index` taşıyan sanal satırlar `rowHeight`, diğer her şey (kaydırma kabı) `viewportHeight` yüksekliğinde görünür;
 * pencere yüksekliği de `viewportHeight` olur. Dönen işlev taklidi GERİ alır (afterEach'te çağır).
 *
 * `vitest` ithal ETMEZ (src/ altındaki test-dışı dosya `vitest`e bağlanamaz: ürün grafiğine sızma bekçisi).
 */
export function mockVirtualViewport({ viewportHeight = 640, rowHeight = 64, width = 1200 } = {}): () => void {
  const heightOf = (element: Element) => (element.hasAttribute("data-index") ? rowHeight : viewportHeight);
  const originalInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
  const originalRect = Element.prototype.getBoundingClientRect;
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");

  Object.defineProperty(window, "innerHeight", { configurable: true, value: viewportHeight });
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const height = heightOf(this);
    // Belge akışında en tepede duran kap: görünüm penceresine göre üstü = -kaydırma (listenin belge ofseti 0 kalır).
    const top = this.hasAttribute("data-index") ? 0 : -window.scrollY;
    return { x: 0, y: top, top, left: 0, right: width, bottom: top + height, width, height, toJSON: () => ({}) } as DOMRect;
  };
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return heightOf(this);
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => width });

  return () => {
    if (originalInnerHeight) Object.defineProperty(window, "innerHeight", originalInnerHeight);
    Element.prototype.getBoundingClientRect = originalRect;
    if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
    if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
  };
}
