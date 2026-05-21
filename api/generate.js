export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'GROQ_API_KEY no configurada en Vercel.' } });
  }

  try {
    const body = req.body;
    const groqBody = {
      model: 'llama-3.3-70b-versatile',
      max_tokens: body.max_tokens || 1000,
      messages: body.messages || []
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(groqBody)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: { message: data.error?.message || 'Error de Groq' } });
    }

    const translated = {
      content: [
        {
          type: 'text',
          text: data.choices?.[0]?.message?.content || ''
        }
      ]
    };

    res.status(200).json(translated);
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
}
