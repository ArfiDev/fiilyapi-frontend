import "../contracts/contract-distribution.css";

/**
 * BDG · başlık kartı (sözleşme `ContractDistributionHeaderCard`ın karşılığı).
 * Üst satır "Şantiye", h1 şantiye adı, alt satır proje adı; iki sayaç:
 * "Bölümler" (kolon sayısı) ve "Bölüme Dağıtılmış Kalem" (backend sayaçları,
 * maskelenmez).
 */
export interface SectionDistributionHeaderCardProps {
  siteName: string;
  projectName: string;
  sectionCount: number;
  distributedItemCount: number;
  totalItemCount: number;
}

export function SectionDistributionHeaderCard({
  siteName,
  projectName,
  sectionCount,
  distributedItemCount,
  totalItemCount,
}: SectionDistributionHeaderCardProps) {
  return (
    <section className="cdist-head" aria-labelledby="bdg-head-title">
      <div>
        <p className="cdist-head__no">Şantiye</p>
        <h1 className="cdist-head__title" id="bdg-head-title">
          {siteName}
        </h1>
        <p className="cdist-head__parties" data-testid="bdg-head-project">
          {projectName}
        </p>
      </div>

      <div className="cdist-head__stats">
        <div className="cdist-stat cdist-stat--sites">
          <div className="cdist-stat__label">Bölümler</div>
          <div className="cdist-stat__value" data-testid="bdg-section-count">
            {sectionCount}
          </div>
        </div>
        <div className="cdist-stat cdist-stat--items">
          <div className="cdist-stat__label">Bölüme Dağıtılmış Kalem</div>
          <div className="cdist-stat__value" data-testid="bdg-distributed-count">
            {distributedItemCount}/{totalItemCount}
          </div>
        </div>
      </div>
    </section>
  );
}
