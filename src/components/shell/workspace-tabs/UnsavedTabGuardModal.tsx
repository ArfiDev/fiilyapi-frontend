"use client";

/**
 * SEKME-F1.4a · kaydedilmemiş veri varken sekme değiştirme/kapatma onayı.
 *
 * EMSAL: `earned-value/settings/UnsavedChangesModal.tsx` (şantiye değiştirme
 * uyarısı) — başlık, düğme metinleri ("Vazgeç" / "Değişiklikleri at ve geç"),
 * yıkıcı ikincil düğme sınıfı ve özet ızgarası ONDAN alınır; yeni metin icat
 * edilmez. Emsalin cümlesi "{A} ayarlarında kaydedilmemiş değişiklik var.
 * Geçiş yapılırsa ({B}) bu değişiklikler kaybolur." — burada kaynak bir
 * şantiye değil AKTİF SEKME, hedef de tek bir ad değil (seç/kapat/tümünü
 * kapat …), bu yüzden özne "Bu sekmede" olur, parantezli hedef düşer; cümle
 * yapısı aynen kalır. Özet ızgarası emsaldeki "Değişen bölüm / Bölümler"
 * satırlarını kayıttaki ETİKETLERLE doldurur (tekilleştirilmiş — satır başına
 * kaydolan kaynaklar aynı etiketi birden çok kez taşıyabilir).
 *
 * Stil: emsalin sınıfları (`ev-unsaved-modal*`) yeniden kullanılır; tanımları
 * SEKME-F1.4c ile `unsaved-changes-modal.css`e taşındı (eskiden 23 KB'lık
 * `planning-settings.css`in tamamı yüklenirdi — kabuk artık yalnız bu küçük
 * dosyayı import eder).
 */
import { Modal } from "@/components/settings/Modal";
import { Button } from "@/components/ui/button";
import "@/components/earned-value/settings/unsaved-changes-modal.css";

export interface UnsavedTabGuardModalProps {
  readonly isOpen: boolean;
  readonly labels: readonly string[];
  readonly onCancel: () => void;
  readonly onDiscard: () => void;
}

export function UnsavedTabGuardModal({ isOpen, labels, onCancel, onDiscard }: UnsavedTabGuardModalProps) {
  if (!isOpen) return null;
  const uniqueLabels = [...new Set(labels)];

  return (
    <Modal
      title="Kaydedilmemiş değişiklikler var"
      onClose={onCancel}
      className="ev-unsaved-modal"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Vazgeç
          </Button>
          <Button variant="secondary" className="ev-unsaved-modal__discard" onClick={onDiscard}>
            Değişiklikleri at ve geç
          </Button>
        </>
      }
    >
      <p className="ev-unsaved-modal__text">
        Bu sekmede kaydedilmemiş değişiklik var. Geçiş yapılırsa bu değişiklikler kaybolur.
      </p>
      {uniqueLabels.length > 0 && (
        <dl className="ev-unsaved-modal__summary">
          <dt>Değişen bölüm</dt>
          <dd className="ev-unsaved-modal__count">{uniqueLabels.length}</dd>
          <dt>Bölümler</dt>
          <dd>{uniqueLabels.join(" · ")}</dd>
        </dl>
      )}
    </Modal>
  );
}
