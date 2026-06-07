// ===========================================================
// RADIOSAILOR — proxy server (Node, per Render / Fly / Railway / VPS)
// -----------------------------------------------------------
// Reincapsula gli stream radio HTTP (anche su porte non standard
// come :8002 o :7115) in HTTPS e aggiunge gli header CORS, così
// suonano e si registrano dentro il sito Analogic Edition (HTTPS).
//
// USO:  https://<tuo-host>/?u=<URL-stream-encoded>
// Nessuna dipendenza esterna: solo moduli nativi di Node.
// ===========================================================

const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 8080;

// Per blindare il proxy, sostituisci "*" con "https://analogic-edition.pro"
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function pipeStream(target, clientReq, clientRes, depth) {
  let u;
  try { u = new URL(target); }
  catch (e) {
    clientRes.writeHead(400, { ...CORS, "Content-Type": "text/plain" });
    return clientRes.end("Bad ?u= URL");
  }

  const mod = u.protocol === "https:" ? https : http;
  const upReq = mod.request(
    u,
    { method: "GET", headers: { "User-Agent": "RadioSailor/1.0", "Icy-MetaData": "0" } },
    (upRes) => {
      const code = upRes.statusCode || 200;

      // segui i redirect (max 4 salti)
      if ([301, 302, 303, 307, 308].includes(code) && upRes.headers.location && depth < 4) {
        upRes.resume(); // scarta il corpo
        const next = new URL(upRes.headers.location, u).toString();
        return pipeStream(next, clientReq, clientRes, depth + 1);
      }

      clientRes.writeHead(code, {
        ...CORS,
        "Cache-Control": "no-cache",
        "Content-Type": upRes.headers["content-type"] || "audio/mpeg",
      });
      upRes.pipe(clientRes);
    }
  );

  upReq.on("error", (err) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { ...CORS, "Content-Type": "text/plain" });
    }
    clientRes.end("Upstream error: " + err.message);
  });

  clientReq.on("close", () => upReq.destroy());
  upReq.end();
}

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }

    let target = null;
    try { target = new URL(req.url, "http://localhost").searchParams.get("u"); } catch (e) {}

    if (!target) {
      res.writeHead(400, { ...CORS, "Content-Type": "text/plain" });
      return res.end("Missing ?u= parameter");
    }
    pipeStream(target, req, res, 0);
  })
  .listen(PORT, () => console.log("RadioSailor proxy listening on " + PORT));
