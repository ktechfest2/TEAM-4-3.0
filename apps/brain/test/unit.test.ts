import { describe, expect, it } from "vitest";
import { createPhoneCrypto, hashSecret, isDemoNumber, normalizePhone, verifySecret } from "@confam/db";
import { decideVerdict, updatedReputation, type VerifierAnswer } from "../src/domain/verdict.ts";
import { placeName, verdictScript } from "../src/domain/scripts.ts";
import { signAethexPayload, verifyAethexSignature } from "../src/webhooks/signature.ts";
import { inWindow, localMinutes, startOfLocalDay } from "../src/time.ts";
import { pickVerifiers } from "../src/workers/cases.ts";
import { inferVerifierAnswer } from "../src/domain/infer.ts";

const a = (personId: string, answer: VerifierAnswer["answer"], weight = 1, affiliation: string | null = null): VerifierAnswer => ({ personId, answer, weight, affiliation });

describe("verdict rule", () => {
  it("waits with a single answer before the deadline", () => {
    expect(decideVerdict([a("1", "no")], false)).toMatchObject({ verdict: null, final: false });
  });
  it("returns false when two independent verifiers say no", () => {
    expect(decideVerdict([a("1", "no"), a("2", "no")], false)).toMatchObject({ verdict: "false", confidence: 1, no: 2, final: true });
  });
  it("confirms with two yes answers", () => {
    expect(decideVerdict([a("1", "yes"), a("2", "yes"), a("3", "unknown")], false)).toMatchObject({ verdict: "confirmed", yes: 2, unknown: 1 });
  });
  it("does not decide on a 2-2 split, and is unverified at the deadline", () => {
    const answers = [a("1", "yes"), a("2", "yes"), a("3", "no"), a("4", "no")];
    expect(decideVerdict(answers, false).verdict).toBeNull();
    expect(decideVerdict(answers, true)).toMatchObject({ verdict: "unverified", confidence: 0.5, final: true });
  });
  it("respects reputation weights for the threshold", () => {
    // 2 yes with low reputation vs 1 no with high reputation: yes share = 0.6/(0.6+1.5) < 0.7
    const answers = [a("1", "yes", 0.3), a("2", "yes", 0.3), a("3", "no", 1.5)];
    expect(decideVerdict(answers, true).verdict).toBe("unverified");
  });
  it("counts a person only once", () => {
    expect(decideVerdict([a("1", "no"), a("1", "no")], false).verdict).toBeNull();
  });
  it("caps answers from one party per side", () => {
    const answers = [a("1", "yes", 1, "party_a"), a("2", "yes", 1, "party_a"), a("3", "yes", 1, "party_a"), a("4", "no"), a("5", "no")];
    const r = decideVerdict(answers, true);
    expect(r.yes).toBe(2);
    expect(r.verdict).toBe("unverified");
  });
  it("is unverified with no answers at the deadline", () => {
    expect(decideVerdict([], true)).toMatchObject({ verdict: "unverified", confidence: null });
  });
  it("bounds reputation", () => {
    expect(updatedReputation(2, true)).toBe(2);
    expect(updatedReputation(0.3, false)).toBe(0.2);
    expect(updatedReputation(1, true)).toBe(1.1);
  });
});

describe("verifier selection", () => {
  it("interleaves affiliations and prefers reputation", () => {
    const picked = pickVerifiers(
      [
        { personId: "a", affiliation: "party_a", reputation: 1.9 },
        { personId: "b", affiliation: "party_a", reputation: 1.8 },
        { personId: "c", affiliation: "party_a", reputation: 1.7 },
        { personId: "d", affiliation: "observer", reputation: 1 },
        { personId: "e", affiliation: "community", reputation: 0.5 },
      ],
      3,
    );
    expect(picked.map((p) => p.personId)).toEqual(["a", "d", "e"]);
  });
});

describe("scripts", () => {
  it("formats ward names", () => {
    expect(placeName("YABA/OJUELEGBA")).toBe("Yaba / Ojuelegba");
  });
  it("adds safety advice for violence", () => {
    const s = verdictScript({ verdict: "false", category: "violence", claimEn: "There is fighting at Ojuelegba.", place: "Ojuelegba Primary School I", yes: 0, no: 2 });
    expect(s.en).toContain("not true");
    expect(s.en).toContain("112");
    expect(s.pcm).toContain("no true");
  });
});

