import { describe, expect, it } from "vitest";

import type { ApprovalRole, ApprovalStepRead } from "@/lib/api/hooks/useApprovals";

import {
  APPROVAL_DOCUMENT_PRESENTATION,
  APPROVAL_TABS,
  UNKNOWN_VALUE,
  approvalAmountLabel,
  approvalDecisionBadge,
  approvalDecisionLine,
  approvalBelowThresholdLabel,
  approvalDetailTarget,
  approvalDocumentPresentation,
  approvalLinkChip,
  approvalNeedsPatron,
  approvalPatronDescription,
  approvalReasonLine,
  approvalRoleLabel,
  approvalStepNote,
  approvalStepState,
  approvalSubtitleLabel,
  approvalTabLabel,
  parseApprovalTab,
  approvalThresholdBadgeLabel,
  isApprovalRejectReasonReady,
  isKnownApprovalDocumentType,
} from "./approval-labels";

function step(partial: Partial<ApprovalStepRead> = {}): ApprovalStepRead {
  return {
    step_no: 1,
    approval_role: "accounting",
    decided_at: null,
    decided_by_name: null,
    ...partial,
  };
}

const PATRON_ROLES: readonly ApprovalRole[] = ["patron"];

// 🔴 DÖRT DURUMUN HEPSİ — `current-other` bu sekmede ULAŞILAMAZDIR (`GET
// /approvals` yalnız bana düşen adımları döndürür) ve tam bu yüzden BİRİM
// TESTİYLE doğrulanır: kadraj/e2e onu asla göremez, ama `Tümü` sekmesi
// açıldığında türetmenin hazır olması gerekir.
describe("approvalStepState — dört durum (mockup :129-135)", () => {
  it(":130 karar verilmiş adım yeşile düşer (sıra numarasından BAĞIMSIZ)", () => {
    const state = approvalStepState({
      step: step({ step_no: 9, decided_at: "2026-07-20T08:00:00Z" }),
      currentStepNo: 2,
      myRoles: PATRON_ROLES,
    });
    expect(state).toBe("decided");
  });

  it(":170 sıradaki adım BENİM rolümdeyse `current-mine`", () => {
    const state = approvalStepState({
      step: step({ step_no: 3, approval_role: "patron" }),
      currentStepNo: 3,
      myRoles: PATRON_ROLES,
    });
    expect(state).toBe("current-mine");
  });

  it(":133 sıradaki adım BAŞKASININ rolündeyse `current-other` (bu sekmede ulaşılamaz dal)", () => {
    const state = approvalStepState({
      step: step({ step_no: 3, approval_role: "accounting" }),
      currentStepNo: 3,
      myRoles: PATRON_ROLES,
    });
    expect(state).toBe("current-other");
  });

  it(":135 sırası gelmemiş adım gri `upcoming`", () => {
    const state = approvalStepState({
      step: step({ step_no: 4, approval_role: "patron" }),
      currentStepNo: 2,
      myRoles: PATRON_ROLES,
    });
    expect(state).toBe("upcoming");
  });

  it("kararsız ama GEÇMİŞ adım (sunucunun üretmemesi gereken hâl) griye düşer, ÇÖKMEZ", () => {
    const state = approvalStepState({
      step: step({ step_no: 1, approval_role: "site_chief" }),
      currentStepNo: 3,
      myRoles: PATRON_ROLES,
    });
    expect(state).toBe("upcoming");
  });

  it("ek not yalnız iki durumda vardır", () => {
    expect(approvalStepNote("current-mine")).toBe("(Siz)");
    expect(approvalStepNote("current-other")).toBe("(bekliyor)");
    expect(approvalStepNote("decided")).toBeNull();
    expect(approvalStepNote("upcoming")).toBeNull();
  });
});

