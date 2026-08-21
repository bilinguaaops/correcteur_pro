import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

const LEADS_FILE = path.join(process.cwd(), "leads.json");

function getStoredLeads() {
  try {
    if (fs.existsSync(LEADS_FILE)) {
      return JSON.parse(fs.readFileSync(LEADS_FILE, "utf8"));
    }
  } catch (e) {
    console.error("Error reading leads:", e);
  }
  return [];
}

function saveStoredLeads(leads: any[]) {
  try {
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), "utf8");
  } catch (e) {
    console.error("Error saving leads:", e);
  }
}

// Leads API endpoints
app.post("/api/leads", (req, res) => {
  try {
    const { email, whatsapp, name, school, plan } = req.body || {};
    if (!email && !whatsapp) {
      return res.status(400).json({ error: "Un email ou un numéro WhatsApp est requis." });
    }

    const leads = getStoredLeads();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPhone = (whatsapp || "").trim();

    // Check if user already exists -> update or create
    const existingIndex = leads.findIndex((l: any) => 
      (cleanEmail && l.email === cleanEmail) || (cleanPhone && l.whatsapp === cleanPhone)
    );

    if (existingIndex >= 0) {
      // Update existing lead
      leads[existingIndex].name = (name || leads[existingIndex].name || "").trim();
      leads[existingIndex].school = (school || leads[existingIndex].school || "").trim();
      if (plan) leads[existingIndex].plan = plan;
      leads[existingIndex].updatedAt = new Date().toISOString();
      saveStoredLeads(leads);
      return res.status(200).json({ success: true, lead: leads[existingIndex] });
    }

    const lead = {
      id: "lead_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      email: cleanEmail,
      whatsapp: cleanPhone,
      name: (name || "").trim(),
      school: (school || "").trim(),
      plan: plan || "free",
      status: "active",
      createdAt: new Date().toISOString(),
      userAgent: req.headers["user-agent"] || "",
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
    };

    leads.unshift(lead);
    saveStoredLeads(leads);

    console.log("✨ Nouveau Lead Enregistré :", lead.email || lead.whatsapp);
    return res.status(200).json({ success: true, lead });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Erreur serveur" });
  }
});

// Update specific user / lead plan or details
app.patch("/api/leads/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { plan, status, notes, name, school } = req.body || {};
    const leads = getStoredLeads();
    const lead = leads.find((l: any) => l.id === id);

    if (!lead) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }

    if (plan !== undefined) lead.plan = plan;
    if (status !== undefined) lead.status = status;
    if (notes !== undefined) lead.notes = notes;
    if (name !== undefined) lead.name = name;
    if (school !== undefined) lead.school = school;
    lead.updatedAt = new Date().toISOString();

    saveStoredLeads(leads);
    return res.status(200).json({ success: true, lead });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Erreur serveur" });
  }
});

// Delete a user
app.delete("/api/leads/:id", (req, res) => {
  try {
    const { id } = req.params;
    let leads = getStoredLeads();
    leads = leads.filter((l: any) => l.id !== id);
    saveStoredLeads(leads);
    return res.status(200).json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Erreur serveur" });
  }
});

app.get("/api/leads", (req, res) => {
  const leads = getStoredLeads();
  return res.status(200).json({ leads, count: leads.length });
});

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Helper with exponential backoff and model fallback for high-demand / 503 / 429 quota errors
async function generateWithRetry(ai: GoogleGenAI, parts: any[]) {
  // Try stable flash alias first for higher quota, with fallbacks
  const models = ["gemini-flash-latest", "gemini-3.7-flash", "gemini-3.1-flash-lite"];
  let lastError: any = null;

  for (const modelName of models) {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [{ parts }],
          config: {
            systemInstruction: "Tu es un correcteur pédagogique expert, bienveillant, rigoureux et précis. Tu réponds UNIQUEMENT par un objet JSON valide, sans balises de code Markdown ni texte autour.",
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        const isQuotaExceeded = errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("Quota exceeded");
        const isUnavailable =
          errMsg.includes("503") ||
          errMsg.includes("UNAVAILABLE") ||
          errMsg.includes("high demand") ||
          errMsg.includes("overloaded") ||
          errMsg.includes("Deadline expired") ||
          errMsg.includes("timed out");

        if (isQuotaExceeded) {
          console.warn(`[Gemini API] Quota atteint pour le modèle ${modelName}, bascule immédiate vers le modèle suivant.`);
          // Don't retry on the same exhausted model, switch to next model immediately
          break;
        } else if (isUnavailable) {
          console.warn(`[Gemini API] Modèle ${modelName} temporairement indisponible (tentative ${attempt}/${maxAttempts}):`, errMsg);
          if (attempt < maxAttempts) {
            const delay = 1000 + Math.random() * 500;
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          // Proceed to next fallback model
          break;
        } else {
          throw err;
        }
      }
    }
  }

  throw lastError;
}

// AI Correction Endpoint
app.post("/api/correct", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Missing messages array in body" });
    }

    const ai = getGenAI();
    const parts: any[] = [];

    for (const msg of messages) {
      if (typeof msg.content === "string") {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text") {
            parts.push({ text: block.text });
          } else if (block.type === "image" || block.type === "document") {
            const mediaType = block.source?.media_type || block.media_type || (block.type === "document" ? "application/pdf" : "image/jpeg");
            const data = block.source?.data || block.data;
            if (data) {
              parts.push({
                inlineData: {
                  data: data,
                  mimeType: mediaType,
                },
              });
            }
          }
        }
      }
    }

    const response = await generateWithRetry(ai, parts);

    const responseText = response.text || "";
    let parsedJson = null;
    try {
      parsedJson = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        parsedJson = JSON.parse(match[0]);
      }
    }

    if (parsedJson) {
      return res.json({
        result: parsedJson,
        content: [{ type: "text", text: JSON.stringify(parsedJson) }],
      });
    }

    return res.json({
      content: [{ type: "text", text: responseText }],
    });
  } catch (error: any) {
    console.error("Gemini Correction error:", error);
    res.status(500).json({
      error: error.message || "Erreur lors de la correction par l'IA",
    });
  }
});

// Also support Anthropic-style route if any legacy calls hit it
app.post("/api/anthropic/v1/messages", async (req, res) => {
  req.url = "/api/correct";
  return app._router.handle(req, res);
});

// Explicit Admin Dashboard Route
app.get(["/dashboard", "/dashboard.html"], (req, res) => {
  const dashDist = path.join(process.cwd(), "dist", "dashboard.html");
  const dashPublic = path.join(process.cwd(), "public", "dashboard.html");
  const dashRoot = path.join(process.cwd(), "dashboard.html");

  if (fs.existsSync(dashDist)) return res.sendFile(dashDist);
  if (fs.existsSync(dashPublic)) return res.sendFile(dashPublic);
  if (fs.existsSync(dashRoot)) return res.sendFile(dashRoot);
  res.status(404).send("Tableau de bord introuvable.");
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
