/**
 * The widget is meant to be embedded on arbitrary third-party sites, so its
 * API routes must answer cross-origin requests. There's no cookie/session
 * auth involved (the visitorToken travels in the JSON body), so a wildcard
 * origin doesn't widen what a caller can do -- it can already call these
 * routes directly with any origin header it likes.
 */
export const widgetCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
