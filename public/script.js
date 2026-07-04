/* =============================================================
   VeraCheck — lógica de la interfaz
   - Los 3 casos predefinidos y el modo manual siguen siendo 100% simulados.
   - "Analizar video con IA" usa el backend real (Gemini + Google Fact Check).
============================================================= */

const DEMO_CASES = {
  politica: {
    id: "politica",
    title: "Declaración sobre elecciones regionales",
    category: "Política",
    creator: "@alerta_peru_hoy",
    caption: "Atención: supuesto cambio electoral que está generando reacciones.",
    hashtags: "#Política #Perú #Actualidad",
    claim: "El Gobierno aprobó una ley que elimina las elecciones regionales.",
    verdict: "false",
    confidence: 91,
    explanation: "No se encontró evidencia consistente sobre esa ley; la afirmación coincide con un rumor recurrente ya desmentido en casos simulados anteriores.",
    sources: ["Registro electoral (simulado)", "Archivo periodístico (simulado)", "Observatorio cívico (simulado)"],
    signals: {
      stt: "Se detectó una afirmación sobre una decisión gubernamental.",
      ocr: "Texto en pantalla: «Se eliminan elecciones regionales».",
      metadata: "Cuenta de creación reciente y hashtags de alto alcance.",
      semantic: "Coincidencia alta con un rumor ya registrado en casos simulados.",
      deepfake: "Sin señales concluyentes de manipulación audiovisual."
    }
  },
  salud: {
    id: "salud",
    title: "Promesa de cura rápida",
    category: "Salud",
    creator: "@bienestar_natural",
    caption: "Una receta viral promete resultados inmediatos.",
    hashtags: "#Salud #Consejos #Viral",
    claim: "Esta bebida cura la diabetes en tres días.",
    verdict: "warning",
    confidence: 68,
    explanation: "La afirmación no presenta evidencia científica suficiente en los casos simulados y podría inducir a decisiones riesgosas.",
    sources: ["Repositorio médico (simulado)", "Guía sanitaria (simulada)", "Revisión académica (simulada)"],
    signals: {
      stt: "Se detectó una promesa médica de curación inmediata.",
      ocr: "Texto en pantalla: «Cura natural en 72 horas».",
      metadata: "Contenido promocional sin fuentes científicas visibles.",
      semantic: "No se hallaron referencias simuladas que respalden la afirmación.",
      deepfake: "No evaluable con el material de esta demostración."
    }
  },
  social: {
    id: "social",
    title: "Anuncio de becas",
    category: "Social",
    creator: "@educacion_al_dia",
    caption: "Información relevante para estudiantes que buscan oportunidades.",
    hashtags: "#Becas #Educación #Estudiantes",
    claim: "El programa de becas entregará 20 mil vacantes este año.",
    verdict: "verified",
    confidence: 88,
    explanation: "La cifra coincide con la información de referencia usada en este caso simulado.",
    sources: ["Portal educativo (simulado)", "Comunicado académico (simulado)", "Base de convocatorias (simulada)"],
    signals: {
      stt: "Se detectó una cifra sobre vacantes de becas.",
      ocr: "Texto en pantalla: «20 000 vacantes».",
      metadata: "Cuenta educativa simulada con referencias visibles.",
      semantic: "Coincidencia alta con la información de referencia del caso.",
      deepfake: "No se detectaron señales relevantes en la demostración."
    }
  }
};

const ANALYSIS_STEPS = [
  "Extrayendo audio con STT…",
  "Leyendo texto en pantalla con OCR…",
  "Analizando metadatos…",
  "Identificando afirmaciones…",
  "Contrastando con fuentes…",
  "Generando resultado…"
];

const VERDICT_META = {
  verified: { icon: "✓", label: "Verificado", hint: "Toca para ver el análisis" },
  warning: { icon: "!", label: "En duda", hint: "Toca para ver el análisis" },
  false: { icon: "×", label: "Posiblemente falso", hint: "Toca para ver el análisis" },
  no_match: { icon: "?", label: "Sin verificación publicada encontrada", hint: "Toca para ver el análisis" }
};

const ANALYSIS_DURATION_MS = 4000;
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const ALLOWED_VIDEO_EXT = [".mp4", ".webm", ".mov"];

