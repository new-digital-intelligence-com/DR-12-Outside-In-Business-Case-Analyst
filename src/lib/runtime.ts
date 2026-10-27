/** True inside a Cloudflare Worker (the `cf:*` builds), false on Node.js (Railway, local dev). */
export function onCloudflareWorkers(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
}
