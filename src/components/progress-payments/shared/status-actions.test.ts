import { describe, expect, it } from "vitest";

import { permittedPaymentActions, type PaymentActionKind, type PaymentActionGates } from "./status-actions";
import type { PaymentLifecycleStatus } from "./status";

const NONE: PaymentActionGates = { canSubmit: false, canApprove: false, canUnapprove: false };
const SUBMIT: PaymentActionGates = { ...NONE, canSubmit: true };
const APPROVE: PaymentActionGates = { ...NONE, canApprove: true };
const UNAPPROVE: PaymentActionGates = { ...NONE, canUnapprove: true };
const ALL: PaymentActionGates = { canSubmit: true, canApprove: true, canUnapprove: true };

describe("permittedPaymentActions · kapi kombinasyon tablosu", () => {
  const table: Array<[PaymentLifecycleStatus, string, PaymentActionGates, PaymentActionKind[]]> = [
    ["draft", "kapilar kapali", NONE, []],
    ["draft", "yalniz canSubmit", SUBMIT, ["submit"]],
    ["draft", "yalniz canApprove", APPROVE, []],
    ["draft", "yalniz canUnapprove", UNAPPROVE, []],
    ["draft", "hepsi acik", ALL, ["submit"]],
    ["pending_approval", "kapilar kapali", NONE, []],
    ["pending_approval", "yalniz canSubmit", SUBMIT, []],
    ["pending_approval", "yalniz canApprove", APPROVE, ["reject", "approve"]],
    ["pending_approval", "yalniz canUnapprove", UNAPPROVE, []],
    ["pending_approval", "hepsi acik", ALL, ["reject", "approve"]],
    ["approved", "kapilar kapali", NONE, []],
    ["approved", "yalniz canSubmit", SUBMIT, []],
    ["approved", "yalniz canApprove (unapprove YOK)", APPROVE, ["markPaid"]],
    ["approved", "yalniz canUnapprove", UNAPPROVE, ["unapprove"]],
    ["approved", "hepsi acik", ALL, ["unapprove", "markPaid"]],
    ["paid", "kapilar kapali", NONE, []],
    ["paid", "hepsi acik", ALL, []],
  ];

  it.each(table)("%s · %s", (status, _label, gates, expected) => {
    expect(permittedPaymentActions(status, gates)).toEqual(expected);
  });
});
