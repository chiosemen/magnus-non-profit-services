import type { MetadataRoute } from 'next';
import { isMarketingOnly } from '../lib/public-surface';

/**
 * PS-9 — one artifact serves two hostnames with the same content. Only the
 * public marketing deployment should be indexed; the application deployment
 * must not compete with it for the same terms, and an authenticated
 * application has no business in a search index at all.
 *
 * Resolved per request rather than at build time: a statically generated
 * robots.txt would bake whichever mode CI built under into the shared
 * artifact, which is exactly what PS-8 forbids.
 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  if (!isMarketingOnly()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  return { rules: [{ userAgent: '*', allow: '/' }] };
}
