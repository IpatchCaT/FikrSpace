import {createServer} from 'node:http';
import worker from './dist/server/index.js';

createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const url = new URL(incoming.url, 'http://' + incoming.headers.host);
    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined
    });
    const response = await worker.fetch(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500).end('Preview error');
  }
}).listen(Number(process.env.PORT || 4173), '0.0.0.0');
