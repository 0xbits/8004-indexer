import { gunzipSync } from "zlib";

/**
 * Parse feedbackURI to extract comment
 * 
 * Formats supported:
 * - data:application/json;enc=gzip;base64,<base64-data>
 * - ipfs://<cid> (returns null, needs async fetch)
 * - Plain JSON string
 */
export function parseFeedbackUri(feedbackURI: string | null | undefined): { comment: string | null; error: string | null } {
  if (!feedbackURI) {
    return { comment: null, error: null };
  }

  try {
    // Handle base64-encoded gzipped JSON
    if (feedbackURI.startsWith("data:application/json;enc=gzip;base64,")) {
      const base64Data = feedbackURI.replace("data:application/json;enc=gzip;base64,", "");
      const buffer = Buffer.from(base64Data, "base64");
      const decompressed = gunzipSync(buffer);
      const json = JSON.parse(decompressed.toString("utf-8"));
      return { comment: json.comment || null, error: null };
    }

    // Handle plain base64 JSON (no gzip)
    if (feedbackURI.startsWith("data:application/json;base64,")) {
      const base64Data = feedbackURI.replace("data:application/json;base64,", "");
      const buffer = Buffer.from(base64Data, "base64");
      const json = JSON.parse(buffer.toString("utf-8"));
      return { comment: json.comment || null, error: null };
    }

    // Handle IPFS - return null, would need async fetch
    if (feedbackURI.startsWith("ipfs://")) {
      // Could fetch from gateway like https://ipfs.io/ipfs/<cid>
      // For now, return null and let enrichment worker handle it
      return { comment: null, error: "ipfs_needs_fetch" };
    }

    // Try parsing as plain JSON
    if (feedbackURI.startsWith("{")) {
      const json = JSON.parse(feedbackURI);
      return { comment: json.comment || null, error: null };
    }

    return { comment: null, error: "unknown_format" };
  } catch (e) {
    return { comment: null, error: `parse_error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Fetch comment from IPFS
 */
export async function fetchIpfsComment(ipfsUri: string): Promise<{ comment: string | null; error: string | null }> {
  if (!ipfsUri.startsWith("ipfs://")) {
    return { comment: null, error: "not_ipfs_uri" };
  }

  const cid = ipfsUri.replace("ipfs://", "");
  const gateways = [
    `https://ipfs.io/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`,
    `https://gateway.pinata.cloud/ipfs/${cid}`,
  ];

  for (const gateway of gateways) {
    try {
      const response = await fetch(gateway, {
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const json = await response.json();
        return { comment: json.comment || null, error: null };
      }
    } catch {
      continue;
    }
  }

  return { comment: null, error: "ipfs_fetch_failed" };
}
