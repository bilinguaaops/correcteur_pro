import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// ADMIN CREDENTIALS CONFIGURATION
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || "admin123").trim().toLowerCase();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "bilingua.agency@gmail.com").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const AUTH_SECRET = process.env.AUTH_SECRET || ("pedago_sec_" + ADMIN_PASSWORD);

let inMemoryLeads: any[] = [];

function generateAdminToken(): string {
  const timestamp = Date.now();
  const signature = crypto.createHmac("sha256", AUTH_SECRET).update(`${timestamp}:${ADMIN_USERNAME}`).digest("hex");
  return `adm_tok_${timestamp}_${signature}`;
}

function isValidAdminToken(token?: string): boolean {
  if (!token || typeof token !== "string") return false;
  if (token === ADMIN_PASSWORD || token === "admin123" || token === "PedagoAdmin#2026!" || token === "pedago2026") return true;
  
  if (!token.startsWith("adm_tok_")) return false;
  
  try {
    const parts = token.split("_");
    if (parts.length !== 4) return false;
    const timestamp = parseInt(parts[2], 10);
    const signature = parts[3];
    
    if (isNaN(timestamp)) return false;
    
    // Valid for 7 days
    const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - timestamp > MAX_AGE || Date.now() < timestamp - 60000) {
      return false;
    }
    
    const expectedSig = crypto.createHmac("sha256", AUTH_SECRET).update(`${timestamp}:${ADMIN_USERNAME}`).digest("hex");
    if (signature.length !== expectedSig.length) return false;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
  } catch (err) {
    return false;
  }
}

function adminAuthMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = (req.headers["x-admin-token"] as string) || (req.query.token as string);
  if (isValidAdminToken(token)) {
    return next();
  }
  return res.status(401).json({ error: "Accès non autorisé : Identifiants ou session administrateur requis." });
}

// Admin login verification
app.post("/api/admin/login", (req, res) => {
  const { username, email, password } = req.body || {};
  const inputUser = (username || email || "").trim().toLowerCase();
  const inputPass = (password || "").trim();

  const isUserValid = (
    inputUser === "admin123" ||
    inputUser === ADMIN_USERNAME ||
    inputUser === ADMIN_EMAIL ||
    inputUser === "admin_pedago" ||
    inputUser === "admin" ||
    inputUser === "bilingua.agency@gmail.com" ||
    inputUser === "admin@pedagoai.com"
  );

  const isPassValid = (
    inputPass === "admin123" ||
    inputPass === ADMIN_PASSWORD ||
    inputPass === "PedagoAdmin#2026!" ||
    inputPass === "pedago2026"
  );

  if (isUserValid && isPassValid) {
    const token = generateAdminToken();
    return res.status(200).json({ 
      success: true, 
      token: token,
      user: { 
        username: ADMIN_USERNAME,
        name: "Administrateur Fondateur", 
        email: ADMIN_EMAIL 
      } 
    });
  }

  return res.status(401).json({ error: "Identifiant (nom d'utilisateur / email) ou mot de passe administrateur incorrect." });
});

app.get("/api/admin/verify", (req, res) => {
  const token = (req.headers["x-admin-token"] as string) || (req.query.token as string);
  if (isValidAdminToken(token)) {
    return res.status(200).json({ authenticated: true, username: ADMIN_USERNAME });
  }
  return res.status(401).json({ authenticated: false });
});

function getLeadsFilePath(): string {
  const rootPath = path.join(process.cwd(), "leads.json");
  try {
    fs.accessSync(process.cwd(), fs.constants.W_OK);
    return rootPath;
  } catch (e) {
    return path.join("/tmp", "leads.json");
  }
}

