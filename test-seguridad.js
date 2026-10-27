"use strict";
/**
 * test-seguridad.js — Verifica las protecciones del servidor:
 *   cabeceras de seguridad, CORS restringido, límite de peticiones por IP,
 *   tamaños acotados, respuestas JSON sin fugas y fuentes alojadas en local.
 *
 * Uso:
 *   1) Levantar una instancia de prueba:  PORT=3001 HOST=127.0.0.1 node backend/server.js
 *   2) node test-seguridad.js                       (usa http://127.0.0.1:3001)
 *      BASE=http://localhost:3000 node test-seguridad.js   (contra el servidor real)
 *
 * IMPORTANTE: correrlo contra una instancia que no esté en uso: la prueba de
 * límite de peticiones agota la cuota de 30 consultas/minuto de esa IP.
 */

const BASE = process.env.BASE || "http://127.0.0.1:3001";

let pasan = 0;
let fallan = 0;

function verificador(cond, nombre, detalle) {
  if (cond) {
    pasan++;
    console.log("OK   | " + nombre);
  } else {
    fallan++;
    console.log("FALLA| " + nombre + (detalle ? "  -> " + detalle : ""));
  }
}

async function encabezados(url, opciones) {
  const r = await fetch(BASE + url, opciones);
  return { status: r.status, h: r.headers, body: await r.text(), json: null };
}

