export function joaat(value) {
  let hash = 0 >>> 0;
  for (const char of String(value).toLowerCase()) {
    hash = (hash + char.codePointAt(0)) >>> 0;
    hash = (hash + ((hash << 10) >>> 0)) >>> 0;
    hash = (hash ^ (hash >>> 6)) >>> 0;
  }
  hash = (hash + ((hash << 3) >>> 0)) >>> 0;
  hash = (hash ^ (hash >>> 11)) >>> 0;
  hash = (hash + ((hash << 15) >>> 0)) >>> 0;
  return hash >>> 0;
}

export async function sha256Hex(data) {
  const buffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
