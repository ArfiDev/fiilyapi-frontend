/**
 * SIL-F1.2 · Sayfa değişiminden SONRA da görünen tek seferlik bildirim.
 *
 * Silme sonrası kullanıcı üst listeye yönlendirilir; bildirimi silinen kaydın
 * ekranı taşıyamaz (ekran kapanır). Bellek içi küçük bir depodur: istemci
 * tarafı gezinti sayfayı yeniden yüklemez, bu yüzden depo yaşar. Tam sayfa
 * yenilemede kaybolması kabul edilir (bildirim bilgilendiricidir, durum DEĞİL).
 */
export interface FlashNotice {
  /** Her bildirimde artar — aynı metin art arda gelse de ana bilgisayar yeniden çizilir. */
  id: number;
  message: string;
}

type Listener = () => void;

let current: FlashNotice | null = null;
let nextId = 1;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function showFlashNotice(message: string): void {
  current = { id: nextId++, message };
  emit();
}

export function dismissFlashNotice(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function subscribeFlashNotice(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFlashNotice(): FlashNotice | null {
  return current;
}
