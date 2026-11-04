/**
 * On-chain token URIs are `data:application/json;base64,<payload>` with a small JSON document
 * inside. Decoding is pure, so it is tested without a chain.
 */

export interface TokenTrait {
  trait_type: string;
  value: string;
}

export interface TokenMetadata {
  name: string;
  image?: string;
  traits: TokenTrait[];
}

function parseJson(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function asTraits(value: unknown): TokenTrait[] {
  if (!Array.isArray(value)) return [];
  const traits: TokenTrait[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const name = record.trait_type;
    const traitValue = record.value;
    if (typeof name === "string" && (typeof traitValue === "string" || typeof traitValue === "number")) {
      traits.push({ trait_type: name, value: String(traitValue) });
    }
  }
  return traits;
}

export function decodeTokenUri(uri: string): TokenMetadata | null {
  if (typeof uri !== "string" || uri.length === 0) return null;

  let payload: unknown = null;

  if (uri.startsWith("data:")) {
    const comma = uri.indexOf(",");
    if (comma === -1) return null;
    const header = uri.slice(0, comma);
    const body = uri.slice(comma + 1);

    if (/;base64$/i.test(header)) {
      try {
        payload = parseJson(Buffer.from(body, "base64").toString("utf8"));
      } catch {
        return null;
      }
    } else {
      payload = parseJson(decodeURIComponent(body));
    }
  } else {
    // Not a data URI: nothing to decode without a network call, which this deliberately avoids.
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  const document = payload as Record<string, unknown>;
  const name = typeof document.name === "string" ? document.name : null;
  if (name === null) return null;

  const image = typeof document.image === "string" ? document.image : undefined;
  return { name, ...(image === undefined ? {} : { image }), traits: asTraits(document.attributes) };
}
