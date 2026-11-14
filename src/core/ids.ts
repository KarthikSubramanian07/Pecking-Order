// URL-safe, no look-alikes. 12 chars ≈ 1 collision per ~10^9 ids at 1k ids/hour.
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const LENGTH = 12
/** Largest multiple of the alphabet size below 256, so every character is equally likely. */
const UNBIASED = 256 - (256 % ALPHABET.length)

/** Random id from the Web Crypto CSPRNG (also present in workers and Node). */
function randomId(): string {
  let out = ''
  while (out.length < LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(LENGTH * 2))) {
      if (byte < UNBIASED) out += ALPHABET[byte % ALPHABET.length]
      if (out.length === LENGTH) break
    }
  }
  return out
}

export const newId = (prefix: 't' | 'i' | 'b'): string => `${prefix}_${randomId()}`