describe("approvalRoleLabel", () => {
  it("beş rolün de Türkçe karşılığı vardır", () => {
    expect(approvalRoleLabel("site_chief")).toBe("Şantiye Şefi");
    expect(approvalRoleLabel("project_manager")).toBe("Proje Müdürü");
    expect(approvalRoleLabel("accounting")).toBe("Muhasebe");
    expect(approvalRoleLabel("patron")).toBe("Patron");
    expect(approvalRoleLabel("procurement")).toBe("Satınalma");
  });

  it("bilinmeyen rol HAM basılır (çökmez, sessizce yutulmaz)", () => {
    expect(approvalRoleLabel("legal_review")).toBe("legal_review");
  });
});

// 🔴 EMİR ÖLÇÜMLE DOĞRULANDI: satınalma talebinin DETAY rotası YOKTUR
// (`/satinalma/talepler/{id}` diye bir sayfa yok, yalnız `.../teklifler` var).
describe("approvalDetailTarget — rota çözücü (invoiceSource deseni)", () => {
  it("işveren hakedişi `/hakedisler/{id}`e gider", () => {
    expect(approvalDetailTarget("progress_payment", "pp-5")).toEqual({
      label: "Detay",
      href: "/hakedisler/pp-5",
      reason: null,
    });
  });

  it("taşeron hakedişi `/hakedisler/taseron/{id}`e gider", () => {
    expect(approvalDetailTarget("subcontractor_progress_payment", "scpp-3")).toEqual({
      label: "Detay",
      href: "/hakedisler/taseron/scpp-3",
      reason: null,
    });
  });

  it("🔴 satınalma talebinin rotası YOKTUR → href null + GÖRÜNÜR gerekçe", () => {
    const target = approvalDetailTarget("purchase_request", "pr-2");
    expect(target.href).toBeNull();
    expect(target.reason).toBe("Satın alma talebinin detay ekranı henüz yazılmadı.");
  });

  it("bilinmeyen tipte de bağlantı UYDURULMAZ", () => {
    const target = approvalDetailTarget("payroll_run", "x-1");
    expect(target.href).toBeNull();
    expect(target.reason).not.toBeNull();
  });

  it("kimlik URL'de kaçışlanır (ham enjeksiyon yok)", () => {
    expect(approvalDetailTarget("progress_payment", "a/b").href).toBe("/hakedisler/a%2Fb");
  });
});

describe("approvalLinkChip — :174 ve :229 çipleri", () => {
  it("satınalma → teklif karşılaştırma rotası; SAYI uydurulmaz", () => {
    expect(approvalLinkChip("purchase_request", "pr-2")).toEqual({
      label: "Teklif Karşılaştırması",
      href: "/satinalma/talepler/pr-2/teklifler",
    });
  });

  it("işveren hakedişi → hakediş detayı", () => {
    expect(approvalLinkChip("progress_payment", "pp-5")).toEqual({
      label: "Hakediş Detayı",
      href: "/hakedisler/pp-5",
    });
  });

  it("taşeron hakediş kartında çip YOKTUR (mockup :137-141)", () => {
    expect(approvalLinkChip("subcontractor_progress_payment", "scpp-3")).toBeNull();
  });
});

describe("approvalDocumentPresentation — üç tip + zarif düşüş", () => {
  it("üç tipin rozet metni mockup'tan gelir", () => {
    expect(APPROVAL_DOCUMENT_PRESENTATION.subcontractor_progress_payment.badgeLabel).toBe("HAKEDİŞ");
    expect(APPROVAL_DOCUMENT_PRESENTATION.purchase_request.badgeLabel).toBe("SATIN ALMA");
    expect(APPROVAL_DOCUMENT_PRESENTATION.progress_payment.badgeLabel).toBe("İŞVEREN HAKEDİŞ");
  });

  it("🔴 satınalmada NET kutusu YOKTUR (:173 tek kutu)", () => {
    expect(APPROVAL_DOCUMENT_PRESENTATION.purchase_request.netLabel).toBeNull();
    expect(APPROVAL_DOCUMENT_PRESENTATION.subcontractor_progress_payment.netLabel).toBe("Net");
    expect(APPROVAL_DOCUMENT_PRESENTATION.progress_payment.netLabel).toBe("Net Tahsil");
  });

  it("bilinmeyen tip HAM rozetle basılır, çökmez", () => {
    const presentation = approvalDocumentPresentation("payroll_run");
    expect(presentation.badgeLabel).toBe("payroll_run");
    expect(presentation.netLabel).toBeNull();
  });

  it("bilinen/bilinmeyen tip ayrımı onay-ret düğmelerinin kapısıdır", () => {
    expect(isKnownApprovalDocumentType("purchase_request")).toBe(true);
    expect(isKnownApprovalDocumentType("payroll_run")).toBe(false);
    // Prototip zinciri sızmamalı: `"toString" in obj` TRUE dönerdi.
    expect(isKnownApprovalDocumentType("toString")).toBe(false);
  });
});

