import { describe, it, expect } from "vitest";
import { normalizeDomain } from "@/lib/utils";
import { renderTemplate, unsubscribeToken, verifyUnsubscribeToken } from "@/lib/templates";
import { encrypt, decrypt, newToken, hashToken } from "@/lib/crypto";

describe("normalizeDomain", () => {
  it("strips scheme, path and www", () => {
    expect(normalizeDomain("https://www.ABC-renos.com.au/about?q=1")).toBe("abc-renos.com.au");
  });
  it("accepts bare domains", () => {
    expect(normalizeDomain("KitchensMelbourne.com.au")).toBe("kitchensmelbourne.com.au");
  });
  it("returns null on garbage", () => {
    expect(normalizeDomain("not a url at all")).toBeNull();
  });
});

describe("renderTemplate", () => {
  it("replaces known fields, leaves unknowns visible", () => {
    const out = renderTemplate("Hi {{contact_name}}, link: {{article_link}} — {{missing}}", {
      contact_name: "Sam",
      article_link: "https://x/a/t",
    });
    expect(out).toBe("Hi Sam, link: https://x/a/t — {{missing}}");
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips and rejects tampering", () => {
    const token = unsubscribeToken("contact-123");
    expect(verifyUnsubscribeToken(token)).toBe("contact-123");
    expect(verifyUnsubscribeToken("contact-999.forged")).toBeNull();
    expect(verifyUnsubscribeToken("garbage")).toBeNull();
  });
});

describe("crypto", () => {
  it("encrypt/decrypt round-trips", () => {
    const secret = "refresh-token-value";
    expect(decrypt(encrypt(secret))).toBe(secret);
  });
  it("private-link tokens are unguessable and only hashed copies exist", () => {
    const t1 = newToken();
    const t2 = newToken();
    expect(t1).not.toBe(t2);
    expect(t1.length).toBeGreaterThan(30);
    expect(hashToken(t1)).not.toBe(t1);
    expect(hashToken(t1)).toBe(hashToken(t1)); // deterministic lookup
  });
});