/* Pasos mostrados durante el análisis real con IA (progreso genuino, no cronometrado) */
const REAL_ANALYSIS_STEPS = [
  "Subiendo video…",
  "Analizando audio y contenido visual…",
  "Extrayendo afirmaciones verificables…",
  "Buscando verificaciones publicadas…",
  "Generando resultado…"
];

/* Palabras usadas para clasificar la calificación textual de Google Fact Check */
const FALSE_RATING_WORDS = ["falso", "falsa", "fake", "bulo", "engañoso", "enganoso", "incorrecto", "incorrecta", "desmentido", "desmentida"];
const TRUE_RATING_WORDS = ["verdadero", "verdadera", "true", "correcto", "correcta", "verificado", "verificada"];

document.addEventListener("DOMContentLoaded", () => {
  const el = {
    demoModeBtn: document.getElementById("demoModeBtn"),
    demoSelector: document.getElementById("demoSelector"),
    caseButtons: document.querySelectorAll(".demo-case[data-case]"),

    videoFallback: document.getElementById("videoFallback"),
    localVideo: document.getElementById("localVideo"),
    localVideoInput: document.getElementById("localVideoInput"),
    localLoadBtn: document.getElementById("localLoadBtn"),
    localCard: document.getElementById("localCard"),
    localFileName: document.getElementById("localFileName"),
    localClaimInput: document.getElementById("localClaimInput"),
    localVerdictSelect: document.getElementById("localVerdictSelect"),
    analyzeLocalBtn: document.getElementById("analyzeLocalBtn"),
    resetLocalBtn: document.getElementById("resetLocalBtn"),
    analyzeAiBtn: document.getElementById("analyzeAiBtn"),
    aiStatus: document.getElementById("aiStatus"),

    feedCreator: document.getElementById("feedCreator"),
    feedCaption: document.getElementById("feedCaption"),
    feedHashtags: document.getElementById("feedHashtags"),

    veraCapsule: document.getElementById("veraCapsule"),
    capsuleStep: document.getElementById("capsuleStep"),
    capsuleProgress: document.getElementById("capsuleProgress"),

    veraTag: document.getElementById("veraTag"),
    veraTagIcon: document.getElementById("veraTagIcon"),
    veraTagLabel: document.getElementById("veraTagLabel"),

    overlay: document.getElementById("overlay"),
    detailsPanel: document.getElementById("detailsPanel"),
    detailsCloseBtn: document.getElementById("detailsCloseBtn"),
    verdictChip: document.getElementById("verdictChip"),
    confidenceRing: document.getElementById("confidenceRing"),
    confidenceValue: document.getElementById("confidenceValue"),
    claimText: document.getElementById("claimText"),
    categoryText: document.getElementById("categoryText"),
    titleText: document.getElementById("titleText"),
    explanationText: document.getElementById("explanationText"),
    demoConfigBlock: document.getElementById("demoConfigBlock"),
    simulatedBlocks: document.getElementById("simulatedBlocks"),
    sourcesList: document.getElementById("sourcesList"),
    signalStt: document.getElementById("signalStt"),
    signalOcr: document.getElementById("signalOcr"),
    signalMeta: document.getElementById("signalMeta"),
    signalSemantic: document.getElementById("signalSemantic"),
    signalDeepfake: document.getElementById("signalDeepfake"),

    realBlocks: document.getElementById("realBlocks"),
    realTranscript: document.getElementById("realTranscript"),
    realOnscreenList: document.getElementById("realOnscreenList"),
    realClaimsList: document.getElementById("realClaimsList"),
    realManipulationNote: document.getElementById("realManipulationNote")
  };

  let analysisTimers = [];
  let progressFrame = null;
  let lastFocused = null;
  let currentResult = null;
  let localVideoUrl = "";
  let localVideoFile = null;
  let aiRunning = false;

  /* ---------- utilidades ---------- */

  function isAllowedVideoFile(file) {
    const name = file.name.toLowerCase();
    return ALLOWED_VIDEO_TYPES.includes(file.type) || ALLOWED_VIDEO_EXT.some((ext) => name.endsWith(ext));
  }

  function formatSize(bytes) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /* ---------- feed / metadatos ---------- */

  function applyFeedData(item) {
    el.feedCreator.textContent = item.creator;
    el.feedCaption.textContent = item.caption;
    el.feedHashtags.textContent = item.hashtags;
  }

  /* ---------- análisis simulado ---------- */

  function stopAnalysis() {
    analysisTimers.forEach((t) => window.clearTimeout(t));
    analysisTimers = [];
    if (progressFrame) window.cancelAnimationFrame(progressFrame);
    progressFrame = null;
  }

  function showAnalyzingState() {
    el.veraTag.hidden = true;
    el.veraCapsule.hidden = false;
    el.capsuleProgress.style.width = "0%";
    el.capsuleStep.textContent = ANALYSIS_STEPS[0];
  }

  function showVerdictState(item) {
    const meta = VERDICT_META[item.verdict];
    el.veraCapsule.hidden = true;
    el.veraTag.hidden = false;
    el.veraTag.dataset.verdict = item.verdict;
    el.veraTagIcon.textContent = meta.icon;
    el.veraTagLabel.textContent = meta.label;
  }

  function fillDetailsPanel(item) {
    const meta = VERDICT_META[item.verdict];
    el.detailsPanel.dataset.mode = "simulated";
    el.simulatedBlocks.hidden = false;
    el.realBlocks.hidden = true;

    el.verdictChip.dataset.verdict = item.verdict;
    el.verdictChip.textContent = meta.label;
    el.confidenceRing.style.setProperty("--pct", item.confidence);
    el.confidenceValue.textContent = `${item.confidence}%`;
    el.claimText.textContent = `«${item.claim}»`;
    el.categoryText.textContent = item.category;
    el.titleText.textContent = item.title;
    el.explanationText.textContent = item.explanation;
    el.demoConfigBlock.hidden = !item.isLocalVideo;

    el.sourcesList.replaceChildren();
    item.sources.forEach((source) => {
      const li = document.createElement("li");
      li.textContent = source;
      el.sourcesList.append(li);
    });

    el.signalStt.textContent = item.signals.stt;
    el.signalOcr.textContent = item.signals.ocr;
    el.signalMeta.textContent = item.signals.metadata;
    el.signalSemantic.textContent = item.signals.semantic;
    el.signalDeepfake.textContent = item.signals.deepfake;

    currentResult = item;
  }

  /* ---------- clasificación de calificaciones reales ---------- */

  function classifyClaimVerdict(factCheckResults) {
    if (!Array.isArray(factCheckResults) || factCheckResults.length === 0) return "no_match";
    const ratings = factCheckResults.map((r) => (r.textualRating || "").toLowerCase());
    const hasFalse = ratings.some((rating) => FALSE_RATING_WORDS.some((word) => rating.includes(word)));
    const hasTrue = ratings.some((rating) => TRUE_RATING_WORDS.some((word) => rating.includes(word)));
    if (hasFalse && !hasTrue) return "false";
    if (hasTrue && !hasFalse) return "verified";
    return "warning";
  }

  function overallVerdictFromClaims(claimVerdicts) {
    if (claimVerdicts.length === 0) return "no_match";
    if (claimVerdicts.includes("false")) return "false";
    if (claimVerdicts.includes("warning")) return "warning";
    if (claimVerdicts.every((v) => v === "verified")) return "verified";
    return "no_match";
  }

  function setAiStatus(text, tone) {
    el.aiStatus.hidden = !text;
    el.aiStatus.textContent = text || "";
    if (tone) el.aiStatus.dataset.tone = tone;
    else delete el.aiStatus.dataset.tone;
  }

  function renderClaimSources(container, results) {
    container.replaceChildren();
    if (!Array.isArray(results) || results.length === 0) {
      const li = document.createElement("li");
      li.textContent = "Sin verificación publicada encontrada";
      container.append(li);
      return;
    }
    results.forEach((result) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${result.publisherName || "Medio verificador"} · ${result.textualRating || "Calificación no indicada"}`;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Abrir verificación";
      button.disabled = !result.reviewUrl;
      button.addEventListener("click", () => {
        if (result.reviewUrl) window.open(result.reviewUrl, "_blank", "noopener,noreferrer");
      });
      li.append(label, button);
      container.append(li);
    });
  }

  function fillRealDetailsPanel(analysis, claimsWithResults, overallVerdict) {
    const meta = VERDICT_META[overallVerdict];
    el.detailsPanel.dataset.mode = "real";
    el.simulatedBlocks.hidden = true;
    el.realBlocks.hidden = false;
    el.demoConfigBlock.hidden = true;

    const confidences = claimsWithResults.map((c) => c.claim.confidence).filter((n) => Number.isFinite(n));
    const avgConfidence = confidences.length ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : 0;

    el.verdictChip.dataset.verdict = overallVerdict;
    el.verdictChip.textContent = meta.label;
    el.confidenceRing.style.setProperty("--pct", avgConfidence);
    el.confidenceValue.textContent = confidences.length ? `${avgConfidence}%` : "N/D";
    el.claimText.textContent = claimsWithResults[0] ? `«${claimsWithResults[0].claim.text}»` : "No se detectaron afirmaciones verificables.";
    el.categoryText.textContent = claimsWithResults[0]?.claim.category || "Otro";
    el.titleText.textContent = "Análisis con IA";
    el.explanationText.textContent = analysis.summary || "Sin resumen disponible.";

    el.realTranscript.textContent = analysis.transcript || "No se detectó transcripción de audio.";

    el.realOnscreenList.replaceChildren();
    const onscreen = Array.isArray(analysis.onscreenText) ? analysis.onscreenText : [];
    if (onscreen.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No se detectó texto en pantalla.";
      el.realOnscreenList.append(li);
    } else {
      onscreen.forEach((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        el.realOnscreenList.append(li);
      });
    }

    el.realClaimsList.replaceChildren();
    if (claimsWithResults.length === 0) {
      const li = document.createElement("li");
      li.className = "claim-card";
      li.textContent = "El análisis no identificó afirmaciones verificables en este video.";
      el.realClaimsList.append(li);
    } else {
      claimsWithResults.forEach(({ claim, verdict, results }) => {
        const li = document.createElement("li");
        li.className = "claim-card";

        const top = document.createElement("div");
        top.className = "claim-card-top";
        const badge = document.createElement("span");
        badge.className = "claim-card-verdict";
        badge.dataset.verdict = verdict;
        badge.textContent = VERDICT_META[verdict].label;
        top.append(badge);

        const text = document.createElement("p");
        text.className = "claim-card-text";
        text.textContent = `«${claim.text}»`;

        const metaLine = document.createElement("p");
        metaLine.className = "claim-card-meta";
        metaLine.textContent = `${claim.category || "Otro"} · ${claim.timestamp || "s/t"} · confianza del modelo: ${Number.isFinite(claim.confidence) ? claim.confidence + "%" : "N/D"}`;

        const sources = document.createElement("ul");
        sources.className = "claim-card-sources";
        renderClaimSources(sources, results);

        li.append(top, text, metaLine, sources);
        el.realClaimsList.append(li);
      });
    }

    el.realManipulationNote.textContent = analysis.manipulationNote || "No concluyente. El sistema no certifica deepfakes.";

    currentResult = { verdict: overallVerdict };
  }

  function startAnalysis(item) {
    stopAnalysis();
    showAnalyzingState();

    const stepDuration = ANALYSIS_DURATION_MS / ANALYSIS_STEPS.length;
    const startedAt = performance.now();

    function tickProgress(now) {
      const elapsed = Math.min(now - startedAt, ANALYSIS_DURATION_MS);
      const percent = Math.round((elapsed / ANALYSIS_DURATION_MS) * 100);
      el.capsuleProgress.style.width = `${percent}%`;
      if (elapsed < ANALYSIS_DURATION_MS) {
        progressFrame = window.requestAnimationFrame(tickProgress);
      }
    }
    progressFrame = window.requestAnimationFrame(tickProgress);

    ANALYSIS_STEPS.forEach((step, index) => {
      analysisTimers.push(window.setTimeout(() => {
        el.capsuleStep.textContent = step;
      }, Math.round(index * stepDuration)));
    });

    analysisTimers.push(window.setTimeout(() => {
      stopAnalysis();
      fillDetailsPanel(item);
      showVerdictState(item);
    }, ANALYSIS_DURATION_MS));
  }

  /* ---------- casos predefinidos ---------- */

  function loadCase(caseId) {
    const item = DEMO_CASES[caseId];
    if (!item) return;
    applyFeedData(item);
    closeDemoSelector();
    closeDetailsPanel();
    startAnalysis(item);
  }

  /* ---------- video local ---------- */

  function revokeLocalVideoUrl() {
    if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    localVideoUrl = "";
  }

  function setLocalVideoFile(file) {
    if (!isAllowedVideoFile(file)) {
      el.localFileName.textContent = "Formato no admitido. Usa MP4, WEBM o MOV.";
      el.localVideoInput.value = "";
      return;
    }

    revokeLocalVideoUrl();
    localVideoUrl = URL.createObjectURL(file);
    localVideoFile = file;
    setAiStatus("");

    el.localVideo.src = localVideoUrl;
    el.localVideo.hidden = false;
    el.videoFallback.hidden = true;
    el.localVideo.load();
    const playPromise = el.localVideo.play();
    if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => {});

    el.localCard.hidden = false;
    el.localFileName.textContent = `${file.name} · ${formatSize(file.size)}`;

    applyFeedData({
      creator: "@demo_local",
      caption: "Video local cargado para esta demostración académica.",
      hashtags: "#DemostraciónAcadémica"
    });
  }

  function resetLocalVideo() {
    revokeLocalVideoUrl();
    localVideoFile = null;
    el.localVideo.pause();
    el.localVideo.removeAttribute("src");
    el.localVideo.load();
    el.localVideo.hidden = true;
    el.videoFallback.hidden = false;
    el.localCard.hidden = true;
    el.localVideoInput.value = "";
    el.localClaimInput.value = "";
    el.localVerdictSelect.value = "warning";
    setAiStatus("");
    stopAnalysis();
    el.veraCapsule.hidden = true;
    el.veraTag.hidden = true;
    closeDetailsPanel();
  }

  function buildLocalVideoCase() {
    const verdict = el.localVerdictSelect.value;
    const claim = el.localClaimInput.value.trim() || "No se ingresó una afirmación específica para esta demostración.";
    const confidenceByVerdict = { verified: 84, warning: 65, false: 79 };
    return {
      id: "video-local",
      title: "Video local",
      category: "Video local",
      creator: "@demo_local",
      claim,
      verdict,
      confidence: confidenceByVerdict[verdict],
      explanation: "Resultado seleccionado manualmente por quien presenta la demostración; no proviene de un análisis real.",
      sources: ["Fuente simulada 1", "Fuente simulada 2", "Revisión humana requerida"],
      isLocalVideo: true,
      signals: {
        stt: "Extracción de audio simulada; no se ejecuta STT real en este prototipo.",
        ocr: "Lectura de texto en pantalla simulada; no se ejecuta OCR real.",
        metadata: "Metadatos del archivo local usados únicamente como referencia visual.",
        semantic: "La afirmación fue escrita manualmente para esta demostración.",
        deepfake: "No se realiza detección real de deepfakes en este prototipo."
      }
    };
  }

  /* ---------- análisis real con IA ---------- */

  function setRealStep(index) {
    el.capsuleStep.textContent = REAL_ANALYSIS_STEPS[index];
    el.capsuleProgress.style.width = `${Math.round(((index + 1) / REAL_ANALYSIS_STEPS.length) * 100)}%`;
  }

  async function checkBackendHealth() {
    try {
      const response = await fetch("/api/health");
      const data = await response.json();
      if (!data.geminiConfigured || !data.factCheckConfigured) {
        setAiStatus("El servidor está corriendo, pero faltan claves de API en el archivo .env.", "error");
      }
      return data;
    } catch (error) {
      setAiStatus("No se detecta el backend. Ejecuta \"npm start\" y abre la app en http://localhost:3000 para usar el análisis con IA.", "error");
      return null;
    }
  }

  async function fetchFactCheck(query) {
    try {
      const response = await fetch(`/api/factcheck?q=${encodeURIComponent(query)}`);
      const data = await response.json().catch(() => ({ found: false, results: [] }));
      if (!response.ok) return [];
      return Array.isArray(data.results) ? data.results : [];
    } catch (error) {
      return [];
    }
  }

  async function runRealAnalysis() {
    if (!localVideoFile || aiRunning) return;
    aiRunning = true;
    el.analyzeAiBtn.disabled = true;
    closeDemoSelector();
    closeDetailsPanel();
    stopAnalysis();

    el.veraTag.hidden = true;
    el.veraCapsule.hidden = false;
    setRealStep(0);
    setAiStatus("");

    try {
      const formData = new FormData();
      formData.append("video", localVideoFile);

      const uploadResponse = await fetch("/api/analyze-video", { method: "POST", body: formData });
      setRealStep(1);
      const analysis = await uploadResponse.json().catch(() => null);

      if (!uploadResponse.ok || !analysis) {
        throw new Error((analysis && analysis.error) || "No se pudo analizar el video.");
      }

      setRealStep(2);
      const claims = Array.isArray(analysis.claims) ? analysis.claims.slice(0, 3) : [];

      setRealStep(3);
      const claimsWithResults = [];
      for (const claim of claims) {
        const results = await fetchFactCheck(claim.text);
        claimsWithResults.push({ claim, results, verdict: classifyClaimVerdict(results) });
      }

      setRealStep(4);
      const overallVerdict = overallVerdictFromClaims(claimsWithResults.map((c) => c.verdict));

      fillRealDetailsPanel(analysis, claimsWithResults, overallVerdict);
      el.capsuleProgress.style.width = "100%";
      el.veraCapsule.hidden = true;
      el.veraTag.hidden = false;
      el.veraTag.dataset.verdict = overallVerdict;
      el.veraTagIcon.textContent = VERDICT_META[overallVerdict].icon;
      el.veraTagLabel.textContent = VERDICT_META[overallVerdict].label;
    } catch (error) {
      el.veraCapsule.hidden = true;
      setAiStatus("No se pudo completar el análisis con IA. Intenta nuevamente.", "error");
    } finally {
      aiRunning = false;
      el.analyzeAiBtn.disabled = false;
    }
  }

  /* ---------- panel de detalles ---------- */

  function openDetailsPanel() {
    if (el.veraTag.hidden) return;
    lastFocused = document.activeElement;
    el.overlay.hidden = false;
    el.detailsPanel.hidden = false;
    document.body.style.overflow = "hidden";
    el.detailsCloseBtn.focus();
  }

  function closeDetailsPanel() {
    el.overlay.hidden = true;
    el.detailsPanel.hidden = true;
    document.body.style.overflow = "";
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
    lastFocused = null;
  }

  function closeDemoSelector() {
    el.demoSelector.hidden = true;
    el.demoModeBtn.setAttribute("aria-expanded", "false");
  }

  /* ---------- eventos ---------- */

  el.demoModeBtn.addEventListener("click", () => {
    const willOpen = el.demoSelector.hidden;
    el.demoSelector.hidden = !willOpen;
    el.demoModeBtn.setAttribute("aria-expanded", String(willOpen));
  });

  el.caseButtons.forEach((btn) => {
    btn.addEventListener("click", () => loadCase(btn.dataset.case));
  });

  el.localLoadBtn.addEventListener("click", () => el.localVideoInput.click());
  el.localVideoInput.addEventListener("change", () => {
    const file = el.localVideoInput.files[0];
    if (file) setLocalVideoFile(file);
  });

  el.analyzeLocalBtn.addEventListener("click", () => {
    if (!localVideoUrl) return;
    const item = buildLocalVideoCase();
    closeDemoSelector();
    closeDetailsPanel();
    startAnalysis(item);
  });

  el.resetLocalBtn.addEventListener("click", resetLocalVideo);
  el.analyzeAiBtn.addEventListener("click", runRealAnalysis);

  el.veraTag.addEventListener("click", openDetailsPanel);
  el.detailsCloseBtn.addEventListener("click", closeDetailsPanel);
  el.overlay.addEventListener("click", closeDetailsPanel);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!el.detailsPanel.hidden) {
      closeDetailsPanel();
    } else if (!el.demoSelector.hidden) {
      closeDemoSelector();
      el.demoModeBtn.focus();
    }
  });

  /* ---------- estado inicial ---------- */

  el.veraCapsule.hidden = true;
  el.veraTag.hidden = true;
  el.detailsPanel.hidden = true;
  el.overlay.hidden = true;
  applyFeedData(DEMO_CASES.politica);
  startAnalysis(DEMO_CASES.politica);
  checkBackendHealth();
});
