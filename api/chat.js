import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const config = { runtime: 'edge' };

let redis = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (e) {
  console.error('[Trouv] Redis init failed:', e);
  redis = null;
}

// 3 requests per 5 hours per IP + 5 per day
// Wrapped in try/catch so an Upstash init failure never crashes the whole function
let ratelimit5h = null;
let ratelimitDay = null;
try {
  if (redis) {
    ratelimit5h = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(3, '5 h'),
      prefix: 'ratelimit:chat:5h',
    });
    ratelimitDay = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(5, '24 h'),
      prefix: 'ratelimit:chat:day',
    });
  }
} catch (e) {
  console.error('[Trouv] Rate-limit init failed — running without rate limiting:', e);
  ratelimit5h = null;
  ratelimitDay = null;
}

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

// ── Airport detection ──
function detectAirport(location) {
  const loc = (location || '').toLowerCase();
  if (loc.includes('heathrow') || loc === 'lhr') return 'heathrow';
  if (loc.includes('gatwick') || loc === 'lgw') return 'gatwick';
  if (loc.includes('stansted') || loc === 'stn') return 'stansted';
  if (loc.includes('luton') || loc === 'ltn') return 'luton';
  if (loc.includes('london city') || loc.includes('city airport') || loc === 'lcy') return 'london_city';
  return null;
}

// ── Extract postcode district from a full postcode or geocoded result ──
function extractDistrict(postcode) {
  const raw = (postcode || '').toUpperCase().trim().replace(/\s+/g, '');
  if (raw.startsWith('E1W')) return 'E1W';
  if (raw.startsWith('N1C')) return 'N1C';
  const m = raw.match(/^([A-Z]{1,2}\d{1,2})/);
  return m ? m[1] : raw;
}

// ── Heathrow postcode pricing (base prices BEFORE VAT) ──
// S-Class / V-Class base. Range Rover = base + £45.
const HEATHROW_POSTCODES = {
  // Central London — £165
  'W1': 165, 'W2': 165, 'W8': 165, 'W9': 165, 'W11': 165,
  'SW1': 165, 'SW3': 165, 'SW7': 165, 'SW10': 165,
  'WC1': 165, 'WC2': 165,
  'EC1': 165, 'EC2': 165, 'EC3': 165, 'EC4': 165,
  'SE1': 165,
  // NW — £165
  'NW1': 165, 'NW2': 165, 'NW3': 165, 'NW6': 165, 'NW8': 165, 'NW10': 165,
  // NW — £170
  'NW4': 170, 'NW5': 170, 'NW7': 170, 'NW9': 170, 'NW11': 170,
  // W — £150
  'W3': 150, 'W4': 150, 'W5': 150, 'W6': 150, 'W7': 150, 'W12': 150, 'W13': 150,
  // N — £180
  'N1': 180, 'N1C': 180, 'N2': 180, 'N5': 180, 'N6': 180, 'N7': 180, 'N19': 180,
  // N — £185
  'N8': 185, 'N10': 185, 'N15': 185, 'N16': 185,
  // N — £190
  'N3': 190, 'N9': 190, 'N11': 190, 'N12': 190, 'N14': 190,
  'N17': 190, 'N18': 190, 'N21': 190, 'N22': 190,
  // E — £175
  'E1': 175, 'E1W': 175, 'E2': 175,
  // E — £200
  'E3': 200, 'E5': 200, 'E8': 200, 'E9': 200, 'E14': 200, 'E15': 200, 'E20': 200,
  // E — £210
  'E6': 210, 'E7': 210, 'E10': 210, 'E11': 210, 'E12': 210,
  'E13': 210, 'E16': 210, 'E17': 210, 'E18': 210,
  // SW — £165
  'SW13': 165, 'SW14': 165, 'SW15': 165,
  // SW — £170
  'SW2': 170, 'SW4': 170, 'SW8': 170, 'SW9': 170, 'SW11': 170,
  'SW12': 170, 'SW17': 170, 'SW18': 170, 'SW19': 170, 'SW20': 170,
  // SW — £180
  'SW16': 180,
  // SE — £170
  'SE11': 170,
  // SE — £190
  'SE5': 190, 'SE19': 190, 'SE21': 190, 'SE24': 190, 'SE25': 190, 'SE27': 190,
  // SE — £200
  'SE15': 200, 'SE16': 200, 'SE17': 200, 'SE22': 200,
  // SE — £220
  'SE3': 220, 'SE4': 220, 'SE6': 220, 'SE7': 220, 'SE8': 220,
  'SE10': 220, 'SE12': 220, 'SE13': 220, 'SE14': 220, 'SE23': 220,
  // SE — £230
  'SE2': 230, 'SE9': 230, 'SE18': 230, 'SE28': 230,
};