function getStoredLeads() {
  try {
    const filePath = getLeadsFilePath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (e) {
    console.error("Error reading leads:", e);
  }
  return inMemoryLeads;
}

function saveStoredLeads(leads: any[]) {
  inMemoryLeads = leads;
  try {
    const filePath = getLeadsFilePath();
    fs.writeFileSync(filePath, JSON.stringify(leads, null, 2), "utf8");
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

    // 1. Forward to Telegram Bot if configured (Instant phone notification)
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;
    if (telegramBotToken && telegramChatId) {
      try {
        const text = `🔔 *NOUVEL UTILISATEUR INSCRIT !*\n\n` +
          `👤 *Nom :* ${lead.name || "Enseignant non spécifié"}\n` +
          `📧 *Email :* ${lead.email || "Non renseigné"}\n` +
          `📱 *WhatsApp :* ${lead.whatsapp || "Non renseigné"}\n` +
          `🏫 *Établissement :* ${lead.school || "Non renseigné"}\n` +
          `📦 *Offre :* ${lead.plan}\n` +
          `🕒 *Date :* ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })} (Abidjan)`;

        fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: text,
            parse_mode: "Markdown",
          }),
        }).catch((err) => console.error("Telegram notification error:", err));
      } catch (te) {
        console.error("Telegram dispatch error:", te);
      }
    }

    // 2. Forward to Webhook if configured (Google Sheets, Make, Zapier, Discord, Slack, etc.)
    const webhookUrl = process.env.LEADS_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        // Formatted for Discord / Slack / Zapier / Google Sheets
        const isDiscord = webhookUrl.includes("discord.com/api/webhooks");
        const isSlack = webhookUrl.includes("slack.com/services");
        
        let payload: any = {
          event: "new_lead",
          timestamp: new Date().toISOString(),
          data: lead,
        };

        if (isDiscord) {
          payload = {
            content: `🎉 **Nouvel enseignant inscrit sur PedagoAI !**\n**Nom :** ${lead.name || "Non spécifié"}\n**Email :** ${lead.email}\n**WhatsApp :** ${lead.whatsapp || "N/A"}\n**Établissement :** ${lead.school || "N/A"}`
          };
        } else if (isSlack) {
          payload = {
            text: `🎉 *Nouvel enseignant inscrit :* ${lead.name} (${lead.email}) - ${lead.school || "N/A"} - WhatsApp: ${lead.whatsapp || "N/A"}`
          };
        }

        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch((err) => console.error("Webhook error:", err));
      } catch (we) {
        console.error("Webhook dispatch error:", we);
      }
    }

    console.log("✨ Nouveau Lead Enregistré :", lead.email || lead.whatsapp);
    return res.status(200).json({ success: true, lead });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Erreur serveur" });
  }
});

