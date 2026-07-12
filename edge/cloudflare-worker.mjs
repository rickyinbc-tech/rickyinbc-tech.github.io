import redirectConfig from "./redirect-map.json" with { type: "json" };

const redirects = redirectConfig.redirects;
const safeQueryParameters = new Set(redirectConfig.preserveQueryParameters);

function redirectDestination(requestUrl, destination) {
  const target = new URL(destination, requestUrl.origin);
  for (const [key, value] of requestUrl.searchParams) {
    if (safeQueryParameters.has(key.toLowerCase())) target.searchParams.append(key, value);
  }
  return target;
}

export default {
  async fetch(request, env, context) {
    const requestUrl = new URL(request.url);
    const destination = redirects[requestUrl.pathname];
    if (!destination) return fetch(request);

    return Response.redirect(redirectDestination(requestUrl, destination).toString(), redirectConfig.status);
  }
};
