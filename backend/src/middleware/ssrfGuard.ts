/**
 * ssrfGuard.ts
 * Server-Side Request Forgery (SSRF) protection utilities.
 *
 * `isUrlSafe(url)` resolves the hostname of a user-supplied URL to IP
 * addresses and rejects any that fall within private, loopback, or link-local
 * ranges (RFC 1918 + RFC 3927 + IPv6 equivalents).
 *
 * The guard is active only in production (`config.isProduction === true`).
 * In development / test it returns `true` immediately so that local services
 * and test fixtures are not blocked by DNS resolution.
 *
 * DNS resolution failures are treated as unsafe (returns `false`) to avoid
 * bypassing the guard through DNS failure.
 *
 * Requirements: 17.1
 */

import dns, { LookupAddress } from 'dns';
import { lookup as dnsLookup } from 'dns/promises';
import ipaddr from 'ipaddr.js';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Private, loopback, link-local, and IPv6 equivalent ranges that must never
 * be reached by externally supplied URLs.
 *
 * Ranges covered:
 *   10.0.0.0/8        — RFC 1918 class-A private
 *   172.16.0.0/12     — RFC 1918 class-B private
 *   192.168.0.0/16    — RFC 1918 class-C private
 *   127.0.0.0/8       — IPv4 loopback
 *   169.254.0.0/16    — IPv4 link-local (RFC 3927)
 *   100.64.0.0/10     — CGNAT (RFC 6598) — shared address space
 *   0.0.0.0/8         — "This" network (RFC 1122)
 *   ::1/128           — IPv6 loopback
 *   fc00::/7          — IPv6 unique-local (fd00::/8 inclusive)
 *   fe80::/10         — IPv6 link-local
 */
const BLOCKED_RANGES: string[] = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '100.64.0.0/10',
  '0.0.0.0/8',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
];

/**
 * Pre-parsed CIDR tuples to avoid re-parsing on every call.
 * Each entry is `[network: IPv4 | IPv6, prefix: number]`.
 */
const BLOCKED_CIDRS = BLOCKED_RANGES.map(
  (range) => ipaddr.parseCIDR(range) as [ipaddr.IPv4 | ipaddr.IPv6, number],
);

/**
 * Returns `true` if the URL is safe to fetch (i.e. its hostname does not
 * resolve to a private or loopback IP address), `false` otherwise.
 *
 * In non-production environments the function always returns `true` so that
 * developers can hit local services without disabling the guard globally.
 *
 * Failure modes that return `false` (treated as unsafe):
 *   - URL parsing throws (malformed URL string)
 *   - Protocol is not `http:` or `https:`
 *   - DNS resolution fails for any reason
 *   - Any resolved address falls within a blocked CIDR range
 */
export async function isUrlSafe(url: string): Promise<boolean> {
  // Bypass the guard outside of production.
  if (!config.isProduction) return true;

  // ── 1. Parse the URL ──────────────────────────────────────────────────────
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Unparseable strings are never safe to fetch.
    return false;
  }

  // ── 2. Reject non-HTTP/HTTPS schemes ─────────────────────────────────────
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return false;
  }

  // ── 3. Resolve the hostname to IP addresses ───────────────────────────────
  let addresses: LookupAddress[];
  try {
    addresses = await dnsLookup(parsed.hostname, { all: true });
  } catch {
    // DNS failure → treat as unsafe to prevent DNS-based bypass.
    return false;
  }

  // ── 4. Check every resolved address against blocked CIDR ranges ───────────
  for (const { address } of addresses) {
    let ip: ipaddr.IPv4 | ipaddr.IPv6;
    try {
      ip = ipaddr.parse(address);
    } catch {
      // Unparseable address → treat as unsafe.
      return false;
    }

    for (const [network, prefix] of BLOCKED_CIDRS) {
      // `ip.match` requires both operands to be the same address family.
      if (ip.kind() === network.kind() && ip.match([network, prefix])) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Express middleware that reads a URL from `req.body.url` (or
 * `req.query.url`) and rejects the request with 403 if `isUrlSafe` returns
 * `false`.
 *
 * Mount this on any route that accepts a user-supplied URL before the route
 * handler, e.g.:
 *
 *   router.post('/kits', ssrfGuardMiddleware, createKitHandler);
 *
 * The middleware is a no-op (calls `next()` immediately) in non-production
 * environments because `isUrlSafe` already bypasses the guard there.
 */
export async function ssrfGuardMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const url: unknown =
    (req.body as Record<string, unknown>)?.url ??
    (req.query as Record<string, unknown>)?.url;

  // If no URL field is present on this request, pass through.
  if (typeof url !== 'string') {
    next();
    return;
  }

  try {
    const safe = await isUrlSafe(url);
    if (!safe) {
      res.status(403).json({
        error: 'The supplied URL targets a disallowed address.',
      });
      return;
    }
    next();
  } catch (err) {
    // Unexpected errors in the guard itself → fail closed (block the request).
    res.status(403).json({
      error: 'URL safety check failed.',
    });
  }
}
