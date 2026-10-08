// Stable document ids (spec 16.4).
//
// docId = "d" + the first 10 hex characters of the SHA-1 of the normalised URL. Normalising trims
// the address, lower-cases the scheme and host, drops the fragment and drops trailing slashes from
// the path, so "https://Example.org/a/" and "https://example.org/a#top" give the same id. The URL is
// unique across every row in data/results, so the id is too, and it is identical whether a page
// reads Notion or the JSON copy.
//
// The SHA-1 is written out here, with no node:crypto, so an island can compute an id in the
// browser if it ever needs to. docid.test.ts checks it against node:crypto.

/** The address as the id sees it: trimmed, scheme and host lower-cased, no fragment, no trailing slash. */
export function normaliseUrl(url: string): string {
  let s = url.trim();
  const hash = s.indexOf('#');
  if (hash !== -1) s = s.slice(0, hash);
  const q = s.indexOf('?');
  let head = q === -1 ? s : s.slice(0, q);
  const query = q === -1 ? '' : s.slice(q);
  // scheme and host: everything up to the first slash after "://"
  const sep = head.indexOf('://');
  if (sep !== -1) {
    const pathStart = head.indexOf('/', sep + 3);
    const authority = pathStart === -1 ? head : head.slice(0, pathStart);
    const path = pathStart === -1 ? '' : head.slice(pathStart);
    head = authority.toLowerCase() + path;
  }
  head = head.replace(/\/+$/, '');
  return head + query;
}

/** "d" plus 10 hex characters: the stable id of a document row, used in #doc-{id} anchors. */
export function docId(url: string): string {
  return 'd' + sha1Hex(normaliseUrl(url)).slice(0, 10);
}

// ---- SHA-1 over the UTF-8 bytes of a string --------------------------------------------------

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));

export function sha1Hex(text: string): string {
  const bytes = utf8(text);
  const bitLength = bytes.length * 8;
  // message, the 0x80 marker, zero padding, then the 64-bit length: a multiple of 64 bytes
  const total = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(total - 4, bitLength >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30) >>> 0;
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, '0')).join('');
}
