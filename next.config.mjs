// Next.js config for the KK & Friends re-platform (Phase 0).
//
// The site content still lives as static HTML under /public (strangler
// pattern: pages move into app/ one at a time as they gain dynamic
// features). These rules reproduce the clean-URL behaviour the old
// static deployment got from Vercel's `cleanUrls: true`, so every
// existing URL keeps working unchanged:
//
//   /            → public/index.html
//   /thoughts    → public/thoughts.html      (any top-level page)
//   /posts       → public/posts/index.html
//   /posts/slug  → public/posts/slug.html
//
// and *.html requests redirect (308) to the extensionless canonical URL.

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/posts/index.html', destination: '/posts', permanent: true },
      { source: '/posts/:slug.html', destination: '/posts/:slug', permanent: true },
      { source: '/:page.html', destination: '/:page', permanent: true },
    ];
  },
  async rewrites() {
    return {
      // afterFiles: only applies when no real file or app route matched,
      // so /api/*, /_next/* and direct asset URLs are unaffected.
      afterFiles: [
        { source: '/', destination: '/index.html' },
        { source: '/posts', destination: '/posts/index.html' },
        { source: '/posts/:slug', destination: '/posts/:slug.html' },
        { source: '/:page', destination: '/:page.html' },
      ],
    };
  },
};

export default nextConfig;
