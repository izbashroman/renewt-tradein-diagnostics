// Serverless proxy: browser calls THIS endpoint, never Anthropic directly.
// The Anthropic API key lives only here, read from an environment variable
// that you set in the Vercel dashboard (never committed to the repo).
//
// Required environment variable (set in Vercel -> Project -> Settings -> Environment Variables):
//   ANTHROPIC_API_KEY

export const config = {
  api: {
    bodyParser: { sizeLimit: '8mb' }, // 6 compressed photos can add up
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { photos, factors } = req.body || {};
  if (!Array.isArray(photos) || photos.length === 0) {
    return res.status(400).json({ error: 'At least one photo is required' });
  }
  if (!factors || typeof factors !== 'object') {
    return res.status(400).json({ error: 'factors (tier definitions) is required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });
  }

  // Build the multi-image message: each photo is preceded by a text label
  // naming which side of the device it shows.
  const content = [];
  for (const p of photos) {
    if (!p.data || !p.mediaType) continue;
    content.push({ type: 'text', text: `Фото: ${p.zone}` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: p.mediaType, data: p.data },
    });
  }

  const factorKeys = Object.keys(factors);
  const criteriaText = factorKeys.map(key => {
    const f = factors[key];
    const options = f.tiers.map((t, i) => `[${i}] ${t.label}${t.hint ? ` — ${t.hint}` : ''}`).join('\n  ');
    return `${key} (${f.label}):\n  ${options}`;
  }).join('\n\n');

  content.push({
    type: 'text',
    text: `На основі наведених фотографій пристрою оціни його стан за кожним із критеріїв нижче і обери індекс варіанту (tierIndex), який найкраще відповідає видимому стану. Якщо на фото не видно ознак дефекту — обирай варіант з найменшим tierIndex (як правило 0).

Критерії:
${criteriaText}

Поверни ВИКЛЮЧНО JSON без пояснень, без markdown-огорож, у точно такому форматі (ключі мають збігатися з переліченими критеріями):
{${factorKeys.map(k => `"${k}":{"tierIndex":0,"confidence":0.0}`).join(',')}}

confidence — число від 0 до 1, наскільки ти впевнений у своїй оцінці за даним критерієм виходячи з якості та ракурсу фото.`,
  });

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 600,
        messages: [{ role: 'user', content }],
      }),
    });

    const data = await aiRes.json();

    if (!aiRes.ok) {
      return res.status(502).json({ error: data?.error?.message || 'Anthropic API request failed' });
    }

    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) {
      return res.status(502).json({ error: 'AI response contained no text' });
    }

    let cleaned = textBlock.text.trim();
    // Defensive cleanup in case the model wraps the JSON in a code fence.
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(502).json({ error: 'AI response was not valid JSON', raw: cleaned });
    }

    return res.status(200).json({ result: parsed });
  } catch (err) {
    console.error('AI photo analysis error:', err);
    return res.status(500).json({ error: 'Internal proxy error' });
  }
}
