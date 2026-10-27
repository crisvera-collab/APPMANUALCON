/* Prueba de saludos/meta vs. consultas mixtas. */
const ia = require("./backend/ia");
const CASOS = [
  "hola",
  "q onda",
  "buenas noches",
  "hola que tal",
  "q onda, me pueden ayudar con el celu?",
  "necesito ayuda con el horario",
  "gracias",
  "que eres",
  "me puedes ayudar con un castigo",
  "ayuda",
  "que temas manejas",
];
(async () => {
  for (const q of CASOS) {
    const d = await ia.responderPregunta(q, "estudiante");
    console.log(q.padEnd(45), "->", (d.texto.split("\n")[0] || "").slice(0, 52));
  }
})();
