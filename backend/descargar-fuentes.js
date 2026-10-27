"use strict";
/**
 * descargar-fuentes.js — Aloja las fuentes de Google Fonts dentro del
 * proyecto (descarga única) para que la app no se comunique con servicios
 * externos. Así la IP de quien usa la página no se filtra a terceros y el
 * sitio funciona incluso sin internet.
 *
 * Uso:  node descargar-fuentes.js
 *
 * Qué hace:
 *   1. Pide a Google Fonts el CSS de las familias usadas por style.css.
 *   2. Descarga los .woff2 de los subconjuntos latin y latin-ext
 *      (cubren el español completo: tildes, ñ, ¿ y ¡).
 *   3. Escribe frontend/assets/fonts/*.woff2 y frontend/assets/fonts/fuentes.css
 *      con las reglas @font-face apuntando a esos archivos locales.
 *
 * Para actualizar las fuentes en el futuro: volver a correr este script.
 * (Las fuentes están licenciadas con SIL Open Font License: se pueden
 * alojar localmente sin problema.)
 */

const fs = require("fs");
const path = require("path");

/* Mismas familias y pesos que la línea de @import original de style.css. */
const CSS_URL =
  "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700" +
  "&family=IBM+Plex+Sans:wght@400;500;600;700" +
  "&family=IBM+Plex+Mono:wght@500;600&display=swap";

/* Navegador moderno: hace que Google devuelva woff2 (más liviano). */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CARPETA = path.join(__dirname, "..", "frontend", "assets", "fonts");
const CSS_SALIDA = path.join(CARPETA, "fuentes.css");
const SUBCONJUNTOS = new Set(["latin", "latin-ext"]);

function slug(texto) {
  return texto.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function campo(bloque, re) {
  const m = bloque.match(re);
  return m ? m[1].trim() : null;
}

async function bajar(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("El servidor respondió " + r.status + " para " + url);
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  console.log("Pidiendo el listado de fuentes a Google Fonts...");
  const cssResp = await fetch(CSS_URL, { headers: { "User-Agent": UA } });
  if (!cssResp.ok) throw new Error("Google Fonts respondió " + cssResp.status);
  const css = await cssResp.text();

  /* Google precede cada @font-face con un comentario de subconjunto:
     /* latin *\/  @font-face { ... }  */
  const partes = css.split(/\/\*\s*([a-z-]+)\s*\*\//i);
  fs.mkdirSync(CARPETA, { recursive: true });

  const caras = [];
  let bajados = 0;

  for (let i = 1; i + 1 < partes.length; i += 2) {
    const subconjunto = partes[i];
    const bloque = partes[i + 1];
    if (!SUBCONJUNTOS.has(subconjunto)) continue;

    const familia = campo(bloque, /font-family:\s*'([^']+)'/);
    const peso = campo(bloque, /font-weight:\s*([^;]+);/);
    const estilo = campo(bloque, /font-style:\s*([^;]+);/);
    const rango = campo(bloque, /unicode-range:\s*([^;]+);/);
    const url = campo(bloque, /url\((https:\/\/[^)]+\.woff2)\)/);
    if (!familia || !peso || !estilo || !url) continue;

    const archivo = `${slug(familia)}-${peso.replace(/\s+/g, "-")}-${estilo}-${subconjunto}.woff2`;
    const destino = path.join(CARPETA, archivo);

    if (!fs.existsSync(destino) || fs.statSync(destino).size === 0) {
      const buf = await bajar(url);
      if (!buf.length) throw new Error("Archivo vacío: " + url);
      fs.writeFileSync(destino, buf);
      bajados++;
    }

    caras.push(
      [
        `/* ${familia} — ${peso} ${estilo} (${subconjunto}) — alojada localmente */`,
        "@font-face {",
        `  font-family: '${familia}';`,
        `  font-style: ${estilo};`,
        `  font-weight: ${peso};`,
        "  font-display: swap;",
        `  src: url('${archivo}') format('woff2');`,
        rango ? `  unicode-range: ${rango};` : "",
        "}",
        "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (!caras.length) throw new Error("No se reconoció ningún bloque @font-face.");

  const cabecera =
    "/* fuentes.css — generado por backend/descargar-fuentes.js. No editar a mano. */\n" +
    "/* Las fuentes viven en esta misma carpeta: la app no llama a Google. */\n\n";
  fs.writeFileSync(CSS_SALIDA, cabecera + caras.join("\n"), "utf8");

  console.log(`Listo: ${caras.length} reglas @font-face, ${bajados} archivos nuevos.`);
  console.log("CSS local: " + CSS_SALIDA);
}

main().catch((e) => {
  console.error("FALLÓ la descarga de fuentes:", e.message);
  console.error("Revisa tu conexión a internet y vuelve a correr: node descargar-fuentes.js");
  process.exit(1);
});
