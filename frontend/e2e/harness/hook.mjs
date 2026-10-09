// Resolve hook: the app's server/db.ts (Neon websocket driver) is swapped for
// db-shim.ts (node-postgres). The shim's own imports resolve as if from server/db.ts.
let appDbUrl, shimUrl;
export function initialize(data) { appDbUrl = data.appDbUrl; shimUrl = data.shimUrl; }
export async function resolve(specifier, context, next) {
  if (context.parentURL === shimUrl) return next(specifier, { ...context, parentURL: appDbUrl });
  const r = await next(specifier, context);
  return r.url === appDbUrl ? { ...r, url: shimUrl } : r;
}
