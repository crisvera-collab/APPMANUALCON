/* Batería de pruebas: lenguaje adolescente + consultas fuera de contexto. */
const ia = require("./backend/ia");

const CONTEXTO = [
  "q hago si un man me odia",
  "me bulinguearon en el salon",
  "los kmpañeros se burlan de mi",
  "me robaron el celu",
  "el profe me tiene mania",
  "toy re atrasado con las notas",
  "me dicen groserias",
  "puedo usar el cell en clase",
  "me castigaron sin razon",
  "nos agarramos a pases",
  "kiero saber si es verdad que prohíben el celu",
  "me expulsaron del salon",
  "me amenazan por wpp",
  "un man me pide las tareas",
  "me dejaron botado",
  "está permitido que me graben",
  "me pusieron falta por nada",
  "q dice el manual sobre el recreo",
  "me quieren echar del colegio",
];

const FUERA = [
  "fortnite",
  "letra de una cancion",
  "como consigo novia",
  "quien gano el partido",
  "explicame la tabla periodica",
  "me gusta una chica del salon",
  "que clima hace hoy",
  "cuanto es 25 x 3",
  "chiste de programadores",
  "quien es el presidente",
];

(async () => {
  let fallos = 0;
  console.log("=== DEBE RESPONDER (contexto del manual) ===");
  for (const q of CONTEXTO) {
    const d = await ia.responderPregunta(q, "estudiante");
    const ok = !!d.articulo;
    if (!ok) fallos++;
    console.log(ok ? "OK  " : "FALLA", "|", q.padEnd(45), "|", (d.texto.split("\n")[0] || "").slice(0, 55));
  }
  console.log("\n=== DEBE QUEDARSE EN EL MANUAL / NO INVENTAR ===");
  for (const q of FUERA) {
    const d = await ia.responderPregunta(q, "estudiante");
    const fuera = /Manual de Convivencia del Colegio OEA I\.E\.D\., y yo respondo/.test(d.texto) || /No encontré un artículo/.test(d.texto);
    if (!fuera) fallos++;
    console.log(fuera ? "OK  " : "FALLA", "|", q.padEnd(45), "|", (d.texto.split("\n")[0] || "").slice(0, 55));
  }
  console.log(fallos === 0 ? "\nTODAS LAS PRUEBAS PASARON" : `\n${fallos} FALLOS`);
})();
