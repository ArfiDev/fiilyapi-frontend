import { describe, expect, it } from "vitest";

import { isSafeInternalUrl } from "./url-safety";

describe("isSafeInternalUrl — güvensiz girdiler REDDEDİLİR", () => {
  it.each([
    ["/\t/evil.com", "kontrol karakteri (tab) — WHATWG URL sessizce atar"],
    ["/\n/evil.com", "kontrol karakteri (yeni satır)"],
    ["/\r/evil.com", "kontrol karakteri (CR)"],
    ["//evil.com", "protokol-göreli URL — origin değişir"],
    ["/\\evil.com", "ham ters bölü"],
    ["/./api/auth/logout", "'.' segmenti ile /api/ önek denetimini aşma girişimi"],
    ["/x/../api/x", "'..' segmenti ile /api/ önek denetimini aşma girişimi"],
    ["/API/x", "büyük harfli /API önek denetimini aşma girişimi"],
    ["javascript:alert(1)", "\"/\" ile başlamıyor"],
    ["", "boş dize"],
    ["/api/x", "doğrudan BFF sunucu yolu"],
    ["/foo/./bar", "'/api' DIŞINDA genel normalizasyon farkı — '.' segmenti"],
    ["/foo/../bar", "'/api' DIŞINDA genel normalizasyon farkı — '..' segmenti"],
    ["/foo/bar/..", "sondaki '..' segmenti normalize edilir"],
    ["/%61pi/x", "yüzde-kodlanmış 'a' ile /api/ önek denetimini aşma girişimi"],
    ["/%41PI/x", "yüzde-kodlanmış 'A' (büyük harf) ile aşma girişimi"],
    ["/ap%69/x", "yüzde-kodlanmış 'i' ile aşma girişimi"],
    ["/%2e/api/x", "'.' segmentinin yüzde-kodlanmışı ile aşma girişimi"],
    ["/" + "a".repeat(2048), "MAX_TAB_URL_LENGTH (2048) aşımı"],
  ])("reddeder: %s (%s)", (url) => {
    expect(isSafeInternalUrl(url)).toBe(false);
  });
});

describe("isSafeInternalUrl — aynı-köken kalan girdiler KABUL edilir (ölçülmüş davranış)", () => {
  it.each([
    ["/", "kök"],
    ["/projeler?x=1", "sorgu dizeli sekme"],
    ["/hazine/cek-senet", "iç içe modül yolu"],
    ["/%2F%2Fevil.com", "kodlanmış '//' — URL çözücü çözmez, pathname aynı kalır, origin DEĞİŞMEZ"],
    ["/foo%5Cbar", "kodlanmış ters bölü — pathname aynı kalır, origin DEĞİŞMEZ"],
  ])("kabul eder: %s (%s)", (url) => {
    expect(isSafeInternalUrl(url)).toBe(true);
  });
});
