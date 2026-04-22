

export default function middleware(request) {
  const url = new URL(request.url);

  // 1. Any request with user agent containing "w3st"
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  if (ua.includes('w3st')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. Any request from country code AU to /api/ routes
  const country = (request.headers.get('x-vercel-ip-country') || '').toUpperCase();
  if (url.pathname.startsWith('/api/') && country === 'AU') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