describe("eşik rozeti (:158)", () => {
  it("zincirde patron adımı VARSA basılır", () => {
    expect(approvalNeedsPatron([step({ approval_role: "accounting" })])).toBe(false);
    expect(
      approvalNeedsPatron([step({ approval_role: "accounting" }), step({ step_no: 2, approval_role: "patron" })]),
    ).toBe(true);
  });

  it("metin kalemin KENDİ donmuş eşiğinden kurulur (ayardan DEĞİL)", () => {
    expect(approvalThresholdBadgeLabel("500000.00")).toBe(">₺500.000 — Patron Gerekli");
  });
});

describe("tutar düşüşü", () => {
  it("🔴 null tutar `0` DEĞİL `—` basar (fiyatsız kalem)", () => {
    expect(approvalAmountLabel(null)).toBe(UNKNOWN_VALUE);
    expect(approvalAmountLabel("0")).toBe("₺0");
  });

  it("dolu tutar bitişik ₺ ile basılır (mockup :138)", () => {
    expect(approvalAmountLabel("1240000.00")).toBe("₺1.240.000");
  });
});

describe("approvalSubtitleLabel — dönem Türkçeleştirmesi (:127 :220)", () => {
  it("`MM/YYYY` parçası ay adına çevrilir, komşu parçalara DOKUNULMAZ", () => {
    expect(approvalSubtitleLabel("Güneşkent A-Blok · Kat 6–8 · 07/2026")).toBe(
      "Güneşkent A-Blok · Kat 6–8 · Temmuz 2026",
    );
  });

  it("dönem taşımayan alt başlık aynen döner", () => {
    expect(approvalSubtitleLabel("Güneşkent A-Blok · Kat 9 döşeme")).toBe(
      "Güneşkent A-Blok · Kat 9 döşeme",
    );
  });

  it("alt başlık yoksa null kalır (uydurma metin YOK)", () => {
    expect(approvalSubtitleLabel(null)).toBeNull();
  });
});

