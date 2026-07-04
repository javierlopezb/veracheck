# VeraCheck — Prototipo académico

Capa de fact-checking simulada visualmente sobre un feed de video corto, con análisis real opcional impulsado por IA.

- Los 3 casos predefinidos (Política, Salud, Social) y el modo manual de video local son **100% simulados**: no requieren servidor ni claves.
- El botón **"Analizar video con IA"** usa un backend real: sube el video a Gemini para extraer afirmaciones y las contrasta con Google Fact Check Tools API.

## 1. Instalar dependencias

```
npm install
```

## 2. Configurar las claves

Copia el archivo de ejemplo:

```
cp .env.example .env
```

Abre `.env` y pega tus propias claves:

```
GEMINI_API_KEY=tu_key_de_google_ai_studio
GOOGLE_FACT_CHECK_API_KEY=tu_key_de_google_cloud
```

- `GEMINI_API_KEY`: obtenla en https://aistudio.google.com/apikey
- `GOOGLE_FACT_CHECK_API_KEY`: habilita "Fact Check Tools API" en Google Cloud Console y genera una clave de API.

`.env` nunca se sube al repositorio (está en `.gitignore`).

## 3. Iniciar el servidor

```
npm start
```

## 4. Abrir la aplicación

Abre en el navegador:

```
http://localhost:3000
```

## Notas

- Si no configuras las claves, la app sigue funcionando en modo simulado; solo el botón "Analizar video con IA" mostrará un aviso indicando que falta configuración.
- Tamaño máximo de video: 80 MB. Formatos admitidos: MP4, WEBM, MOV.
- El servidor borra el archivo temporal local y el archivo subido a Gemini apenas termina cada análisis.
- Este prototipo no certifica la veracidad total de un video ni detecta deepfakes de forma concluyente. Es una herramienta orientativa que no reemplaza la revisión humana.