// Prefix-based Heathrow prices
const HEATHROW_PREFIXES = [
  { prefix: 'TW', base: 145 },
  { prefix: 'KT', base: 165 },
  { prefix: 'UB', base: 130 },
  { prefix: 'HA', base: 150 },
];

function getHeathrowBase(district) {
  if (HEATHROW_POSTCODES[district] !== undefined) return HEATHROW_POSTCODES[district];
  for (const { prefix, base } of HEATHROW_PREFIXES) {
    if (district.startsWith(prefix)) return base;
  }
  return null;
}

// Other airports: Central London fixed prices (VAT already included)
const OTHER_AIRPORT_FIXED = {
  gatwick:     { s_class: 264, v_class: 264, range_rover: 360 },
  stansted:    { s_class: 276, v_class: 276, range_rover: 360 },
  luton:       { s_class: 276, v_class: 276, range_rover: 360 },
  london_city: { s_class: 168, v_class: 168, range_rover: 216 },
};

const CENTRAL_LONDON = new Set([
  'SW1','W1','WC1','WC2','EC1','EC2','EC3','EC4','SE1',
  'SW3','SW7','W8','W2','SW10','W11','W9'
]);

// ── The single get_quote function — does EVERYTHING ──
async function getQuote({ origin, destination, vehicle }, googleMapsKey) {
  const result = { vehicle };

  // 1. Detect airport
  const originAirport = detectAirport(origin);
  const destAirport = detectAirport(destination);
  const airport = originAirport || destAirport;
  const nonAirportLocation = originAirport ? destination : origin;

  // 2. Get distance from Google Maps (both directions, use shortest)
  let distanceMiles = null;
  if (googleMapsKey) {
    try {
      const [resAB, resBA] = await Promise.all([
        fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${googleMapsKey}`),
        fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=${encodeURIComponent(destination)}&destinations=${encodeURIComponent(origin)}&key=${googleMapsKey}`)
      ]);
      const [dataAB, dataBA] = await Promise.all([resAB.json(), resBA.json()]);

      const elAB = dataAB.rows?.[0]?.elements?.[0];
      const elBA = dataBA.rows?.[0]?.elements?.[0];

      const distAB = elAB?.status === 'OK' ? elAB.distance.value : Infinity;
      const distBA = elBA?.status === 'OK' ? elBA.distance.value : Infinity;

      if (distAB !== Infinity || distBA !== Infinity) {
        const shorterMetres = Math.min(distAB, distBA);
        distanceMiles = parseFloat((shorterMetres / 1609.344).toFixed(1));
        result.distance_miles = distanceMiles;
      }
    } catch (e) {
      console.error('Google Maps distance failed:', e);
    }
  }

  // 3. Geocode non-airport location to get postcode
  let district = null;
  if (googleMapsKey) {
    try {
      const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(nonAirportLocation)}&components=country:GB&key=${googleMapsKey}`);
      const geoData = await geoRes.json();
      if (geoData.results && geoData.results.length > 0) {
        const components = geoData.results[0].address_components || [];
        const postcodeComp = components.find(c => c.types.includes('postal_code'));
        if (postcodeComp) {
          district = extractDistrict(postcodeComp.long_name);
          result.postcode_district = district;
        }
      }
    } catch (e) {
      console.error('Geocoding failed:', e);
    }
  }

  // 4. Calculate price
  const hourlyRates = { s_class: 75, v_class: 75, range_rover: 100 };

  if (airport === 'heathrow' && district) {
    // ── HEATHROW with known postcode ──
    const base = getHeathrowBase(district);
    if (base !== null) {
      // Fixed postcode pricing
      const finalBase = vehicle === 'range_rover' ? base + 45 : base;
      result.price = Math.round(finalBase * 1.2);
      result.pricing_type = 'heathrow_postcode_fixed';
      return result;
    }
    // Postcode not in table → fall through to distance pricing
  }

  if (airport === 'heathrow' && distanceMiles) {
    // Heathrow distance pricing (postcode not in table or not geocoded)
    const baseFare = 120;
    const extraMiles = Math.max(0, distanceMiles - 5);
    const perMileRate = vehicle === 'range_rover'
      ? (distanceMiles > 50 ? 4.5 : 5.5)
      : (distanceMiles > 50 ? 3.5 : 4);
    result.price = Math.round((baseFare + extraMiles * perMileRate) * 1.2);
    result.pricing_type = 'heathrow_distance';
    return result;
  }

  if (airport && airport !== 'heathrow') {
    // ── OTHER AIRPORTS ──
    const isCentral = district ? CENTRAL_LONDON.has(district) : false;
    if (isCentral && OTHER_AIRPORT_FIXED[airport]) {
      result.price = OTHER_AIRPORT_FIXED[airport][vehicle];
      result.pricing_type = 'airport_fixed';
      return result;
    }
    if (distanceMiles) {
      const baseFare = 120;
      const extraMiles = Math.max(0, distanceMiles - 5);
      const perMileRate = vehicle === 'range_rover'
        ? (distanceMiles > 50 ? 4.5 : 5.5)
        : (distanceMiles > 50 ? 3.5 : 4);
      result.price = Math.round((baseFare + extraMiles * perMileRate) * 1.2);
      result.pricing_type = 'airport_distance';
      return result;
    }
  }

  if (!airport && distanceMiles) {
    // ── STANDARD DISTANCE (no airport) ──
    const baseFare = vehicle === 'range_rover' ? 150 : 100;
    const extraMiles = Math.max(0, distanceMiles - 10);
    const perMileRate = vehicle === 'range_rover'
      ? (distanceMiles > 50 ? 4.5 : 5.5)
      : (distanceMiles > 50 ? 3.5 : 4);
    result.price = Math.round((baseFare + extraMiles * perMileRate) * 1.2);
    result.pricing_type = 'standard_distance';
    return result;
  }

  // If we got here, something failed
  result.error = 'Unable to calculate price. Distance or postcode could not be determined.';
  return result;
}

// ══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';

  // Handle CORS preflight
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

  if (ratelimit5h && ratelimitDay) {
    const ip = getClientIp(req);

    // Check daily limit first — if exceeded, don't consume the 5h token
    const resDay = await ratelimitDay.limit(ip);
    if (!resDay.success) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        }
      );
    }

    // Daily limit passed — now check the 5-hour window
    const res5h = await ratelimit5h.limit(ip);
    if (!res5h.success) {
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

  const resendApiKey = process.env.RESEND_API_KEY;
  const toEmail = (process.env.CONTACT_TO_EMAIL || 'info@trouv.co.uk').trim();
  const fromEmail = (process.env.CONTACT_FROM_EMAIL || '').trim();
  const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY;

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid messages array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const systemPrompt = `
You are the official digital concierge for 'Trouv', a premium luxury chauffeur service based in Mayfair, London.
You communicate in British English. Your tone is highly professional, discreet, elegant, and helpful.

---
DATE HANDLING
When a client states a date without a year, always assume the current year. Use today's date as reference: ${new Date().toDateString()}.

---
VEHICLE CAPACITY RULE
Only recommend vehicles from this list. Never suggest any other vehicle:
- Mercedes-Benz S-Class (vehicle code: s_class): up to 3 passengers, up to 3 large suitcases
- Mercedes-Benz V-Class (vehicle code: v_class): up to 6 passengers, up to 8 large suitcases
- Range Rover Autobiography (vehicle code: range_rover): up to 3 passengers, up to 3 large suitcases, VIP/premium requests only

CRITICAL VEHICLE LOGIC — ALWAYS USE THE SMALLEST SUITABLE VEHICLE
DEFAULT is S-Class. Only upgrade to V-Class if passengers OR luggage EXCEED S-Class capacity.
- Passengers ≤ 3 AND luggage ≤ 3 large items → MUST use S-Class (not V-Class)
- Passengers > 3 OR luggage > 3 large items → MUST use V-Class
- Range Rover is NEVER the default. Only use if explicitly requested by the client.
Do NOT ask customer for vehicle preference unless both S-Class and Range Rover could apply.

---
PRICING — HOW TO QUOTE (CRITICAL)
You MUST NOT do any maths or price calculations yourself.
For EVERY journey, once you have the pickup location, drop-off location, and vehicle, call the 'get_quote' tool.
The tool will return the exact final price including VAT.
Simply quote the price returned by the tool to the client.

If the tool returns an error, say: "I'm unable to calculate the exact price at this moment. Please contact us directly on +44 7494 528909 or via WhatsApp and we'll quote you immediately."

RULES:
- NEVER invent, estimate, or calculate a price yourself. Always use the tool.
- NEVER show calculation steps or breakdowns to the client.
- Quote the price as a single final number.
- NEVER append "+ VAT" — all prices from the tool already include VAT.

---
WAITING TIME
If the client requests waiting time, note it in the booking details. Minimum hourly booking is 4 hours.
Hourly rates: S-Class £90/hr, V-Class £90/hr, Range Rover £120/hr (all inclusive of VAT).

---
LEAD CAPTURE INSTRUCTIONS (CRITICAL)
Your job is to act as a quoting bot AND a lead capturer.
1. Detect and extract: pickup, dropoff, date/time, passengers, luggage, vehicle preference, flight/train number (if airport).
2. If the journey involves an airport arrival (pickup at an airport), you MUST ask for the flight number. If it is an airport departure (drop-off at an airport), ask for the flight number if possible.
3. If the user expresses intent to proceed with a booking (e.g., "arrange it", "yes", "book it") and you are missing their contact info, you MUST use this exact phrasing verbatim:
"Could you please provide me with your Name, your Email address and Phone number? This will enable me to proceed with the booking."
4. ONCE you have BOTH the full journey details AND ALL their contact details (Name, Email, AND Phone), you MUST trigger the 'submit_lead_to_team' tool.

---
STYLE RULES
Write naturally, not like a form. Keep it concise and premium.
NEVER show calculation steps, breakdowns, or policy names.
NEVER append "+ VAT" — all prices from the tool already include VAT.

FORMAT
Pickup to Drop-off on date at time in a vehicle for X passengers with X luggage — the rate is £X.
Would you like me to arrange this for you?
`;

    let currentMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content.slice(0, 500),
      })),
    ];

    const tools = [
      {
        type: 'function',
        function: {
          name: 'submit_lead_to_team',
          description: 'Submit the final booking request to the dispatch team once the user has provided their contact details and agreed to proceed.',
          parameters: {
            type: 'object',
            properties: {
              intent: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string', description: 'The email address of the client, strictly just the email string.' },
              phone: { type: 'string', description: 'The phone number of the client.' },
              pickup: { type: 'string' },
              dropoff: { type: 'string' },
              datetime: { type: 'string' },
              passengers: { type: 'string' },
              luggage: { type: 'string' },
              vehicle: { type: 'string' },
              flight_number: { type: 'string' },
              price_quoted: { type: 'string' },
              message: { type: 'string' }
            },
            required: ['intent', 'name', 'email', 'phone', 'pickup', 'dropoff', 'datetime', 'passengers', 'vehicle', 'price_quoted']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_quote',
          description: 'Get the exact price for a chauffeur journey. Pass the pickup and drop-off locations exactly as provided by the client, plus the vehicle code. The tool handles distance calculation, postcode lookup, and pricing automatically. Returns the final VAT-inclusive price.',
          parameters: {
            type: 'object',
            properties: {
              origin: { type: 'string', description: 'The exact pickup location as provided by the client (e.g. "N22 5HG", "Heathrow Terminal 3", "The Savoy Hotel")' },
              destination: { type: 'string', description: 'The exact drop-off location as provided by the client' },
              vehicle: {
                type: 'string',
                enum: ['s_class', 'v_class', 'range_rover'],
                description: 'The vehicle code: s_class, v_class, or range_rover'
              }
            },
            required: ['origin', 'destination', 'vehicle']
          }
        }
      }
    ];

    let maxCalls = 5;
    let finalResponseText = '';

    while (maxCalls > 0) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: currentMessages,
          tools: tools,
          tool_choice: 'auto',
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
      const responseMessage = data.choices[0].message;

      currentMessages.push(responseMessage);

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        let allToolsExecuted = true;

        for (const toolCall of responseMessage.tool_calls) {
          if (toolCall.function.name === 'submit_lead_to_team') {
            const args = JSON.parse(toolCall.function.arguments);

            if (!resendApiKey || !fromEmail) {
              return new Response(JSON.stringify({ 
                reply: "Thank you for confirming. However, our email system is not currently configured, so I could not forward your request. Please email us directly at info@trouv.co.uk." 
              }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
            }

            // Build conversation transcript
            let conversationLog = messages.map(m => `<b>${m.role === 'user' ? 'Client' : 'Trouv AI'}:</b> ${esc(m.content)}`).join('<br/><br/>');

            const html = `<h2>New AI Chat Lead</h2>
            <p><b>Name:</b> ${esc(args.name)}</p>
            <p><b>Email:</b> ${esc(args.email || 'N/A')}</p>
            <p><b>Phone:</b> ${esc(args.phone || 'N/A')}</p>
            <hr/>
            <p><b>Pickup:</b> ${esc(args.pickup)}</p>
            <p><b>Drop-off:</b> ${esc(args.dropoff)}</p>
            <p><b>Date/Time:</b> ${esc(args.datetime)}</p>
            <p><b>Flight Number:</b> ${esc(args.flight_number || 'N/A')}</p>
            <hr/>
            <p><b>Vehicle:</b> ${esc(args.vehicle)}</p>
            <p><b>Passengers:</b> ${esc(args.passengers)}</p>
            <p><b>Luggage:</b> ${esc(args.luggage || 'N/A')}</p>
            <p><b>Quoted Price:</b> ${esc(args.price_quoted)}</p>
            <hr/>
            <p><b>Extra Notes:</b> ${esc(args.message || 'None')}</p>
            <br/><hr/>
            <h3>Full Conversation Transcript</h3>
            <p style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">${conversationLog}</p>`;

            const resEmail = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: fromEmail,
                to: [toEmail],
                reply_to: args.email && args.email.includes('@') ? args.email.trim() : undefined,
                subject: `Trouv AI Chat Lead - ${args.name}`,
                html: html,
              }),
            });

            if (!resEmail.ok) {
              console.error("Resend delivery failed", await resEmail.text());
              return new Response(JSON.stringify({ 
                reply: "Your details have been collected, but there was an issue reaching our dispatch. Please email info@trouv.co.uk so we do not miss your request." 
              }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
            }

            return new Response(JSON.stringify({ 
              reply: `Thank you, ${args.name}. Your booking request has been received. Our team will confirm to ${args.email} within 15 minutes. For urgent queries call or WhatsApp +44 7494 528909.` 
            }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });

          } else if (toolCall.function.name === 'get_quote') {
            let quoteResult;
            try {
              const args = JSON.parse(toolCall.function.arguments);
              quoteResult = await getQuote(args, googleMapsKey);
            } catch (e) {
              console.error('get_quote error:', e);
              quoteResult = { error: 'Price calculation failed.' };
            }

            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: JSON.stringify(quoteResult)
            });

            allToolsExecuted = false;
          }
        }
        
        if (!allToolsExecuted) {
          maxCalls--;
          continue;
        }

      } else {
        // No tool calls, AI returned normal text response
        finalResponseText = responseMessage.content;
        break;
      }
    }

    if (!finalResponseText) {
      finalResponseText = "I apologize, but I encountered an issue processing your request. Please email us at info@trouv.co.uk or call +44 7494 528909.";
    }

    return new Response(JSON.stringify({ reply: finalResponseText }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    
    let errorMsg = 'We are currently unable to connect to our quoting system. Please email info@trouv.co.uk.';
    if (error.message.includes('OpenAI API error: 429')) {
      errorMsg = 'Our quoting system is currently experiencing high demand. Please try again in a minute or contact us directly.';
    } else if (error.message.includes('OpenAI API error')) {
      errorMsg = 'Our AI provider is currently unavailable. Please email info@trouv.co.uk.';
    }

    return new Response(
      JSON.stringify({
        error: errorMsg,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      }
    );
  }
}
