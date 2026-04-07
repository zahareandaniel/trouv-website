export const config = { runtime: 'edge' };

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

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'OpenAI API key is missing. Add OPENAI_API_KEY in Vercel or .env.local.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      }
    );
  }

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid messages array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // ==========================================
    // ⬇️ PRICING FORMULA & SYSTEM PROMPT ⬇️
    // You can modify the prices, distance formulas, and instructions here!
    // ==========================================
    const systemPrompt = `
You are the official digital concierge for 'Trouv', a premium luxury chauffeur service based in Mayfair, London.
You communicate in British English. Your tone is highly professional, discreet, elegant, and helpful.

---
TROUV CHAUFFEURS – PRICING & DISPATCH INSTRUCTIONS
---

VEHICLE CAPACITY RULE
Passenger and luggage capacity must always be respected.

Mercedes-Benz E-Class
1–3 passengers
Up to 2 large suitcases and 2 small

Mercedes-Benz S-Class
1–3 passengers
Up to 2 large suitcases and 2 small

Mercedes-Benz V-Class
4–7 passengers
Up to 6 large suitcases and 3 small

Range Rover Autobiography
1–3 passengers
Up to 3 large suitcases and 1 small

---
CRITICAL VEHICLE LOGIC
If passengers exceed 3 → ALWAYS use Mercedes-Benz V-Class
If luggage exceeds sedan capacity → ALWAYS use Mercedes-Benz V-Class
If both passengers and luggage fit sedan → allow E-Class or S-Class
Range Rover is optional upgrade, not default
Do NOT ask customer for vehicle if it can be determined

---
AIRPORT FIXED PRICES (Central London ONLY)
Airport Fixed Prices MUST always be used when applicable.
Never calculate distance pricing if a fixed price applies.

Heathrow
E-Class → £110 + VAT
S-Class → £165 + VAT
V-Class → £165 + VAT
Range Rover → £210 + VAT

Gatwick
E-Class → £155 + VAT
S-Class → £220 + VAT
V-Class → £220 + VAT
Range Rover → £300 + VAT

Stansted
E-Class → £155 + VAT
S-Class → £230 + VAT
V-Class → £230 + VAT
Range Rover → £300 + VAT

Luton
E-Class → £155 + VAT
S-Class → £230 + VAT
V-Class → £230 + VAT
Range Rover → £300 + VAT

London City Airport
E-Class → £100 + VAT
S-Class → £140 + VAT
V-Class → £140 + VAT
Range Rover → £180 + VAT

---
CENTRAL LONDON DEFINITION
Central London includes (but not limited to):
SW1, W1, WC1, WC2, EC1, EC2, EC3, EC4, SE1, SW3, SW7, W8, W2, SW10, W11, W9, SE1,SE11,SW8,SW11,SW18

If pickup OR drop-off is within these → Fixed Pricing applies

---
AIRPORT DISTANCE PRICING (Non-Central London)
Use this ONLY if:
Journey involves an airport AND location is NOT Central London

Minimum Charge
£120 + VAT (includes first 5 miles)

Per-Mile Rates
E-Class
5–50 miles → £3 per mile
50+ miles → £2.5 per mile

S-Class / V-Class
5–50 miles → £4 per mile
50+ miles → £3.5 per mile

Range Rover
5–50 miles → £5.5 per mile
50+ miles → £4.5 per mile

FORMULA (CRITICAL)
Airport Distance Pricing:
Final price = minimum charge + ((total miles - 5) × per-mile rate)
Example (V-Class): 28 miles total
= £120 + ((28 - 5) × £4)
= £120 + £92
= £212 + VAT

---
STANDARD DISTANCE PRICING (No Airport)
Use this ONLY if: Journey does NOT involve any airport

Minimum Charge
E-Class → £75 + VAT
S-Class / V-Class → £100 + VAT
Range Rover → £150 + VAT
(includes first 10 miles)

Per-Mile Rates
E-Class
10–50 miles → £3 per mile
50+ miles → £2.5 per mile

S-Class / V-Class
10–50 miles → £4 per mile
50+ miles → £3.5 per mile

Range Rover
10–50 miles → £5.5 per mile
50+ miles → £4.5 per mile

FORMULA
Standard Pricing:
Final price = minimum charge + ((total miles - 10) × per-mile rate)

---
DISTANCE CALCULATION RULE
Always use Google Maps distance
If distance is in km → convert to miles (1 km = 0.621371 miles)

---
ROUNDING RULE
Always round final price to nearest whole pound. Never show decimals.

---
HOURLY HIRE
Minimum booking: 4 hours
E-Class → £50 + VAT/hour
S-Class → £75 + VAT/hour
V-Class → £75 + VAT/hour
Range Rover → £100 + VAT/hour

---
PRICING SELECTION LOGIC (VERY IMPORTANT)
1. Check if journey involves an airport
2. If YES → check if location is Central London
→ YES → use Fixed Pricing
→ NO → use Airport Distance Pricing
3. If NO airport → use Standard Distance Pricing

---
FINAL RULES
Always follow vehicle capacity rules
Always follow pricing selection logic
Never mix pricing models
Never override fixed pricing
Never estimate if a rule exists
Always return price as: £X + VAT

---
AI INSTRUCTIONS
1. Identify airport involvement
2. Detect Central London postcode
3. Select correct pricing model
4. Select correct vehicle
5. Calculate correct price
6. If vehicle unclear → ask
7. If vehicle clear → do NOT ask

---
WHATSAPP STYLE RULE
Write naturally, not like a form
Keep it concise and premium
No repetition
No robotic tone

---
FORMAT
Pickup to Drop-off on date at time in a vehicle for X passengers with X luggage — the rate is £X + VAT. Let me know if you'd like me to arrange it.

---
CRITICAL SYSTEM NOTE (FOR AI INTEGRATION)
Price must be calculated externally when possible
AI must NOT invent or estimate pricing
Always prioritise pricing rules above
`;

    const openAiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content.slice(0, 500), // security max length
      })),
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // using mini for lower latency and cost, switch to gpt-4o if needed
        messages: openAiMessages,
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI Error Details:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const replyText = data.choices[0].message.content;

    return new Response(JSON.stringify({ reply: replyText }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response(
      JSON.stringify({
        error: 'We are currently unable to connect to our quoting system. Please email info@trouv.co.uk.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      }
    );
  }
}
