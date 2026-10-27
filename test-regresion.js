/* Regresión: comportamiento previo (crisis, sugerencias, nota, relacionadas). */
const ia = require("./backend/ia");

const CASOS = [
  { q: "no quiero vivir", label: "crisis (Línea 123)" },
  { q: "acoso en redes sociales", label: "acoso/ciberacoso" },
  { q: "tardanzas del docente", label: "tardanza docente" },
  { q: "copiar en el examen", label: "copiar examen" },
  { q: "hola", label: "saludo" },
  { q: "me robaste la madre", label: "grosería" },
  { q: "cuantos cupos hay en el colegio", label: "consulta general" },
];

(async () => {
  let fallos = 0;
  for (const { q, label } of CASOS) {
    const d = await ia.responderPregunta(q, "estudiante");
    const problemas = [];
    if (!d.texto) problemas.push("sin texto");
    if (!d.nota) problemas.push("sin nota");
    if (!Array.isArray(d.sugerencias)) problemas.push("sugerencias no-array");
    if (!Array.isArray(d.relacionadas)) problemas.push("relacionadas no-array");
    if (q === "no quiero vivir" && !/123/.test(d.texto)) problemas.push("crisis sin Línea 123");
    if (problemas.length) fallos++;
    console.log(
      problemas.length ? "FALLA" : "OK  ",
      "|", label.padEnd(22), "|",
      (d.texto.split("\n")[0] || "").slice(0, 48),
      "| sug:", (d.sugerencias || []).length,
      "| rel:", (d.relacionadas || []).length,
      problemas.join(", ")
    );
  }
  // Contrato de la API: /api/chat devuelve { texto, articulo, pasos, sugerencias, relacionadas, nota, rol }
  const d = await ia.responderPregunta("me robaron el celular", "docente");
  const faltan = ["texto", "articulo", "pasos", "sugerencias", "relacionadas", "nota", "rol"].filter((k) => !(k in d));
  if (faltan.length) { fallos++; console.log("FALLA | contrato API, faltan campos:", faltan.join(", ")); }
  else console.log("OK   | contrato API completo (los 7 campos)");
  console.log(fallos === 0 ? "\nREGRESIÓN OK" : `\n${fallos} FALLOS`);
})();
