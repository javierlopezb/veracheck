/* =============================================================
   VeraCheck — backend real (Node.js + Express)
   - POST /api/analyze-video   → Gemini (@google/genai) analiza el video
   - GET  /api/factcheck       → Google Fact Check Tools API
   - GET  /api/health          → estado de configuración del servidor
============================================================= */

import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const FACT_CHECK_API_KEY = process.env.GOOGLE_FACT_CHECK_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

const MAX_FILE_SIZE = 80 * 1024 * 1024; // 80 MB
const ALLOWED_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const ALLOWED_EXTENSIONS = [".mp4", ".webm", ".mov"];

const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isAllowed = ALLOWED_MIME_TYPES.includes(file.mimetype) || ALLOWED_EXTENSIONS.includes(ext);
    if (!isAllowed) {
      cb(new Error("UNSUPPORTED_FILE_TYPE"));
      return;
    }
    cb(null, true);
  }
});

/* ---------- prompt para Gemini ---------- */

const ANALYSIS_PROMPT = `Analiza este video de una red social y responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown y sin comillas invertidas, con exactamente esta forma:

{
  "summary": "resumen breve del video en español",
  "transcript": "transcripción o resumen del audio detectado, en español",
  "onscreenText": ["texto detectado en pantalla, uno por elemento"],
  "claims": [
    {
      "text": "afirmación verificable extraída del video",
      "timestamp": "mm:ss aproximado",
      "category": "Política | Salud | Economía | Social | Otro",
      "confidence": 0
    }
  ],
  "manipulationNote": "una nota breve indicando que la detección de manipulación/deepfake no es concluyente"
}

Reglas:
- Identifica como máximo 3 afirmaciones verificables (claims). Si no hay ninguna, usa un arreglo vacío.
- "confidence" es un número entero de 0 a 100 que representa qué tan seguro estás de haber identificado correctamente esa afirmación (no es una calificación de veracidad).
- No inventes información que no esté en el video. Si no puedes determinar algo, indícalo brevemente en el campo correspondiente.
- No afirmes de forma concluyente que el video es o no es un deepfake.
- Responde solo con el objeto JSON.`;

function extractJson(rawText) {
  if (!rawText) throw new Error("EMPTY_RESPONSE");
  const cleaned = rawText.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("NO_JSON_FOUND");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeAnalysis(parsed) {
  const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    transcript: typeof parsed.transcript === "string" ? parsed.transcript : "",
    onscreenText: Array.isArray(parsed.onscreenText) ? parsed.onscreenText.filter((t) => typeof t === "string") : [],
    claims: claims.slice(0, 3).map((c) => ({
      text: typeof c.text === "string" ? c.text : "",
      timestamp: typeof c.timestamp === "string" ? c.timestamp : "00:00",
      category: typeof c.category === "string" ? c.category : "Otro",
      confidence: Number.isFinite(c.confidence) ? Math.max(0, Math.min(100, Math.round(c.confidence))) : 50
    })).filter((c) => c.text),
    manipulationNote: typeof parsed.manipulationNote === "string"
      ? parsed.manipulationNote
      : "No concluyente. El sistema no certifica deepfakes."
  };
}

/* Espera a que el archivo subido a Gemini termine de procesarse (necesario para video) */
async function waitForFileActive(fileName, { timeoutMs = 120000, intervalMs = 4000 } = {}) {
  const startedAt = Date.now();
  let file = await ai.files.get({ name: fileName });
  while (file.state === "PROCESSING") {
    if (Date.now() - startedAt > timeoutMs) throw new Error("FILE_PROCESSING_TIMEOUT");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    file = await ai.files.get({ name: fileName });
  }
  if (file.state !== "ACTIVE") throw new Error("FILE_PROCESSING_FAILED");
  return file;
}

/* ---------- POST /api/analyze-video ---------- */

