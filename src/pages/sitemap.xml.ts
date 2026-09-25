import type { APIRoute } from 'astro';

export const prerender = true;

// ponytail: one-page sitemap; swap for @astrojs/sitemap when indexable pages grow.
export const GET: APIRoute = ({ site }) => {
  const loc = new URL('/', site ?? import.meta.env.SITE).toString();

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${loc}</loc>
  </url>
</urlset>
`,
    { headers: { 'Content-Type': 'application/xml' } },
  );
};
