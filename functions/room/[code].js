import { routeToRoom } from '../../server/src/routing.js';

export function onRequest({ request, env, params }) {
  return routeToRoom(request, env, params.code);
}
