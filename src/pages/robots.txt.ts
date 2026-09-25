import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? import.meta.env.SITE).replace(/\/+$/, '');

  return new Response(
    `User-agent: *
Allow: /
Disallow: /app
Disallow: /registro
Disallow: /auth

Sitemap: ${base}/sitemap.xml
`,
    { headers: { 'Content-Type': 'text/plain' } },
  );
};
