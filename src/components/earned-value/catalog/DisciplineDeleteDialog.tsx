"use client";

import { Modal } from "@/components/settings/Modal";
import { Button } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useDeleteEvDiscipline } from "@/lib/api/hooks/useEvDisciplines";
import type { EvDisciplineRead } from "@/lib/api/models";

import { DisciplineSwatch } from "@/components/catalog-shared/CatalogBits";

interface DisciplineDeleteDialogProps {
  discipline: EvDisciplineRead;
  onClose: () => void;
  onDeleted: (message: string) => void;
}

/**
 * M6:316-335 — silme onayı (yalnız kullanılmayan disiplinde açılır). Özetteki
 * iş tipi / şantiye sayıları API'den (`used_by_item_count` · `used_by_site_count`,
 * PLN-B2 sözleşmesi, PLN-F1.5.2'de bağlandı). Arada kullanım doğarsa backend
 * 409 döner, mesaj burada kalır.
 */
export function DisciplineDeleteDialog({ discipline, onClose, onDeleted }: DisciplineDeleteDialogProps) {
  const remove = useDeleteEvDiscipline();

  function confirm() {
    remove.mutate(discipline.id, { onSuccess: () => onDeleted(`${discipline.name} silindi`) });
  }

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>
        Vazgeç
      </Button>
      <Button variant="danger" onClick={confirm} disabled={remove.isPending}>
        Disiplini sil
      </Button>
    </>
  );

  return (
    <Modal
      title={`${discipline.name} disiplini silinsin mi?`}
      onClose={onClose}
      footer={footer}
      className="ev-cat-modal--confirm"
    >
      <p className="ev-cat-confirm__text">
        Bu işlem geri alınamaz. Disiplin şirket listesinden kalkar; hiçbir iş tipi ve hiçbir şantiye bütçesi bu
        disiplini kullanmıyor.
      </p>
      <dl className="ev-cat-confirm__grid">
        <dt>Disiplin</dt>
        <dd>
          <DisciplineSwatch color={discipline.color} />
          <span className="ev-cat-mono">{discipline.code}</span> {discipline.name}
        </dd>
        <dt>Kullanan iş tipi</dt>
        <dd className="ev-cat-mono">{discipline.used_by_item_count}</dd>
        <dt>Kullanan şantiye</dt>
        <dd className="ev-cat-mono">{discipline.used_by_site_count}</dd>
      </dl>
      {remove.isError && (
        <p className="ev-cat-confirm__error" role="alert">
          {backendErrorMessage(remove.error)}
        </p>
      )}
    </Modal>
  );
}
