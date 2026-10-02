import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { makeDetail, makeRevisionSummary } from "./offer-detail-fixtures";
import { RevisionHistory } from "./RevisionHistory";

function items(): string[] {
  return within(screen.getByRole("list")).getAllByRole("listitem").map((li) => li.textContent ?? "");
}

describe("RevisionHistory", () => {
  it("EN YENİ üstte: karışık gelen olaylar zamana göre azalan sıraya girer", () => {
    const detail = makeDetail();
    const shuffled = [detail.history[1]!, detail.history[4]!, detail.history[0]!, detail.history[3]!, detail.history[2]!];
    render(<RevisionHistory history={shuffled} revisions={detail.revisions} />);
    const order = items().map((text) => /^(Rev\.\d)(açıldı|gönderildi)/.exec(text)?.slice(1).join(" "));
    expect(order).toEqual(["Rev.2 açıldı", "Rev.1 gönderildi", "Rev.1 açıldı", "Rev.0 gönderildi", "Rev.0 açıldı"]);
  });

  it("eşzamanlı açılış+gönderim: gönderim açılışın ÜSTÜNDE", () => {
    const at = "2026-09-12T09:00:00Z";
    const history = [
      { at, kind: "opened" as const, rev_no: 1, user_id: null, user_name: null },
      { at, kind: "sent" as const, rev_no: 1, user_id: null, user_name: null },
    ];
    render(<RevisionHistory history={history} revisions={makeDetail().revisions} />);
    expect(items()[0]).toContain("gönderildi");
    expect(items()[1]).toContain("açıldı");
  });

  it("etiketler: Türkçe durum; tarih GG.AA.YYYY SS:DD (İstanbul); kişi adı varsa basılır, yoksa basılmaz", () => {
    const detail = makeDetail();
    render(<RevisionHistory history={detail.history} revisions={detail.revisions} />);
    const rows = items();
    expect(rows[0]).toContain("Rev.2");
    expect(rows[0]).toContain("açıldı");
    expect(rows[0]).toContain("28.09.2026 12:00");
    expect(rows[0]).toContain("Selin Aksoy");
  });

  it("kişi adı yok → ' · ' ve ad basılmaz", () => {
    render(
      <RevisionHistory
        history={[{ at: "2026-09-28T09:00:00Z", kind: "opened", rev_no: 0, user_id: null, user_name: null }]}
        revisions={[makeRevisionSummary({ rev_no: 0 })]}
      />,
    );
    expect(items()[0]).not.toContain("·");
  });

  it("tutar = o revizyonun KDV hariç tutarı, yalnız gönderildi olayında; açılışta tutar YOK", () => {
    const detail = makeDetail();
    render(<RevisionHistory history={detail.history} revisions={detail.revisions} />);
    const rows = items();
    const sentRev1 = rows.find((row) => row.includes("Rev.1") && row.includes("gönderildi"));
    const openedRev1 = rows.find((row) => row.includes("Rev.1") && row.includes("açıldı"));
    expect(sentRev1).toContain("₺73.982.140,00"); // TD mockup geçmiş tutarı: tl() kuruşlu, boşluksuz
    expect(openedRev1).not.toContain("₺");
  });

  it("maskeli tutar (limited rol) → '—'", () => {
    const detail = makeDetail();
    const masked = detail.revisions.map((revision) => ({ ...revision, net: null, gross: null }));
    render(<RevisionHistory history={detail.history} revisions={masked} />);
    expect(items().find((row) => row.includes("Rev.1") && row.includes("gönderildi"))).toContain("—");
  });

  it("Kaybedildi olayı: neden + kazanan tutar altında basılır (T37)", () => {
    const revisions = [
      makeRevisionSummary({ rev_no: 0, status: "lost", lost_reason: "Rakip daha düşük", winning_amount: "61250000.50" }),
    ];
    const history = [{ at: "2026-10-01T09:00:00Z", kind: "lost" as const, rev_no: 0, user_id: null, user_name: null }];
    render(<RevisionHistory history={history} revisions={revisions} />);
    expect(items()[0]).toContain("Kayıp nedeni: Rakip daha düşük");
    expect(items()[0]).toContain("Kazanan teklif tutarı: ₺61.250.000,50");
  });

  it("neden ve tutar boşsa Kaybedildi satırı bu iki satırı BASMAZ", () => {
    const revisions = [makeRevisionSummary({ rev_no: 0, status: "lost" })];
    const history = [{ at: "2026-10-01T09:00:00Z", kind: "lost" as const, rev_no: 0, user_id: null, user_name: null }];
    render(<RevisionHistory history={history} revisions={revisions} />);
    expect(items()[0]).not.toContain("Kayıp nedeni");
    expect(items()[0]).not.toContain("Kazanan");
  });

  it("vazgeçildi etiketi", () => {
    render(
      <RevisionHistory
        history={[{ at: "2026-10-01T09:00:00Z", kind: "withdrawn", rev_no: 0, user_id: null, user_name: null }]}
        revisions={[makeRevisionSummary({ rev_no: 0, status: "withdrawn" })]}
      />,
    );
    expect(items()[0]).toContain("vazgeçildi");
  });

  it("TKL-B6.8 'converted': 'projeye dönüştürüldü' etiketi, kişi adı; tutar BASILMAZ (backend olayı tutar taşımaz)", () => {
    render(
      <RevisionHistory
        history={[{ at: "2026-10-01T09:00:00Z", kind: "converted", rev_no: 0, user_id: "u-1", user_name: "Ahmet Yılmaz" }]}
        revisions={[makeRevisionSummary({ rev_no: 0, status: "won" })]}
      />,
    );
    expect(items()[0]).toContain("projeye dönüştürüldü");
    expect(items()[0]).toContain("Ahmet Yılmaz");
    expect(items()[0]).not.toContain("₺");
  });

  it("TKL-B6.8 sıra: aynı anlı won + converted → converted EN ÜSTTE (en yeni üstte; durum olaylarından SONRA gelir)", () => {
    const at = "2026-10-01T09:00:00Z";
    const history = ["opened", "sent", "won", "converted"].map((kind) => ({
      at,
      kind: kind as "opened" | "sent" | "won" | "converted",
      rev_no: 0,
      user_id: null,
      user_name: null,
    }));
    render(<RevisionHistory history={[history[2]!, history[3]!, history[0]!, history[1]!]} revisions={[makeRevisionSummary({ rev_no: 0, status: "won" })]} />);
    expect(items().map((text) => /(açıldı|gönderildi|kazanıldı|projeye dönüştürüldü)/.exec(text)?.[1])).toEqual([
      "projeye dönüştürüldü",
      "kazanıldı",
      "gönderildi",
      "açıldı",
    ]);
  });
});
