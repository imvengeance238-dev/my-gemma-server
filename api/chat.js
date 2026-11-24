export default async function handler(req, res) {
  // যেকোনো অ্যাপ বা ওয়েবসাইট থেকে রিকোয়েস্ট এলাউ করার জন্য (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' });
  }

  const { prompt, useSearch = true } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    let webContext = '';

    // ১. ওয়েব সার্চ চালু থাকলে Tavily থেকে লাইভ তথ্য আনা
    if (useSearch && process.env.TAVILY_API_KEY) {
      const searchRes = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: prompt,
          search_depth: 'basic',
          max_results: 3
        })
      });

      const searchData = await searchRes.json();
      if (searchData.results && searchData.results.length > 0) {
        webContext = searchData.results
          .map((r, i) => `[Source ${i + 1}: ${r.title}] ${r.content}`)
          .join('\n\n');
      }
    }

    // ২. মডেলের জন্য মূল নির্দেশনা সাজানো
    const systemMessage = webContext
      ? `You are a helpful AI assistant. Answer the user's request accurately using the live web search information provided below. If the answer is in Bengali, reply in clear Bengali.\n\nWeb Search Results:\n${webContext}`
      : `You are a helpful AI assistant. Reply clearly in the user's language.`;

    // ৩. OpenRouter-এর মাধ্যমে ফ্রি মডেলে রিকোয়েস্ট পাঠানো
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt }
        ]
      })
    });

    const aiData = await aiRes.json();

    if (!aiRes.ok) {
      return res.status(500).json({ error: 'AI Provider Error', details: aiData });
    }

    const reply = aiData.choices?.[0]?.message?.content || 'No response generated.';

    return res.status(200).json({
      success: true,
      reply: reply,
      searched: Boolean(webContext)
    });

  } catch (error) {
    return res.status(500).json({ error: 'Server Error', message: error.message });
  }
}
