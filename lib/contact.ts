/**
 * Contact-info extraction. Listings often have a phone / email / contact name
 * embedded in the description text. We try the cheap path first (regex), then
 * optionally fall back to an LLM call for messier text.
 *
 * LLM path uses Anthropic Claude, enabled only when ANTHROPIC_API_KEY is set.
 */

export interface Contact {
  phone?: string;
  email?: string;
  name?: string;
}

const PHONE_RX =
  /(?:(?:\+?1[\s.\-])?\(?\b([2-9]\d{2})\)?[\s.\-]?(\d{3})[\s.\-]?(\d{4})\b)/g;
const EMAIL_RX =
  /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/gi;

/** Cheap regex pass: pulls obvious phone/email matches out of free text. */
export function extractContactRegex(text: string | null | undefined): Contact {
  if (!text || text.length < 5) return {};
  const out: Contact = {};
  const phoneM = Array.from(text.matchAll(PHONE_RX));
  if (phoneM.length) {
    const [, a, b, c] = phoneM[0];
    out.phone = `(${a}) ${b}-${c}`;
  }
  const emailM = Array.from(text.matchAll(EMAIL_RX));
  if (emailM.length) {
    // Skip generic-looking automation emails like robot@craigslist
    const real = emailM.map((m) => m[1]).find((e) => !/craigslist|noreply|donotreply|no-reply/i.test(e));
    if (real) out.email = real;
  }
  return out;
}

/** LLM pass: gives us the contact NAME plus catches phones written in
 * non-standard formats (e.g. "5-five-five-..."). Anthropic Claude via REST. */
export async function extractContactLLM(text: string): Promise<Contact> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return {};
  if (!text || text.length < 30) return {};

  const trimmed = text.slice(0, 2500);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system:
          "You extract contact info from rental listing descriptions. Reply ONLY with valid JSON of the shape {\"phone\":string|null,\"email\":string|null,\"name\":string|null}. Phone in (XXX) XXX-XXXX format. If a field is not in the text, use null. Do not invent or guess.",
        messages: [{ role: "user", content: trimmed }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn("anthropic", res.status, await res.text().catch(() => ""));
      return {};
    }
    const data = await res.json() as any;
    const content = data?.content?.[0]?.text ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const parsed = JSON.parse(jsonMatch[0]) as Contact;
    const out: Contact = {};
    if (parsed.phone && /\d/.test(parsed.phone)) out.phone = parsed.phone;
    if (parsed.email && /@/.test(parsed.email)) out.email = parsed.email;
    if (parsed.name && typeof parsed.name === "string" && parsed.name.length > 1) {
      out.name = parsed.name.slice(0, 80);
    }
    return out;
  } catch (err) {
    console.warn("anthropic err", err);
    return {};
  }
}

/** Combine regex + LLM, preferring regex where both find something
 * (regex output is more reliable for phone/email shape). */
export async function extractContact(text: string | null | undefined): Promise<Contact> {
  if (!text) return {};
  const r = extractContactRegex(text);
  // Skip LLM if we already have phone AND email.
  if (r.phone && r.email) return r;
  const llm = await extractContactLLM(text);
  return {
    phone: r.phone ?? llm.phone,
    email: r.email ?? llm.email,
    name: llm.name, // regex never finds names
  };
}
