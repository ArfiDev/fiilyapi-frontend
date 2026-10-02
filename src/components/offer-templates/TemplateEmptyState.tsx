import { Button } from "@/components/ui";

import "./offer-templates.css";

interface TemplateEmptyStateProps {
  canWrite: boolean;
  onFromOffer: () => void;
  onNew: () => void;
}

/** ÜS-F4-10: hiç şablon yokken kalemler kartı yerine (mockup'ta çizilmemiş). */
export function TemplateEmptyState({ canWrite, onFromOffer, onNew }: TemplateEmptyStateProps) {
  return (
    <section className="otpl-empty" aria-label="Şablon yok">
      <p className="otpl-empty__title">Henüz şablon yok · tekrarlayan işler için kalem seti oluşturun</p>
      {canWrite && (
        <div className="otpl-empty__actions">
          <Button variant="secondary" onClick={onFromOffer}>
            Tekliften şablon oluştur
          </Button>
          <Button onClick={onNew}>+ Yeni Şablon</Button>
        </div>
      )}
    </section>
  );
}
