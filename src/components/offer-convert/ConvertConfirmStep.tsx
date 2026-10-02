"use client";

import { formatDateDots, formatMoneyTl } from "@/lib/format";
import { cx } from "@/lib/cx";

import type { ConvertSummary } from "./convert-derive";
import { diffPctText, signedMoney } from "./convert-format";
import type { ConvertForm } from "./convert-types";
import "./offer-convert.css";

interface ConvertConfirmStepProps {
  form: ConvertForm;
  summary: ConvertSummary;
  employerName: string;
}

const isNegative = (value: string): boolean => value.trim().startsWith("-");
const ARCHIVE_NOTE = "Teklif salt okunur arşive geçer; kalemler katalog bağıyla sözleşmeye kopyalanır.";

/** TDN:143-163 — "Oluşturulacak" listesi + "Tutarlar · KDV hariç" (sayılar `summarize` çıktısı). */
export function ConvertConfirmStep({ form, summary, employerName }: ConvertConfirmStepProps) {
  const projectName = form.projectName.trim();
  const siteName = form.siteName.trim() || projectName;
  const makes = [
    {
      kind: "PROJE",
      title: `${form.projectCode.trim() || "Otomatik"} · ${projectName}`,
      sub: `İşveren ${employerName} · ${formatDateDots(form.startDate)} → ${formatDateDots(form.endDate)}`,
    },
    {
      kind: "SÖZLEŞME",
      title: `${form.contractNo.trim()} · ${formatDateDots(form.signatureDate)}`,
      sub: `${summary.includedCount} kalem · ${formatMoneyTl(summary.contractTotal)} KDV hariç · katalog bağlı`,
    },
    form.openSite
      ? { kind: "ŞANTİYE", title: `${siteName} Şantiyesi`, sub: "Bütün kalemler bu şantiyeye bağlanır" }
      : { kind: "ŞANTİYE", title: "Şantiye açılmayacak", sub: "Şantiyeyi sonra proje sayfasından açın" },
  ];
  const isNeg = isNegative(summary.difference);
  return (
    <div className="convert-confirm" data-testid="convert-step-3">
      <section className="convert-card">
        <h2 className="convert-card__title">Oluşturulacak</h2>
        {makes.map((make) => (
          <div key={make.kind} className="convert-make">
            <span className="convert-make__kind">{make.kind}</span>
            <div className="convert-make__body">
              <span className="convert-make__title">{make.title}</span>
              <span className="convert-make__sub">{make.sub}</span>
            </div>
          </div>
        ))}
      </section>
      <section className="convert-card" data-testid="convert-summary-step3">
        <h2 className="convert-card__title">Tutarlar · KDV hariç</h2>
        <Row label="Teklif tutarı" value={formatMoneyTl(summary.offerTotal)} />
        <Row label="Sözleşme tutarı" value={formatMoneyTl(summary.contractTotal)} tone="main" />
        <Row label="Fark" value={`${signedMoney(summary.difference)} · ${diffPctText(summary.diffPct)}`} tone={isNeg ? "neg" : "pos"} />
        <Row label="KDV dahil" value={formatMoneyTl(summary.contractGross)} tone="gross" />
        <div className="convert-note">
          <span className="convert-note__mark" aria-hidden="true">
            i
          </span>
          <span>{ARCHIVE_NOTE}</span>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "main" | "neg" | "pos" | "gross" }) {
  return (
    <div className={cx("convert-totals__row", tone && `convert-totals__row--${tone}`)}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