describe("sekme şeridi (:71-76)", () => {
  it("DÖRT sekme vardır, mockup sırası korunur ve HEPSİ çalışır", () => {
    expect(APPROVAL_TABS.map((tab) => tab.key)).toEqual(["tumu", "benim", "onaylanan", "reddedilen"]);
    expect(APPROVAL_TABS.map((tab) => tab.label)).toEqual([
      "Tümü",
      "Benim Onayım",
      "Onay Verildi",
      "Reddedildi",
    ]);
  });

  it("her sekme doğru kaynağa bağlanır: Benim Onayım = bekleyen kutusu, diğerleri geçmiş süzgeci", () => {
    expect(APPROVAL_TABS.map((tab) => [tab.key, tab.historyFilter])).toEqual([
      ["tumu", "all"],
      ["benim", null],
      ["onaylanan", "approved"],
      ["reddedilen", "rejected"],
    ]);
  });

  it("boş durum metni sekmeye göredir", () => {
    const empty = Object.fromEntries(APPROVAL_TABS.map((tab) => [tab.key, tab.emptyMessage]));
    expect(empty).toEqual({
      tumu: "Görünür onay zinciri yok",
      benim: "Onayınızı bekleyen kalem yok.",
      onaylanan: "Onayladığınız evrak yok",
      reddedilen: "Reddedilen evrak yok",
    });
  });

  it("?sekme= değeri sekmeye çevrilir; parametresiz ya da bilinmeyen değer Benim Onayım'a düşer", () => {
    expect(parseApprovalTab("reddedilen").key).toBe("reddedilen");
    expect(parseApprovalTab("onaylanan").key).toBe("onaylanan");
    expect(parseApprovalTab("tumu").key).toBe("tumu");
    expect(parseApprovalTab(null).key).toBe("benim");
    expect(parseApprovalTab("yok-boyle-sekme").key).toBe("benim");
  });

  it("sayaç verildiyse parantez içinde basılır, verilmediyse (yüklenmemiş sekme) sayısız kalır", () => {
    const tab = parseApprovalTab("benim");
    expect(approvalTabLabel(tab, 4)).toBe("Benim Onayım (4)");
    expect(approvalTabLabel(tab, undefined)).toBe("Benim Onayım");
    expect(approvalTabLabel(parseApprovalTab("reddedilen"), 0)).toBe("Reddedildi (0)");
  });
});

describe("geçmiş kartı karar rozeti", () => {
  it("onaylanan yeşil, reddedilen kırmızı, bekleyen nötr 'Bekliyor · N. adım'", () => {
    expect(approvalDecisionBadge("approved", 3)).toEqual({ variant: "success", label: "Onaylandı" });
    expect(approvalDecisionBadge("rejected", 2)).toEqual({ variant: "danger", label: "Reddedildi" });
    expect(approvalDecisionBadge("pending", 2)).toEqual({
      variant: "neutral",
      label: "Bekliyor · 2. adım",
    });
  });

  it("karar satırı karar vereni ve İstanbul saatiyle gg.aa.yyyy ss:dd tarihini basar", () => {
    // 2026-09-25T06:12Z = 09:12 İstanbul (UTC+3)
    expect(approvalDecisionLine("Mehmet Kaya", "2026-09-25T06:12:00Z")).toBe(
      "Karar: Mehmet Kaya · 25.09.2026 09:12",
    );
  });

  it("karar veren yoksa 'Karar: —' basılır (uydurma ad YOK)", () => {
    expect(approvalDecisionLine(null, null)).toBe(`Karar: ${UNKNOWN_VALUE}`);
  });

  it("gerekçe satırı yalnız reason doluysa basılır", () => {
    expect(approvalReasonLine("Metraj eksik")).toBe("Gerekçe: Metraj eksik");
    expect(approvalReasonLine(null)).toBeNull();
  });
});

describe("rol akışı eşiği (:62 :65)", () => {
  it("eşik biliniyorsa patron kartına eklenir ve pill basılır", () => {
    expect(approvalPatronDescription("500000.00")).toBe("Final onay > ₺500.000");
    expect(approvalBelowThresholdLabel("500000.00")).toBe(
      "₺500.000 altı için PM + Muhasebe yeterli",
    );
  });

  it("🔴 eşik bilinmiyorsa SAHTE SAYI basılmaz: kart eşiksiz kalır, pill HİÇ basılmaz", () => {
    expect(approvalPatronDescription(undefined)).toBe("Final onay");
    expect(approvalBelowThresholdLabel(undefined)).toBeNull();
  });
});

describe("isApprovalRejectReasonReady", () => {
  it("boş ve YALNIZ BOŞLUKTAN oluşan gerekçe hazır DEĞİLDİR", () => {
    expect(isApprovalRejectReasonReady("")).toBe(false);
    expect(isApprovalRejectReasonReady("   ")).toBe(false);
    expect(isApprovalRejectReasonReady("\n\t ")).toBe(false);
  });

  it("dolu gerekçe hazırdır", () => {
    expect(isApprovalRejectReasonReady(" eksik metraj ")).toBe(true);
  });
});
