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

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
TROUV CHAUFFEURS – PRICING & DISPATCH INSTRUCTIONS
---

VEHICLE CAPACITY RULE
Passenger and luggage capacity must always be respected.

Mercedes-Benz E-Class: 1–3 passengers. Up to 2 large suitcases and 2 small
Mercedes-Benz S-Class: 1–3 passengers. Up to 2 large suitcases and 2 small
Mercedes-Benz V-Class: 4–7 passengers. Up to 6 large suitcases and 3 small
Range Rover Autobiography: 1–3 passengers. Up to 3 large suitcases and 1 small

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
Use this ONLY if: Journey involves an airport AND location is NOT Central London
Minimum Charge: £120 + VAT (includes first 5 miles)

Per-Mile Rates
E-Class: 5–50 miles → £3 per mile. 50+ miles → £2.5 per mile
S-Class / V-Class: 5–50 miles → £4 per mile. 50+ miles → £3.5 per mile
Range Rover: 5–50 miles → £5.5 per mile. 50+ miles → £4.5 per mile

FORMULA (CRITICAL)
Airport Distance Pricing: Final price = minimum charge + ((total miles - 5) × per-mile rate)

---
STANDARD DISTANCE PRICING (No Airport)
Use this ONLY if: Journey does NOT involve any airport

Minimum Charge
E-Class → £75 + VAT
S-Class / V-Class → £100 + VAT
Range Rover → £150 + VAT
(includes first 10 miles)

Per-Mile Rates
E-Class: 10–50 miles → £3 per mile. 50+ miles → £2.5 per mile
S-Class / V-Class: 10–50 miles → £4 per mile. 50+ miles → £3.5 per mile
Range Rover: 10–50 miles → £5.5 per mile. 50+ miles → £4.5 per mile

FORMULA
Standard Pricing: Final price = minimum charge + ((total miles - 10) × per-mile rate)

---
HOURLY HIRE & WAITING TIME
Minimum hourly booking: 4 hours

Hourly Rates:
E-Class → £50 + VAT/hour
S-Class → £75 + VAT/hour
V-Class → £75 + VAT/hour
Range Rover → £100 + VAT/hour

WAITING TIME RULE (CRITICAL):
If a client requests waiting time in addition to an A to B journey (e.g., waiting at an airport, or going to a meeting, having the car wait, then continuing), you MUST add the cost of the waiting time to the base journey price.
Waiting time cost = (Hours of waiting) * (Hourly rate of the selected vehicle).
Example: S-Class Heathrow to Central London (£165) + 3 hours waiting (£225) = £390 + VAT.

---
DISTANCE CALCULATION RULE (CRITICAL)
If you need to calculate a distance to provide a quote, you MUST use the 'get_driving_distance' tool to obtain the exact driving mileage.
Do NOT estimate the distance using your internal knowledge. Always use the tool.

---
ROUNDING RULE
Always round final price to nearest whole pound. Never show decimals.

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
Never mix pricing models
Never override fixed pricing
Always return price as: £X + VAT

---
LEAD CAPTURE INSTRUCTIONS (CRITICAL)
Your job is to act as a quoting bot AND a lead capturer.
1. Detect and extract: pickup, dropoff, date/time, passengers, luggage, vehicle preference, flight/train number (if airport).
2. If the user expresses intent to proceed with a booking (e.g., "arrange it", "yes", "book it"), politely ask for their Name, Email address, AND Phone number if any are missing. Advise them you need both (email for confirmation, phone for driver updates).
3. ONCE you have BOTH the full journey details AND ALL their contact details (Name, Email, AND Phone), you MUST trigger the 'submit_lead_to_team' tool.

---
WHATSAPP STYLE RULE
Write naturally, not like a form.
Keep it concise and premium.
NEVER show the calculation steps or breakdown. ONLY provide the final calculated price.
NEVER explicitly mention the names of our pricing policies (e.g., do not say "I am using Standard Distance Pricing"). Just seamlessly provide the quote.

---
FORMAT
Pickup to Drop-off on date at time in a vehicle for X passengers with X luggage — the rate is £X + VAT. Let me know if you'd like me to arrange it.

---
CRITICAL SYSTEM NOTE (FOR AI INTEGRATION)
Price must be calculated externally when possible. AI must NOT invent pricing.
CRITICAL: Do NOT show the client the math formula (e.g., £X + (Y miles * £Z)).
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
          name: 'get_driving_distance',
          description: 'Get the exact driving distance in miles between two locations. Use this before calculating any quote that relies on distance based pricing.',
          parameters: {
            type: 'object',
            properties: {
              origin: { type: 'string', description: 'The pickup location address or city' },
              destination: { type: 'string', description: 'The drop-off location address or city' }
            },
            required: ['origin', 'destination']
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
          model: 'gpt-4o-mini',
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
              reply: "Excellent. I have collected all your details and securely forwarded them to our dispatch team. They will review your request and be in touch shortly to confirm your booking. Have a wonderful day!" 
            }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });

          } else if (toolCall.function.name === 'get_driving_distance') {
            const args = JSON.parse(toolCall.function.arguments);
            let distanceResult = "Error: Distance calculation failed.";

            if (googleMapsKey) {
              try {
                const mapsUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=${encodeURIComponent(args.origin)}&destinations=${encodeURIComponent(args.destination)}&key=${googleMapsKey}`;
                const mapsRes = await fetch(mapsUrl);
                const mapsData = await mapsRes.json();
                
                if (mapsData.rows && mapsData.rows[0].elements && mapsData.rows[0].elements[0].status === 'OK') {
                  distanceResult = mapsData.rows[0].elements[0].distance.text; // e.g. "45.2 mi"
                } else {
                  console.error("Google Maps API returned non-OK status or missing data:", JSON.stringify(mapsData));
                  distanceResult = "Error: Could not find driving distance.";
                }
              } catch (e) {
                console.error("Fetch to Google Maps API failed:", e);
                distanceResult = "Error: Network request failed.";
              }
            } else {
              distanceResult = "Error: GOOGLE_MAPS_API_KEY is not configured on the server.";
            }

            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: JSON.stringify({ exact_driving_distance: distanceResult })
            });

            // Need to process next tool or loop again
            allToolsExecuted = false;
          }
        }
        
        if (!allToolsExecuted) {
          maxCalls--;
          continue; // Loop again and let OpenAI generate a response based on the tool result
        }

      } else {
        // No tool calls, AI returned normal text response
        finalResponseText = responseMessage.content;
        break;
      }
    }

    if (!finalResponseText) {
      finalResponseText = "I apologize, but I encountered an error calculating the distance. Please email us at info@trouv.co.uk.";
    }

    return new Response(JSON.stringify({ reply: finalResponseText }), {
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
