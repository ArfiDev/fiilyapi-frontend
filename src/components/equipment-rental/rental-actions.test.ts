import { describe, it, expect } from "vitest";

import {
  RENTAL_ACTION_LABEL,
  RENTAL_FORWARD_ACTION_LABEL,
  isRentalEditable,
  permittedRentalActions,
  rentalForwardActionLabel,
} from "./rental-actions";
import type { RentalInvoiceStatus } from "@/lib/api/hooks/useEquipmentRentalInvoices";

const ALL_STATUSES: readonly RentalInvoiceStatus[] = [
  "draft",
  "pending_verification",
  "approved",
  "paid",
];

/**
 * 🔴 EMSALDEN SAPMA — `progress-payments/shared/status-actions.ts` ayri kapilar
 * kullanir; KIRADA TEK kapi vardir (`canAct` = saha.makine_kira Onaylar,
 * `rental_router.py:54-55`: tum yazma uclari `dependencies=[_FULL]`).
 */
describe("permittedRentalActions · durum tablosunun birebir yansimasi", () => {
  it("draft: yalniz ileri adim (approve); pay/reject YOK", () => {
    expect(permittedRentalActions("draft", true)).toEqual(["approve"]);
  });

  it("pending_verification: yalniz ileri adim (approve); pay/reject YOK", () => {
    expect(permittedRentalActions("pending_verification", true)).toEqual(["approve"]);
  });

  it("approved: reject + pay (approve YOK — odeme kendi ucundadir)", () => {
    expect(permittedRentalActions("approved", true)).toEqual(["reject", "pay"]);
  });

  it("paid: UC DURUM — hicbir aksiyon yok", () => {
    expect(permittedRentalActions("paid", true)).toEqual([]);
  });

  it.each(ALL_STATUSES)("%s durumunda kapi KAPALI iken HIC aksiyon yok", (status) => {
    expect(permittedRentalActions(status, false)).toEqual([]);
  });
});

describe("rentalForwardActionLabel · ileri adim etiketi", () => {
  it("draft → hedef durumun mockup adindan turer (M5:65 `Doğrulama Bekliyor`)", () => {
    expect(rentalForwardActionLabel("draft")).toBe("Doğrulamaya Gönder");
  });

  it("pending_verification → backend docstring'inin KALIN etiketi", () => {
    // rental_router.py:210 + rental_service.py:640 + openapi description.
    expect(rentalForwardActionLabel("pending_verification")).toBe("Onayla ve Ödemeye Gönder");
  });

  it("approved/paid → ileri adim YOK (odeme kendi ucunda, paid uc durum)", () => {
    expect(rentalForwardActionLabel("approved")).toBeNull();
    expect(rentalForwardActionLabel("paid")).toBeNull();
  });

  it("harita dort durumu da tasir — kume KENDISI sinanir", () => {
    expect(Object.keys(RENTAL_FORWARD_ACTION_LABEL).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it("ileri adim etiketi olan her durum `approve` aksiyonunu da verir (tutarlilik)", () => {
    for (const status of ALL_STATUSES) {
      const hasLabel = rentalForwardActionLabel(status) !== null;
      const hasAction = permittedRentalActions(status, true).includes("approve");
      expect(hasAction, `${status}: etiket=${hasLabel} aksiyon=${hasAction}`).toBe(hasLabel);
    }
  });
});

describe("RENTAL_ACTION_LABEL · servis mesajlarindan turetilen etiketler", () => {
  it("uc aksiyonun HEPSI haritada", () => {
    expect(Object.keys(RENTAL_ACTION_LABEL).sort()).toEqual(["approve", "pay", "reject"]);
  });

  it("pay/reject etiketleri servis mesajlariyla ayni dili konusur", () => {
    expect(RENTAL_ACTION_LABEL.pay).toBe("Ödendi İşaretle");
    expect(RENTAL_ACTION_LABEL.reject).toBe("Onayı Geri Al");
  });
});

describe("isRentalEditable · EDIT_LOCKED_STATUSES yansimasi", () => {
  it("draft ve pending_verification duzenlenebilir", () => {
    expect(isRentalEditable("draft")).toBe(true);
    expect(isRentalEditable("pending_verification")).toBe(true);
  });

  it("approved ve paid KILITLI (rental_transitions.py EDIT_LOCKED_STATUSES)", () => {
    expect(isRentalEditable("approved")).toBe(false);
    expect(isRentalEditable("paid")).toBe(false);
  });

  it("kilitli her durumda satir/baslik duzenleme aksiyonu da olmaz", () => {
    for (const status of ALL_STATUSES) {
      if (isRentalEditable(status)) continue;
      expect(permittedRentalActions(status, true)).not.toContain("approve");
    }
  });
});