describe("webhook signature", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ event_id: "evt_1", call_id: "ca_1" });
  it("accepts a valid signature", () => {
    const t = 1_800_000_000;
    expect(verifyAethexSignature(body, signAethexPayload(body, secret, t), secret, t + 10)).toEqual({ ok: true });
  });
  it("rejects tampering, staleness and a missing secret", () => {
    const t = 1_800_000_000;
    const header = signAethexPayload(body, secret, t);
    expect(verifyAethexSignature(body + " ", header, secret, t).ok).toBe(false);
    expect(verifyAethexSignature(body, header, secret, t + 301).ok).toBe(false);
    expect(verifyAethexSignature(body, header, "", t).ok).toBe(false);
    expect(verifyAethexSignature(body, undefined, secret, t).ok).toBe(false);
  });
});

describe("phones", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const pepper = Buffer.alloc(32, 9).toString("base64");
  it("normalises Nigerian formats", () => {
    expect(normalizePhone("0701 234 5678")).toBe("+2347012345678");
    expect(normalizePhone("2347012345678")).toBe("+2347012345678");
    expect(normalizePhone("+1 (864) 808-9401")).toBe("+18648089401");
    // Nigerian caller IDs often keep the trunk 0 after the country code
    expect(normalizePhone("+23407012345678")).toBe("+2347012345678");
    expect(normalizePhone("23409012345678")).toBe("+2349012345678");
    expect(() => normalizePhone("hello")).toThrow();
  });
  it("encrypts reversibly and hashes deterministically", () => {
    const c = createPhoneCrypto(pepper, key);
    const enc = c.encrypt("+2347012345678");
    expect(enc).not.toContain("7012345678");
    expect(c.decrypt(enc)).toBe("+2347012345678");
    expect(c.hash("+2347012345678")).toBe(c.hash("+2347012345678"));
  });
  it("recognises demo numbers", () => {
    expect(isDemoNumber("+2340001000001")).toBe(true);
    expect(isDemoNumber("+2347012345678")).toBe(false);
  });
  it("hashes and verifies PINs", async () => {
    const h = await hashSecret("2468");
    expect(await verifySecret("2468", h)).toBe(true);
    expect(await verifySecret("1357", h)).toBe(false);
  });
});

describe("time in Africa/Lagos", () => {
  it("computes local minutes and day start (UTC+1)", () => {
    const d = new Date("2027-01-16T06:50:00Z"); // 07:50 in Lagos
    expect(localMinutes(d, "Africa/Lagos")).toBe(7 * 60 + 50);
    expect(startOfLocalDay(d, "Africa/Lagos").toISOString()).toBe("2027-01-15T23:00:00.000Z");
  });
  it("handles windows that wrap midnight", () => {
    expect(inWindow(new Date("2027-01-16T21:30:00Z"), "Africa/Lagos", "21:00", "07:00")).toBe(true); // 22:30
    expect(inWindow(new Date("2027-01-16T11:00:00Z"), "Africa/Lagos", "21:00", "07:00")).toBe(false); // 12:00
  });
});

describe("verifier answer from transcript (backup)", () => {
  const t = (...turns: [string, string][]) => turns.map(([role, content]) => ({ role, content }));
  it("reads the official's answer, not Confam's lines", () => {
    expect(inferVerifierAnswer(t(["user", "But they didn't believe me."], ["assistant", "Is that true right now? Answer yes or no."], ["user", "Yes. Yes, it is."]))).toMatchObject({ answer: "yes" });
    expect(inferVerifierAnswer(t(["assistant", "Yes or no?"], ["user", "No o, everything is calm here"]))).toMatchObject({ answer: "no" });
    expect(inferVerifierAnswer(t(["assistant", "Is it true?"], ["user", "E no true, nothing like that"]))).toMatchObject({ answer: "no" });
  });
  it("treats 'I don't know' as unknown and ignores ambiguity or silence", () => {
    expect(inferVerifierAnswer(t(["user", "I don't know, I'm not there"]))).toMatchObject({ answer: "unknown" });
    expect(inferVerifierAnswer(t(["user", "yes no maybe"]))).toBeNull();
    expect(inferVerifierAnswer(t(["assistant", "Hello?"]))).toBeNull();
    expect(inferVerifierAnswer("not an array")).toBeNull();
  });
});
