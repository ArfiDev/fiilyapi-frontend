import Link from "next/link";

import { FileTextIcon } from "@/components/ui/icons";
import { routes } from "@/lib/routes";

/** Excel içe aktarma ucu yok (S-K5 sonrası) — gerekçeyle devre-dışı. */
const IMPORT_SOON_TITLE = "Yakında · Excel desteği sonraki sürümde açılacak";

interface OffersEmptyStateProps {
  /** `none`: hiç teklif yok · `filtered`: süzgece uyan yok. */
  variant: "none" | "filtered";
  canWrite: boolean;
  onClear: () => void;
}

/** TL:169-174 (süzgece uyan yok) · TL:190-206 (henüz teklif yok). */
export function OffersEmptyState({ variant, canWrite, onClear }: OffersEmptyStateProps) {
  if (variant === "filtered") {
    return (
      <div className="offers-empty offers-empty--filtered">
        <div className="offers-empty__title">Filtreye uyan teklif yok</div>
        <button type="button" className="offers-filters__clear" onClick={onClear}>
          Filtreleri temizle
        </button>
      </div>
    );
  }
  return (
    <div className="offers-empty">
      <span className="offers-empty__icon" aria-hidden="true">
        <FileTextIcon width={22} height={22} />
      </span>
      <div className="offers-empty__title">Henüz teklif hazırlanmadı</div>
      <p className="offers-empty__text">
        İlk teklifinizi oluşturun: iş kalemlerini girin, birim fiyatları katalogdan çekin, PDF olarak işverene
        gönderin. Kazanılan teklif tek tıkla projeye dönüşür.
      </p>
      <div className="offers-empty__actions">
        {canWrite && (
          <Link href={routes.offers.new()} className="btn btn--primary btn--md">
            + Yeni Teklif
          </Link>
        )}
        <button type="button" className="btn btn--secondary btn--md" disabled title={IMPORT_SOON_TITLE}>
          Excel&apos;den içe al
        </button>
      </div>
    </div>
  );
}
