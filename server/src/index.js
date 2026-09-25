import { Room } from './room.js';
import { routeToRoom } from './routing.js';

export { Room };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    const m = url.pathname.match(/^\/room\/([^/]+)$/);
    if (m) return routeToRoom(request, env, m[1]);
    return new Response('Not found', { status: 404 });
  },
};
