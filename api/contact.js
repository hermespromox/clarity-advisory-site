const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function send(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function clean(value, max = 1200) {
  return String(value || '').trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return send(res, 500, { error: 'RESEND_API_KEY manquant côté serveur' });

  const payload = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}');
  if (clean(payload.website, 200)) return send(res, 200, { ok: true }); // honeypot anti-spam

  const name = clean(payload.name, 120);
  const email = clean(payload.email, 180);
  const context = clean(payload.context, 240);
  const message = clean(payload.message, 1800);

  if (!name || !isEmail(email) || !context || !message) {
    return send(res, 400, { error: 'Champs requis manquants' });
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeContext = escapeHtml(context);
  const safeMessage = escapeHtml(message);

  const to = process.env.CONTACT_TO_EMAIL || process.env.CONTACT_TO || 'hermes.promox@gmail.com';
  const from = process.env.RESEND_FROM || 'Clarity Advisory <onboarding@resend.dev>';
  const subject = `Nouvelle demande d’audit Clarity Advisory — ${name}`;
  const text = [
    'Nouvelle demande d’audit association médicale',
    '',
    `Nom : ${name}`,
    `Email : ${email}`,
    `Spécialité / structure : ${context}`,
    '',
    'Situation :',
    message,
    '',
    'Action : répondre sous 24h ouvrées.',
  ].join('\n');

  const html = `
    <h2>Nouvelle demande d’audit association médicale</h2>
    <p><strong>Nom :</strong> ${safeName}</p>
    <p><strong>Email :</strong> ${safeEmail}</p>
    <p><strong>Spécialité / structure :</strong> ${safeContext}</p>
    <p><strong>Situation :</strong></p>
    <p style="white-space:pre-wrap">${safeMessage}</p>
    <hr />
    <p>Action : répondre sous 24h ouvrées.</p>
  `;

  const resendResponse = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, reply_to: email, subject, text, html }),
  });

  const result = await resendResponse.json().catch(() => ({}));
  if (!resendResponse.ok) return send(res, 502, { error: result.message || 'Erreur Resend' });

  return send(res, 200, { ok: true, id: result.id });
};
