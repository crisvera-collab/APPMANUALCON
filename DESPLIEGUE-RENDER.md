# Cómo publicar AutomanualVCP en Render

La app ya está lista para la nube (los ajustes necesarios ya están aplicados
en el código). Solo falta subirla a GitHub y conectarla a Render.

---

## Paso 1 — Instalar Git (solo la primera vez)

1. Descarga Git desde https://git-scm.com/download/win
2. Instala con las opciones por defecto y **reinicia** PowerShell al terminar.

## Paso 2 — Crear el repositorio en GitHub

1. Crea una cuenta gratis en https://github.com si aún no tienes una.
2. Arriba a la derecha: **+ → New repository**.
3. Nombre: `APPMANUALCON` (o el que prefieras).
4. Déjalo en **Private** (privado) si no quieres que el código sea público.
5. **No** marques "Add a README" ni nada más. Crea el repositorio vacío.

## Paso 3 — Subir el proyecto a GitHub

Abre PowerShell **en la carpeta del proyecto** y ejecuta uno por uno:

```powershell
cd "C:\Users\crisv\OneDrive\Documentos\APPMANUALCON"

git init
git add .
git commit -m "AutomanualVCP listo para Render"
git branch -M mai
git remote add origin https://github.com/TU-USUARIO/APPMANUALCON.git
git push -u origin main
```

Al ejecutar `git push`, Windows te pedirá las credenciales de GitHub:
usa un **Personal Access Token** (no tu contraseña). Si no sabes crearlo:
GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
→ Generate new token (alcance `repo`).

> Nota: la primera subida tarda unos minutos porque incluye el PDF oficial
> (10 MB). El archivo `.gitignore` que se agregó evita subir `node_modules`
> y los logs.

## Paso 4 — Crear el servicio en Render

1. Entra a https://render.com y crea una cuenta (puedes iniciar sesión con GitHub).
2. **New → Web Service**.
3. Conecta tu cuenta de GitHub y elige el repositorio `APPMANUALCON`.
4. Render detecta el archivo `render.yaml` y rellena todo solo. Si algo no se
   completa automáticamente, usa estos valores:
   - **Name**: `manual-convivencia-oea`
   - **Root Directory**: `backend`
   - **Runtime**: Node
   - **Build Command**: `npm ci`
   - **Start Command**: `npm start`
5. En **Advanced (plan)** deja el plan **Free**.
6. Crea el servicio y espera 2–3 minutos mientras hace el primer despliegue.

## Paso 5 — Probar

Cuando el servicio aparezca en verde, entra a la URL que te da Render
(p. ej. `https://manual-convivencia-oea.onrender.com`):

- `https://manual-convivencia-oea.onrender.com/` → página principal
- `https://manual-convivencia-oea.onrender.com/api/salud` → `{"ok":true,"articulos":413}`
- Prueba el chat y la búsqueda del manual.

## Cómo actualizar la app más adelante

Después de cada cambio en el código, en PowerShell:

```powershell
cd "C:\Users\crisv\OneDrive\Documentos\APPMANUALCON"
git add .
git commit -m "Descripción del cambio"
git push
```

Render detecta el push y vuelve a desplegar solo.

---

## Notas importantes

- **Plan Free**: el servicio se "duerme" tras 15 minutos sin uso y tarda
  ~30–60 segundos en despertar en la primera visita. El chat ya reintenta
  automáticamente, así que la persona usuaria solo ve una espera breve.
  Si quieres que nunca se duerma, cambia a un plan de pago en Render.
- **El manual original (PDF)** queda disponible en
  `https://TU-APP.onrender.com/documents/ManualColegioOEA2026.pdf`
- **Datos**: la app no usa base de datos; todo el manual vive en
  `backend/data/manualData.js` (generado desde el texto oficial).
  Si cambias el manual, ejecuta `npm run build` dentro de `backend/`
  y sube el resultado.
- **Seguridad**: las cabeceras de seguridad, el límite de peticiones por IP
  y la validación de entrada siguen activos en Render. El límite ahora sí
  aplica por usuario real (Render informa la IP de cada visitante).
n