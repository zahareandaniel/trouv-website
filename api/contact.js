import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const config = { runtime: 'edge' };

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const ratelimit =
  redis &&
  new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(3, '1 h'),
    prefix: 'ratelimit:contact',
  });

function corsHeaders(origin) {
  const o = origin || '';
  const allowed =
    /^https:\/\/(www\.)?trouv\.co\.uk$/i.test(o) ||
    /^http:\/\/127\.0\.0\.1:\d+$/i.test(o) ||
    /^http:\/\/localhost:\d+$/i.test(o) ||
    /^https:\/\/[^\s.]+\.vercel\.app$/i.test(o);
  if (!allowed) {
    return { Vary: 'Origin' };
  }
  return {
    Vary: 'Origin',
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getClientIp(req) {
  const xff = req.headers?.get?.('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0].trim();
  }

  const realIp = req.headers?.get?.('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return 'unknown';
}

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const ua = (req.headers.get('user-agent') || '').toLowerCase();
  if (ua.includes('w3st-recon') || ua.includes('contact-flood') || ua.includes('trouv-loop')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  // ── Country allowlist — Europe, Middle East, USA only ──
  const ALLOWED_COUNTRIES = new Set([
    'GB','IE','FR','DE','IT','ES','PT','NL','BE','LU','CH','AT','DK','SE','NO','FI',
    'IS','GR','CY','MT','PL','CZ','SK','HU','RO','BG','HR','SI','EE','LV','LT',
    'AL','BA','ME','MK','RS','MD','UA','BY','RU','SM','MC','LI','AD','VA','XK',
    'AE','SA','QA','KW','BH','OM','JO','LB','IL','IQ','TR','EG','YE','SY','IR','PS',
    'US',
  ]);
  const countryCode = req.headers.get('x-vercel-ip-country') || '';
  if (countryCode && !ALLOWED_COUNTRIES.has(countryCode.toUpperCase())) {
    return new Response(JSON.stringify({ error: 'Service not available in your region.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  // ── IPQualityScore VPN / proxy detection ──
  const ipqsKey = process.env.IPQS_API_KEY;
  if (ipqsKey) {
    try {
      const ipToCheck = getClientIp(req);
      if (ipToCheck && ipToCheck !== 'unknown') {
        const ipqsRes = await fetch(
          `https://ipqualityscore.com/api/json/ip/${ipqsKey}/${encodeURIComponent(ipToCheck)}?strictness=1&allow_public_access_points=false`
        );
        if (ipqsRes.ok) {
          const ipqsData = await ipqsRes.json();
          if (ipqsData.success && (ipqsData.vpn === true || ipqsData.proxy === true)) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
            });
          }
        }
      }
    } catch (e) {
      console.error('[Trouv] IPQS check error (contact):', e);
    }
  }

  if (ratelimit) {
    const ip = getClientIp(req);
    const { success } = await ratelimit.limit(ip);

    if (!success) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        }
      );
    }
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = (process.env.CONTACT_TO_EMAIL || 'info@trouv.co.uk').trim();
  const from = (process.env.CONTACT_FROM_EMAIL || '').trim();

  if (!apiKey || !from) {
    return new Response(
      JSON.stringify({
        error:
          'Email delivery is not configured. Add RESEND_API_KEY and CONTACT_FROM_EMAIL in Vercel.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  const trap = String(body.company || '').trim();
  if (trap !== '') {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  const name = String(body.name || '').trim().slice(0, 200);
  const email = String(body.email || '').trim().slice(0, 320);
  const phone = String(body.phone || '').trim().slice(0, 80);
  const serviceLabel = String(body.service_label || '').trim().slice(0, 160);
  const serviceValue = String(body.service || '').trim().slice(0, 120);
  const message = String(body.message || '').trim().slice(0, 8000);

  if (!name || !email || !phone || !message) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'Invalid email' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  // ── Fake TLD / blocked pattern check ──
  const emailLower = email.toLowerCase();
  const nameLower  = name.toLowerCase();
  const fakeTlds = ['.example', '.test', '.invalid', '.localhost', '.local', '.internal', '.fake'];
  const blockedPatterns = ['w3st', 'contact-flood', 'trouv-loop'];
  const isOfcom = phone.replace(/\D/g, '').startsWith('447700900') || phone.replace(/\D/g, '').startsWith('07700900');
  if (
    fakeTlds.some(t => emailLower.endsWith(t)) ||
    blockedPatterns.some(p => emailLower.includes(p) || nameLower.includes(p)) ||
    isOfcom
  ) {
    // Honeypot — fake success, log everything
    console.warn(`[TRAP:contact] IP: ${getClientIp(req)} | Name: ${name} | Email: ${email} | Phone: ${phone}`);
    await new Promise(r => setTimeout(r, 5000));
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  const serviceLine =
    serviceLabel || serviceValue || 'Not specified';

  const html = `<p><b>Name:</b> ${esc(name)}</p>
<p><b>Email:</b> ${esc(email)}</p>
<p><b>Phone:</b> ${esc(phone)}</p>
<p><b>Service:</b> ${esc(serviceLine)}</p>
<p><b>Journey details:</b></p>
<p>${esc(message).replace(/\r?\n/g, '<br>')}</p>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: email,
      subject: `Trouv quote request from ${name}`,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return new Response(
      JSON.stringify({
        error: 'Could not send email. Please try again or contact info@trouv.co.uk.',
        detail: detail.slice(0, 400),
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      }
    );
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}
