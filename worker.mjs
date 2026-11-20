const forbidden = /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/i;

function publicURL(value) {
  const url = new URL(value);
  const host = url.hostname.replace(/\.$/, '');
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      url.port || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(host) ||
      !/[a-z]/i.test(host.split('.').at(-1)) || forbidden.test(host)) {
    throw new Error('Enter a public HTTP or HTTPS webpage address.');
  }
  return url;
}

async function extract(input, origin) {
  let url = publicURL(input);
  const signal = AbortSignal.timeout(12000);
  for (let hop = 0; hop < 5; hop++) {
    if (url.hostname === new URL(origin).hostname) throw new Error('Enter an external webpage address.');
    const response = await fetch(url, {
      signal, redirect: 'manual',
      headers: {Accept: 'text/html,application/xhtml+xml'}
    });
    if ([301,302,303,307,308].includes(response.status)) {
      await response.body?.cancel();
      url = publicURL(new URL(response.headers.get('location'), url).href);
      continue;
    }
    if (!response.ok) throw new Error('The website returned HTTP ' + response.status + '. It may restrict automated access.');
    if (!/html/i.test(response.headers.get('content-type') || '')) throw new Error('This address did not return an HTML webpage.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '', bytes = 0, partial = false;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      const remaining = 1800000 - bytes;
      html += decoder.decode(value.subarray(0, remaining), {stream: true});
      bytes += value.length;
      if (bytes > 1800000) {
        partial = true;
        await reader.cancel();
        break;
      }
    }
    html += decoder.decode();
    return {html, url: url.href, partial};
  }
  throw new Error('The page redirected too many times.');
}

export default {
  async fetch(request) {
    const {pathname, origin} = new URL(request.url);
    if (pathname === '/api/extract' && request.method === 'POST') {
      if (request.headers.get('origin') !== origin) return new Response(null, {status: 403});
      try {
        const input = await request.text();
        if (input.length > 4096) throw new Error('The webpage address is too long.');
        const payload = await extract(input, origin);
        return Response.json(payload, {headers: {'Cache-Control': 'no-store'}});
      } catch (error) {
        const message = error instanceof TypeError || error.name === 'TimeoutError'
          ? 'The webpage could not be reached or the request timed out.'
          : error.message;
        return Response.json({error: message}, {status: 422});
      }
    }
    if (request.method !== 'GET') return new Response(null, {status: 405});
    if (pathname === '/study-font.ttf') return new Response(Uint8Array.from(atob(FONT), char => char.charCodeAt(0)), {headers: {'Content-Type': 'font/ttf', 'Cache-Control': 'public, max-age=86400'}});
    if (pathname === '/pdf-lib.js') return new Response(PDF_JS, {headers: {'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400'}});
    if (pathname !== '/') return new Response('Page not found', {status: 404});
    return new Response(PAGE, {headers: {'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'}});
  }
};
