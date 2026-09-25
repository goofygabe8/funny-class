const CODE_RE = /^[A-Z0-9]{5}$/;
const ALLOWED_ORIGINS = [
  /^https:\/\/([a-z0-9-]+\.)?gabes-class\.pages\.dev$/,
  /^https:\/\/goofygabe8\.github\.io$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

export function originAllowed(origin) {
  // Browsers always send Origin; non-browser clients could fake it anyway, so a missing header is allowed.
  return !origin || ALLOWED_ORIGINS.some((re) => re.test(origin));
}

// Shared by the Worker and the Pages Function so both enforce the same checks.
export async function routeToRoom(request, env, rawCode) {
  const code = String(rawCode || '').toUpperCase();
  if (!CODE_RE.test(code)) return new Response('Bad lobby code', { status: 400 });
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
  if (!originAllowed(request.headers.get('Origin'))) return new Response('Origin not allowed', { status: 403 });
  return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
}
