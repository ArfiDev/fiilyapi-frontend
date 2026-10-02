// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildConvertRequest } from "./convert-body";
import { DISCIPLINE_BY_CATALOG, makeForm, makeWonRevision } from "./convert-fixtures";
import { rowsFromRevision, setBf } from "./convert-model";

const revision = makeWonRevision();
const draft = setBf(rowsFromRevision(revision, DISCIPLINE_BY_CATALOG), "o:it-2", "100");

/** F5.3b (O3): alandan çıkmadan (blur'suz) gelen küçük harfli kod da gövdede TÜRKÇE kurallı büyük harf gider. */
describe("gövde: kod ve sözleşme no tr-TR büyük harf", () => {
  it("'szl-iş-01' → 'SZL-İŞ-01'; 'prj-ılık' → 'PRJ-ILIK'", () => {
    const body = buildConvertRequest(makeForm({ contractNo: " szl-iş-01 ", projectCode: " prj-ılık " }), draft, revision);
    expect(body.contract.contract_no).toBe("SZL-İŞ-01");
    expect(body.project.code).toBe("PRJ-ILIK");
  });
});
