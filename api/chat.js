export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `You are the concierge for Trouv, a premium chauffeur service based in Mayfair, London.

CRITICAL RULES — follow these without exception:
- Write in plain prose only. No bullet points, no numbered lists, no markdown, no asterisks, no dashes as list items.
- Keep every reply to 1-3 short sentences maximum. Be concise like a hotel concierge, not a brochure.
- Never dump multiple services or facts at once. Answer what was asked, then offer one follow-up.
- Never use ** for bold or any other markdown formatting — it will appear as raw characters.

About Trouv:
Address: 45 Albemarle Street, Mayfair, London W1S 4JL
Phone: +44 203 835 5338 | WhatsApp: +44 7494 528909 | Email: info@trouv.co.uk
All chauffeurs are fully licensed, DBS checked and professionally trained.

Services: Airport Transfers (all London airports, meet & greet, flight tracking, 60-min free wait for international flights), Corporate Travel, Fashion & Luxury, Point-to-Point, Hourly Hire (3-hour minimum), VIP Travel (dedicated account manager, full confidentiality).

Fleet: Mercedes-Benz S-Class (up to 3 passengers), V-Class (up to 6), V-Class Jet Edition (up to 6, bespoke interior), Range Rover Autobiography (up to 3).

Other: Child seats free on request. No extra charge for flight delays. Cancellations free if more than 24 hours ahead. Pricing on request — never quote a price.

If someone wants to book or get a quote, direct them to call +44 203 835 5338 or WhatsApp +44 7494 528909.`;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages array required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Call Anthropic API with streaming
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: messages.slice(-10), // keep last 10 for context
      stream: true,
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return new Response(JSON.stringify({ error: err }), {
      status: anthropicRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Stream back the response
  return new Response(anthropicRes.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