app.post("/api/analyze-video", (req, res) => {
  upload.single("video")(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError.message === "UNSUPPORTED_FILE_TYPE"
        ? "Formato no admitido. Usa MP4, WEBM o MOV."
        : "El archivo supera el tamaño máximo permitido (80 MB).";
      res.status(400).json({ error: message });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No se recibió ningún archivo de video." });
      return;
    }

    if (!ai) {
      await fs.unlink(req.file.path).catch(() => {});
      res.status(503).json({ error: "El análisis con IA no está configurado en el servidor (falta GEMINI_API_KEY)." });
      return;
    }

    let uploadedFile = null;

    try {
      uploadedFile = await ai.files.upload({
        file: req.file.path,
        config: { mimeType: req.file.mimetype || "video/mp4" }
      });

      const activeFile = await waitForFileActive(uploadedFile.name);

      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: createUserContent([
          createPartFromUri(activeFile.uri, activeFile.mimeType),
          ANALYSIS_PROMPT
        ]),
        config: { responseMimeType: "application/json", temperature: 0.2 }
      });

      const parsed = extractJson(result.text);
      const analysis = normalizeAnalysis(parsed);
      res.json(analysis);
    } catch (error) {
      console.error("Error en /api/analyze-video:", error);
      res.status(502).json({ error: "No se pudo analizar el video en este momento." });
    } finally {
      await fs.unlink(req.file.path).catch(() => {});
      if (uploadedFile?.name) {
        await ai.files.delete({ name: uploadedFile.name }).catch(() => {});
      }
    }
  });
});

/* ---------- GET /api/factcheck ---------- */

app.get("/api/factcheck", async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (!query) {
    res.status(400).json({ error: "Falta el parámetro de búsqueda.", found: false, results: [] });
    return;
  }

  if (!FACT_CHECK_API_KEY) {
    res.status(503).json({ error: "La consulta de verificaciones no está configurada (falta GOOGLE_FACT_CHECK_API_KEY).", found: false, results: [] });
    return;
  }

  try {
    const url = new URL("https://factchecktools.googleapis.com/v1alpha1/claims:search");
    url.searchParams.set("query", query);
    url.searchParams.set("languageCode", "es");
    url.searchParams.set("pageSize", "5");
    url.searchParams.set("key", FACT_CHECK_API_KEY);

    const response = await fetch(url);
    if (!response.ok) {
      res.status(502).json({ error: "No se pudo consultar verificaciones publicadas.", found: false, results: [] });
      return;
    }

    const data = await response.json();
    const claims = Array.isArray(data.claims) ? data.claims : [];

    const results = [];
    claims.forEach((claim) => {
      const reviews = Array.isArray(claim.claimReview) ? claim.claimReview : [];
      reviews.forEach((review) => {
        results.push({
          claim: claim.text || "",
          textualRating: review.textualRating || "",
          publisherName: review.publisher?.name || "",
          publisherSite: review.publisher?.site || "",
          reviewUrl: review.url || "",
          reviewDate: review.reviewDate || "",
          languageCode: review.languageCode || ""
        });
      });
    });

    res.json({ found: results.length > 0, results: results.slice(0, 5) });
  } catch (error) {
    console.error("Error en /api/factcheck:", error);
    res.status(502).json({ error: "No se pudo consultar verificaciones publicadas.", found: false, results: [] });
  }
});

/* ---------- GET /api/health ---------- */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(GEMINI_API_KEY),
    factCheckConfigured: Boolean(FACT_CHECK_API_KEY)
  });
});

app.listen(PORT, () => {
  console.log(`VeraCheck escuchando en http://localhost:${PORT}`);
  if (!GEMINI_API_KEY) console.warn("Aviso: GEMINI_API_KEY no está configurada. El análisis con IA quedará deshabilitado.");
  if (!FACT_CHECK_API_KEY) console.warn("Aviso: GOOGLE_FACT_CHECK_API_KEY no está configurada. La búsqueda de verificaciones fallará.");
});
