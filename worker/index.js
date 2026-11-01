/* Worker Cloudflare : sert le site statique et expose l'assistant pédagogique.
   La clé OpenRouter et le mot de passe restent côté serveur (secrets Cloudflare, ou .env en local). */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-5.5';
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 2000;
const MAX_CONTEXT_CHARS = 16000;

const SYSTEM = `Tu es l'assistant pédagogique de « Onde par onde », une plateforme d'apprentissage de l'électrocardiogramme pour des étudiants en médecine qui préparent leurs examens et concours.

L'étudiant regarde un tracé ECG précis. Sa description est fournie entre les balises <trace>. Les tracés sont synthétiques (modèle dipolaire du cœur) : ils reproduisent les critères diagnostiques, pas la variabilité d'un vrai patient.

Ta mission : expliquer « pourquoi ce diagnostic » et « pourquoi pas tel autre », en t'appuyant sur ce qu'on voit sur CE tracé (ondes, intervalles, dérivations, fréquence, régularité) et sur le mécanisme électrophysiologique.

Règles :
- Réponds en français, de façon concise : 100 à 220 mots. Utilise des listes courtes (pas de tableaux) et mets en gras les signes clés.
- Pour un « pourquoi pas X », compare point par point les critères de X avec ce qu'on observe sur le tracé, puis indique le signe qui permet de trancher.
- Appuie-toi sur la description du tracé. Si une information n'y figure pas, dis-le au lieu d'inventer.
- La partie « MESURES EXTRAITES DU TRACÉ » donne les valeurs réellement présentes sur le tracé affiché : battements numérotés avec leur heure, intervalles RR, PR, RP, durée des QRS, QT, amplitudes par dérivation, repères annotés et mesure au compas de l'étudiant. Quand l'étudiant parle du « premier intervalle », du « deuxième battement » ou d'une dérivation, utilise cette numérotation et cite les valeurs exactes en ms ou en mV (1 mV = 10 mm à 10 mm/mV, 40 ms = 1 petit carreau à 25 mm/s).
- Reste dans le domaine de l'ECG et de la cardiologie ; si la question en sort, recentre poliment.
- C'est un outil d'apprentissage : pour un vrai patient, la décision revient au médecin. Reste prudent sur les doses et renvoie aux recommandations.`;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

// comparaison en temps constant sur les empreintes : ne révèle ni le contenu ni la longueur du mot de passe
async function passwordOk(given, env) {
  if (!env.CHAT_PASSWORD || typeof given !== 'string' || !given) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(env.CHAT_PASSWORD))
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function readJson(request) {
  try { return await request.json(); } catch (e) { return null; }
}

async function handleAuth(request, env) {
  if (!env.CHAT_PASSWORD) return json({ error: 'Mot de passe non configuré sur le serveur (CHAT_PASSWORD).' }, 500);
  const body = await readJson(request);
  return (await passwordOk(body && body.password, env)) ? json({ ok: true }) : json({ error: 'Mot de passe incorrect.' }, 401);
}

// la clé peut s'appeler OPEN_ROUTER_API (nom choisi dans .env) ou OPENROUTER_API_KEY
const apiKey = env => env.OPEN_ROUTER_API || env.OPENROUTER_API_KEY;

async function handleChat(request, env, url) {
  if (!(await passwordOk(request.headers.get('X-Chat-Password'), env))) return json({ error: 'Mot de passe incorrect.' }, 401);
  if (!apiKey(env)) return json({ error: 'Clé OpenRouter non configurée sur le serveur (OPEN_ROUTER_API).' }, 500);

  const body = await readJson(request);
  if (!body || !Array.isArray(body.messages) || !body.messages.length) return json({ error: 'Requête invalide.' }, 400);
  const messages = body.messages.slice(-MAX_MESSAGES)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'Requête invalide.' }, 400);
  const context = typeof body.context === 'string' ? body.context.slice(0, MAX_CONTEXT_CHARS) : '';

  const upstream = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey(env)}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': url.origin,
      'X-Title': 'ECG Onde par Onde'
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL || DEFAULT_MODEL,
      stream: true,
      // la réflexion est obligatoire pour ce modèle : effort réduit, budget total assez large pour qu'elle
      // ne coupe pas la réponse (environ 300 mots de réponse + la réflexion)
      max_tokens: 2000,
      reasoning: { effort: 'low', exclude: true },
      temperature: 0.3,
      messages: [{ role: 'system', content: `${SYSTEM}\n\n<trace>\n${context || 'Aucune description fournie.'}\n</trace>` }, ...messages]
    })
  });

  if (!upstream.ok || !upstream.body) {
    let detail = '';
    try { const j = await upstream.json(); detail = (j.error && j.error.message) || ''; } catch (e) { /* corps non JSON */ }
    return json({ error: `OpenRouter a refusé la requête (${upstream.status})${detail ? ' : ' + detail.slice(0, 200) : ''}.` }, 502);
  }
  // flux SSE relayé tel quel au navigateur : la réponse s'affiche au fil de l'eau
  return new Response(upstream.body, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
      try {
        if (url.pathname === '/api/auth') return await handleAuth(request, env);
        if (url.pathname === '/api/chat') return await handleChat(request, env, url);
      } catch (e) {
        return json({ error: 'Erreur interne de l’assistant.' }, 500);
      }
      return json({ error: 'Introuvable.' }, 404);
    }
    return env.ASSETS.fetch(request);
  }
};
