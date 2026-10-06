// /desk — the old public KK Daily / KK Weekly index.
//
// Since 2026-10-06 the editions are members-only and listed in the lounge.
// This page only forwards: links shared as /desk?slug=… go to the edition's
// own address (which checks membership), everything else to the lounge tab.
const slug = new URLSearchParams(location.search).get('slug');
location.replace(slug && /^[\w-]{1,64}$/.test(slug) ? `/desk/${encodeURIComponent(slug)}` : '/voices?tab=desk');