async function principal() {
  console.log("Base: " + BASE + "\n");

  /* ---------------------- 1) Cabeceras de seguridad -------------------- */
  const salud = await encabezados("/api/salud");
  verificador(salud.status === 200, "salud responde 200");
  verificador(!salud.h.get("x-powered-by"), "no revela X-Powered-By");
  verificador(salud.h.get("cache-control") === "no-store", "API sin caché (no-store)");
  let j = null;
  try { j = JSON.parse(salud.body); } catch (_) {}
  verificador(j && j.ok === true && j.articulos > 0, "salud devuelve { ok, articulos }", salud.body.slice(0, 80));
  verificador(j && !("uptime" in j), "salud NO expone tiempo del proceso (uptime)");

  const pagina = await encabezados("/index.html");
  const csp = pagina.h.get("content-security-policy") || "";
  verificador(pagina.status === 200, "index.html responde 200");
  verificador(pagina.h.get("x-content-type-options") === "nosniff", "cabecera nosniff");
  verificador(pagina.h.get("x-frame-options") === "DENY", "anti-clickjacking (X-Frame-Options)");
  verificador(csp.includes("frame-ancestors 'none'"), "anti-clickjacking (CSP frame-ancestors)");
  verificador(csp.includes("default-src 'self'"), "CSP: solo recursos propios");
  verificador(csp.includes("font-src 'self'"), "CSP: fuentes propias");
  verificador(!csp.includes("googleapis") && !csp.includes("gstatic"), "CSP sin Google (fuentes locales)");
  verificador((pagina.h.get("referrer-policy") || "") === "no-referrer", "Referrer-Policy: no-referrer");
  verificador(!!pagina.h.get("permissions-policy"), "Permissions-Policy presente");
  verificador((pagina.h.get("cross-origin-opener-policy") || "") === "same-origin", "Cross-Origin-Opener-Policy");

  /* ------------------------- 2) Fuentes en local ----------------------- */
  const fuentes = await encabezados("/assets/fonts/fuentes.css");
  verificador(fuentes.status === 200 && fuentes.body.includes("@font-face"), "fuentes.css local responde");
  const m = fuentes.body.match(/url\('([^']+\.woff2)'\)/);
  if (m) {
    const w = await encabezados("/assets/fonts/" + m[1]);
    verificador(w.status === 200 && w.body.length > 500, "archivo .woff2 descargable (" + m[1] + ")");
    const estilo = await encabezados("/style.css");
    verificador(
      estilo.status === 200 && !estilo.body.includes("fonts.googleapis.com"),
      "style.css ya no llama a Google Fonts"
    );
  } else {
    verificador(false, "fuentes.css contiene reglas woff2");
  }

  /* ----------------------------- 3) CORS ------------------------------- */
  const otrosOrigen = await fetch(BASE + "/api/salud", { headers: { Origin: "https://ejemplo-malo.com" } });
  verificador(
    !otrosOrigen.headers.get("access-control-allow-origin"),
    "CORS bloquea orígenes ajenos (https://ejemplo-malo.com)"
  );

  const archivo = await fetch(BASE + "/api/salud", { headers: { Origin: "null" } });
  verificador(
    archivo.headers.get("access-control-allow-origin") === "null",
    "CORS permite file:// (Origin: null)"
  );

  const liveServer = await fetch(BASE + "/api/salud", { headers: { Origin: "http://localhost:5173" } });
  verificador(
    liveServer.headers.get("access-control-allow-origin") === "http://localhost:5173",
    "CORS permite localhost con otro puerto"
  );

  const red = await fetch(BASE + "/api/salud", { headers: { Origin: "http://192.168.1.50:3000" } });
  verificador(
    !red.headers.get("access-control-allow-origin"),
    "CORS no expone la API a orígenes de la red (misma origen no lo necesita)"
  );

  const preflight = await fetch(BASE + "/api/chat", {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST" },
  });
  verificador(preflight.status === 204, "preflight OPTIONS responde 204");
  verificador(
    preflight.headers.get("access-control-allow-origin") === "http://localhost:5173",
    "preflight devuelve el origen permitido"
  );

  /* --------------------- 4) Contrato del chat intacto ------------------- */
  const chat = await fetch(BASE + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pregunta: "¿me pueden poner falta si llego tarde?", rol: "estudiante" }),
  });
  const rChat = await chat.json();
  const campos = ["texto", "articulo", "pasos", "sugerencias", "relacionadas", "nota", "rol"];
  verificador(chat.status === 200, "chat responde 200");
  verificador(
    campos.every((c) => rChat && Object.prototype.hasOwnProperty.call(rChat, c)),
    "chat mantiene los 7 campos de la API",
    rChat ? Object.keys(rChat).join(",") : "sin cuerpo"
  );
  verificador(
    chat.headers.get("cache-control") === "no-store",
    "respuesta del chat sin caché"
  );

  /* ------------------------ 5) Entradas acotadas ------------------------ */
  const gigante = await fetch(BASE + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pregunta: "tarde " + "x".repeat(5000), rol: "estudiante" }),
  });
  verificador(gigante.status === 200, "pregunta de 5000+ caracteres: se truncó y respondió 200", "status " + gigante.status);

  const malJson = await fetch(BASE + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{esto no es json",
  });
  let cuerpoMal = null;
  try { cuerpoMal = await malJson.json(); } catch (_) {}
  verificador(
    malJson.status === 400 && cuerpoMal && typeof cuerpoMal.error === "string",
    "JSON inválido → 400 con mensaje JSON (sin trazas)"
  );

  const pesado = await fetch(BASE + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pregunta: "a".repeat(60000) }),
  });
  verificador(pesado.status === 413, "cuerpo de 60 KB → 413 (límite 32 KB)", "status " + pesado.status);

  const qLargo = await fetch(BASE + "/api/manual?q=" + encodeURIComponent("golpear ".repeat(300)));
  verificador(qLargo.status === 200, "búsqueda con q de 2000+ caracteres → 200 acotado");

  const catMala = await fetch(BASE + "/api/manual?categoria=%3Cscript%3E");
  verificador(catMala.status === 200, "categoría inventada → 200 (se trata como 'todas')");

  const inexistente = await fetch(BASE + "/api/inexistente");
  let cuerpo404 = null;
  try { cuerpo404 = await inexistente.json(); } catch (_) {}
  verificador(
    inexistente.status === 404 && cuerpo404 && cuerpo404.error === "Ruta no encontrada.",
    "ruta de API inexistente → 404 JSON"
  );

  /* ------------------- 6) Límite de peticiones por IP ------------------- */
  /* Al final: agota la cuota de 30 chat/min de 127.0.0.1. */
  let bloqueado = null;
  let intentos = 0;
  for (; intentos < 45; intentos++) {
    const r = await fetch(BASE + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pregunta: "hola, ¿qué dice el manual?" }),
    });
    if (r.status === 429) {
      bloqueado = { h: r.headers, body: await r.json() };
      break;
    }
  }
  verificador(!!bloqueado, "tras abusar del chat llega el 429 (límite por IP)", "intentos=" + intentos);
  if (bloqueado) {
    const retry = Number(bloqueado.h.get("retry-after"));
    verificador(retry > 0, "429 incluye Retry-After en segundos", String(retry));
    verificador(
      bloqueado.body && typeof bloqueado.body.error === "string",
      "429 con mensaje amigable en JSON"
    );
  }

  /* ------------------------------ Resumen ------------------------------- */
  console.log("");
  if (fallan === 0) {
    console.log("SEGURIDAD OK — " + pasan + " comprobaciones superadas");
    process.exit(0);
  } else {
    console.log(fallan + " FALLAS de " + (pasan + fallan) + " comprobaciones");
    process.exit(1);
  }
}

principal().catch((e) => {
  console.error("No se pudo completar la prueba:", e.message);
  console.error("¿Está el servidor de prueba activo? PORT=3001 node backend/server.js");
  process.exit(1);
});