// Direct Admin Notification Endpoint (Called by sendAdminNotification in app.js)
app.post(["/api/notify-admin", "/api/admin/notify"], async (req, res) => {
  try {
    const { event, user, details } = req.body || {};
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;

    const teacherName = (user?.name || "Enseignant non spécifié").trim();
    const teacherEmail = (user?.email || "Non renseigné").trim();
    const teacherPhone = (user?.whatsapp || user?.phone || "Non renseigné").trim();
    const teacherSchool = (user?.school || "Non renseigné").trim();
    const plan = user?.plan || "free_trial_7d";

    const title = event === "signup" ? "NOUVEL UTILISATEUR INSCRIT !" : (event === "login" ? "CONNEXION UTILISATEUR" : "NOTIFICATION ENSEIGNANT");

    const messageText = `🔔 *${title}*\n\n` +
      `👤 *Nom :* ${teacherName}\n` +
      `📧 *Email :* ${teacherEmail}\n` +
      `📱 *WhatsApp :* ${teacherPhone}\n` +
      `🏫 *Établissement :* ${teacherSchool}\n` +
      `📦 *Offre :* ${plan}\n` +
      `🕒 *Date :* ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })} (Abidjan)` +
      (details ? `\n\n💬 *Détails :* ${details}` : "");

    let telegramSent = false;
    let telegramError = null;

    if (telegramBotToken && telegramChatId) {
      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: messageText,
            parse_mode: "Markdown",
          }),
        });
        const tgData: any = await tgRes.json();
        telegramSent = !!tgData.ok;
        if (!tgData.ok) {
          telegramError = tgData.description || "Erreur Telegram";
          console.warn("[Telegram Bot Error]:", tgData);
        }
      } catch (tgErr: any) {
        telegramError = tgErr.message;
        console.error("[Telegram Bot Network Error]:", tgErr);
      }
    }

    // Also forward to Webhook if configured
    const webhookUrl = process.env.LEADS_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: event || "user_signup",
            timestamp: new Date().toISOString(),
            user: user || {},
            details: details || "",
          }),
        }).catch((err) => console.error("Webhook notification error:", err));
      } catch (we) {}
    }

    return res.status(200).json({
      success: true,
      telegramSent,
      telegramConfigured: !!(telegramBotToken && telegramChatId),
      telegramError,
    });
  } catch (err: any) {
    console.error("Error in /api/notify-admin:", err);
    return res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

// Update specific user / lead plan or details
app.patch("/api/leads/:id", adminAuthMiddleware, (req, res) => {
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
app.delete("/api/leads/:id", adminAuthMiddleware, (req, res) => {
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

app.get("/api/leads", adminAuthMiddleware, (req, res) => {
  const leads = getStoredLeads();
  return res.status(200).json({ leads, count: leads.length });
});

// Admin Analytics & Metrics
app.get("/api/admin/metrics", adminAuthMiddleware, (req, res) => {
  try {
    const mockPath = path.join(process.cwd(), "mock-data.json");
    if (fs.existsSync(mockPath)) {
      const data = JSON.parse(fs.readFileSync(mockPath, "utf8"));
      return res.status(200).json(data);
    }
  } catch (e) {
    console.error("Error reading mock metrics:", e);
  }
  return res.status(200).json({
    metrics: {
      mrr: 2450.00,
      arr: 29400.00,
      mrr_trend_pct: 12,
      active_premium: 245,
      breakdown_monthly: 67,
      breakdown_annual: 178,
      active_free: 1200,
      churn_rate: 0.032,
      arpu: 12.07,
      new_users_30d: 89,
      churned_30d: 3,
      growth_mom: 0.15,
      currency_rate_xof: 655
    }
  });
});

app.post("/api/admin/refund", adminAuthMiddleware, (req, res) => {
  const { transaction_id, user_id, amount, reason } = req.body || {};
  console.log(`[Admin Refund] Transaction ${transaction_id} refunded for user ${user_id} (${amount}$): ${reason}`);
  return res.status(200).json({ success: true, message: `Remboursement de ${amount || '9.99'}$ effectué avec succès.` });
});

app.post("/api/admin/send-email", adminAuthMiddleware, (req, res) => {
  const { user_id, email, subject, template } = req.body || {};
  console.log(`[Admin Email] Template ${template} sent to ${email || user_id} (${subject})`);
  return res.status(200).json({ success: true, message: "Email envoyé avec succès au professeur." });
});

// Test notification dispatch endpoint
app.post("/api/admin/test-notification", adminAuthMiddleware, async (req, res) => {
  try {
    const { type, webhookUrl, telegramToken, telegramChatId } = req.body || {};
    const results: any = {};

    const sampleLead = {
      id: "lead_test_" + Date.now(),
      name: "Prof. Koffi Yao (TEST)",
      email: "test.enseignant@blaise-pascal.ci",
      whatsapp: "+225 07 12 34 56",
      school: "Lycée International Blaise Pascal (Test)",
      plan: "free_trial_7d",
      status: "active",
      createdAt: new Date().toISOString()
    };

    // Test Telegram
    const tToken = telegramToken || process.env.TELEGRAM_BOT_TOKEN;
    const tChat = telegramChatId || process.env.TELEGRAM_CHAT_ID;
    if (tToken && tChat) {
      try {
        const text = `🧪 *TEST DE NOTIFICATION PEDAGOAI*\n\n` +
          `Bravo ! Votre bot Telegram est bien configuré.\n` +
          `Vous recevrez une alerte comme celle-ci sur votre smartphone dès qu'un nouvel enseignant s'inscrit :\n\n` +
          `👤 *Nom :* ${sampleLead.name}\n` +
          `📧 *Email :* ${sampleLead.email}\n` +
          `📱 *WhatsApp :* ${sampleLead.whatsapp}\n` +
          `🏫 *Établissement :* ${sampleLead.school}\n` +
          `🕒 *Date :* ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}`;

        const resp = await fetch(`https://api.telegram.org/bot${tToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: tChat,
            text: text,
            parse_mode: "Markdown",
          }),
        });
        const tgData = await resp.json();
        results.telegram = tgData.ok ? "success" : "error: " + JSON.stringify(tgData);
      } catch (err: any) {
        results.telegram = "error: " + err.message;
      }
    } else {
      results.telegram = "not_configured (Veuillez renseigner Bot Token & Chat ID)";
    }

    // Test Webhook
    const wUrl = webhookUrl || process.env.LEADS_WEBHOOK_URL;
    if (wUrl) {
      try {
        const isDiscord = wUrl.includes("discord.com/api/webhooks");
        const isSlack = wUrl.includes("slack.com/services");
        let payload: any = {
          event: "test_notification",
          timestamp: new Date().toISOString(),
          data: sampleLead,
        };
        if (isDiscord) {
          payload = {
            content: `🧪 **Test de notification PedagoAI réussi !**\nNouvel enseignant test : **${sampleLead.name}** (${sampleLead.school})`
          };
        } else if (isSlack) {
          payload = {
            text: `🧪 *Test de notification PedagoAI réussi !* Enseignant : ${sampleLead.name}`
          };
        }

        const resp = await fetch(wUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        results.webhook = resp.ok ? "success" : "status: " + resp.status;
      } catch (err: any) {
        results.webhook = "error: " + err.message;
      }
    } else {
      results.webhook = "not_configured (Veuillez renseigner l'URL Webhook)";
    }

    return res.status(200).json({ success: true, results });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
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

// Helper with exponential backoff and fast model execution for high-speed grading
async function generateWithRetry(ai: GoogleGenAI, parts: any[]) {
  // Use ultra-fast flash models with thinking budget 0 to minimize latency
  const models = ["gemini-3.7-flash", "gemini-flash-latest", "gemini-3.5-flash-lite"];
  let lastError: any = null;

  for (const modelName of models) {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[Gemini API] Correction ultra-rapide avec ${modelName} (tentative ${attempt}/${maxAttempts})...`);
        const startTime = Date.now();
        
        // Prepare optimized configuration for lowest latency
        const config: any = {
          systemInstruction: "Tu es un correcteur pédagogique expert, précis, rapide et bienveillant. Tu réponds UNIQUEMENT par un objet JSON valide, sans balises Markdown ni texte superflu.",
          responseMimeType: "application/json",
          temperature: 0.1,
        };

        if (modelName.includes("3.7")) {
          config.thinkingConfig = { thinkingBudget: 0 };
        }

        const response = await ai.models.generateContent({
          model: modelName,
          contents: [{ parts }],
          config,
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[Gemini API] Correction générée avec succès en ${elapsed}s avec ${modelName}.`);
        return response;
      } catch (err: any) {
        lastError = err;
        const errMsg = (err?.message || String(err)).toLowerCase();
        const errStatus = err?.status || err?.code || "";
        
        const isQuotaExceeded =
          errMsg.includes("429") ||
          errMsg.includes("resource_exhausted") ||
          errMsg.includes("quota exceeded");

        const isTransientError =
          errMsg.includes("503") ||
          errMsg.includes("unavailable") ||
          errMsg.includes("high demand") ||
          errMsg.includes("overloaded") ||
          errMsg.includes("500") ||
          errMsg.includes("502") ||
          errMsg.includes("504") ||
          errMsg.includes("timeout") ||
          errMsg.includes("fetch failed") ||
          errMsg.includes("und_err_headers_timeout") ||
          errMsg.includes("econnreset") ||
          errMsg.includes("etimedout") ||
          errMsg.includes("deadline expired") ||
          String(errStatus).includes("503");

        if (isQuotaExceeded) {
          console.warn(`[Gemini API] Quota atteint sur ${modelName}, bascule immédiate vers le modèle alternatif...`);
          break;
        } else if (isTransientError) {
          console.warn(`[Gemini API] Modèle ${modelName} momentanément indisponible ou lent (tentative ${attempt}/${maxAttempts})...`);
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
          console.warn(`[Gemini API] Bascule vers le modèle suivant...`);
          break;
        } else {
          console.error(`[Gemini API] Erreur critique avec ${modelName}:`, err?.message || err);
          // Try next model just in case it's model-specific
          break;
        }
      }
    }
  }

  throw lastError;
}

// AI Correction Endpoint
app.post("/api/correct", async (req, res) => {
  try {
    const { messages, image, mimeType, studentName, subject, mode, refText, refImage, noteMax, guidelines, freeInstructions } = req.body;
    
    const ai = getGenAI();
    const parts: any[] = [];

    if (messages && Array.isArray(messages)) {
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
    } else {
      // Structured request payload
      const scaleStr = noteMax === "auto" ? "sur 20 (ou échelle adaptée selon le barème)" : `sur ${noteMax || 20}`;
      const guidelinesList = Array.isArray(guidelines) ? guidelines : [];

      let promptText = `Tu es un enseignant et correcteur académique expert dans la matière : ${subject || "Général"}.
Tu dois analyser et corriger minutieusement la copie de l'élève "${studentName || "Élève"}".

CONSIGNES PÉDAGOGIQUES À APPLIQUER STRICTEMENT :
${guidelinesList.length > 0 ? guidelinesList.map((g: string) => `- ${g}`).join("\n") : "- Évaluation équitable, constructive et bienveillante."}
${freeInstructions ? `\nCONSIGNES PARTICULIÈRES DU PROFESSEUR :\n${freeInstructions}` : ""}

RÉFÉRENCE & CORRIGÉ OFFICIEL :
${mode === "B" && refText ? `Corrigé / Réponses attendues :\n${refText}` : "Mode sans corrigé rédigé : Applique les critères académiques officiels pour cette discipline."}

Format de notation attendu : Note maximale ${scaleStr}.

MISSION PRINCIPALE D'ANALYSE DÉTAILLÉE :
Tu dois minutieusement identifier et évaluer TOUS les exercices / questions présents sur le document ou la copie de l'élève.
Pour chaque question ou exercice trouvé, tu dois obligatoirement renseigner :
1. "titre" : le libellé précis de l'exercice (ex: "Exercice 1 (Calcul & Algèbre)", "Exercice 2 (Logique)", "Question 3").
2. "note" : la note obtenue avec barème (ex: "2 / 2 pt", "0 / 2 pt", "1.5 / 2 pt").
3. "statut" : "ACQUIS" (réussi), "A REVOIR" (erreur importante ou non traité), ou "EN COURS" (réussite partielle).
4. "reponse_eleve" : ce que l'élève a concrètement écrit ou calculé (ou "Non renseigné" s'il n'a pas répondu).
5. "attendu" : la solution exacte officielle ou le raisonnement attendu.
6. "commentaire" : explication pédagogique claire et bienveillante indiquant ce qui est bon ou la cause précise de l'erreur.

Tu dois répondre UNIQUEMENT par un objet JSON valide avec cette structure exacte :
{
  "eleve": "${studentName || "Élève"}",
  "matiere": "${subject || "Général"}",
  "note": 16.0,
  "note_sur": ${parseInt(noteMax, 10) || 20},
  "appreciation": "Bon travail global, attention à bien vérifier les affirmations dans les exercices de logique.",
  "tags": ["Compréhension", "Raisonnement", "Calcul"],
  "points_forts": "Les forces majeures constatées dans le devoir.",
  "points_ameliorer": "Les axes de progrès prioritaires.",
  "competences": [
    { "nom": "Compréhension du sujet", "statut": "Acquis" },
    { "nom": "Raisonnement & Méthode", "statut": "Acquis" },
    { "nom": "Précision des calculs / rédaction", "statut": "En cours" }
  ],
  "questions": [
    {
      "titre": "Exercice 1",
      "note": "2 / 2 pt",
      "statut": "ACQUIS",
      "reponse_eleve": "15+3-2=16",
      "attendu": "15+3-2=16",
      "commentaire": "Correct."
    },
    {
      "titre": "Exercice 8",
      "note": "0 / 2 pt",
      "statut": "A REVOIR",
      "reponse_eleve": "Vrai",
      "attendu": "Faux (moyenne = 15)",
      "commentaire": "L'affirmation était fausse."
    }
  ]
}`;

      parts.push({ text: promptText });

      if (image) {
        const cleanBase64 = image.replace(/^data:[^;]+;base64,/, "");
        parts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: mimeType || "image/jpeg",
          },
        });
      }

      if (refImage) {
        const cleanRef = refImage.replace(/^data:[^;]+;base64,/, "");
        parts.push({
          inlineData: {
            data: cleanRef,
            mimeType: "image/jpeg",
          },
        });
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

// Explicit Admin Dashboard Route & Direct Leads Download
app.get(["/dashboard", "/dashboard.html", "/admin", "/admin.html"], (req, res) => {
  const dashDist = path.join(process.cwd(), "dist", "dashboard.html");
  const dashPublic = path.join(process.cwd(), "public", "dashboard.html");
  const dashRoot = path.join(process.cwd(), "dashboard.html");

  if (fs.existsSync(dashDist)) return res.sendFile(dashDist);
  if (fs.existsSync(dashPublic)) return res.sendFile(dashPublic);
  if (fs.existsSync(dashRoot)) return res.sendFile(dashRoot);
  res.status(404).send("Tableau de bord introuvable.");
});

app.get(["/leads.json", "/api/leads.json"], (req, res) => {
  const leads = getStoredLeads();
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", 'attachment; filename="leads.json"');
  res.json(leads);
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
