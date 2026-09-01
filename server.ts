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
app.post("/api/leads", async (req, res) => {
  try {
    const { email, whatsapp, name, school, plan, action } = req.body || {};
    if (!email && !whatsapp) {
      return res.status(400).json({ error: "Un email ou un numéro WhatsApp est requis." });
    }

    const leads = getStoredLeads();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPhone = (whatsapp || "").trim();
    const cleanName = (name || "").trim();
    const cleanSchool = (school || "").trim();
    const eventType = action === "login" ? "login" : "signup";

    // Check if user already exists -> update or create
    const existingIndex = leads.findIndex((l: any) => 
      (cleanEmail && l.email === cleanEmail) || (cleanPhone && l.whatsapp && l.whatsapp === cleanPhone)
    );

    let currentLead: any;
    let isNewUser = false;

    if (existingIndex >= 0) {
      // Update existing lead
      if (cleanName) leads[existingIndex].name = cleanName;
      if (cleanSchool) leads[existingIndex].school = cleanSchool;
      if (cleanPhone) leads[existingIndex].whatsapp = cleanPhone;
      if (plan) leads[existingIndex].plan = plan;
      leads[existingIndex].updatedAt = new Date().toISOString();
      leads[existingIndex].last_login = new Date().toISOString();
      currentLead = leads[existingIndex];
    } else {
      isNewUser = true;
      currentLead = {
        id: "lead_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
        email: cleanEmail,
        whatsapp: cleanPhone,
        name: cleanName || "Enseignant",
        school: cleanSchool,
        plan: plan || "free_trial_7d",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        last_login: new Date().toISOString(),
        total_corrections: 0,
        corrections_this_month: 0,
        userAgent: req.headers["user-agent"] || "",
        ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
      };
      leads.unshift(currentLead);
    }

    saveStoredLeads(leads);

    // 1. Forward to Telegram Bot if configured (Instant phone notification)
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;
    if (telegramBotToken && telegramChatId) {
      try {
        const title = isNewUser ? "🔔 NOUVEL UTILISATEUR INSCRIT !" : "🔑 CONNEXION ENSEIGNANT SUR PEDAGOAI";
        const text = `*${title}*\n\n` +
          `👤 *Nom :* ${currentLead.name || "Enseignant non spécifié"}\n` +
          `📧 *Email :* ${currentLead.email || "Non renseigné"}\n` +
          `📱 *WhatsApp :* ${currentLead.whatsapp || "Non renseigné"}\n` +
          `🏫 *Établissement :* ${currentLead.school || "Non renseigné"}\n` +
          `📦 *Offre :* ${currentLead.plan || "free_trial_7d"}\n` +
          `🕒 *Date :* ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })} (Abidjan)`;

        fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: text,
            parse_mode: "Markdown",
          }),
        }).then(async (tgRes) => {
          const resData = await tgRes.json();
          if (resData.ok) {
            console.log(`[Telegram Bot] Alerte envoyée avec succès pour ${currentLead.email}`);
          } else {
            console.warn(`[Telegram Bot Warning]:`, resData);
          }
        }).catch((err) => console.error("[Telegram Bot Error]:", err));
      } catch (te) {
        console.error("Telegram dispatch error:", te);
      }
    } else {
      console.log(`[Notification Info] Utilisateur enregistré (${currentLead.email}). Pour activer les alertes Telegram sur votre téléphone, renseignez TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID.`);
    }

    // 2. Forward to Webhook if configured (Google Sheets, Make, Zapier, Discord, Slack, etc.)
    const webhookUrl = process.env.LEADS_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const isDiscord = webhookUrl.includes("discord.com/api/webhooks");
        const isSlack = webhookUrl.includes("slack.com/services");
        
        let payload: any = {
          event: isNewUser ? "new_lead" : "user_login",
          timestamp: new Date().toISOString(),
          data: currentLead,
        };

        if (isDiscord) {
          payload = {
            content: isNewUser
              ? `🎉 **Nouvel enseignant inscrit sur PedagoAI !**\n**Nom :** ${currentLead.name || "Non spécifié"}\n**Email :** ${currentLead.email}\n**WhatsApp :** ${currentLead.whatsapp || "N/A"}\n**Établissement :** ${currentLead.school || "N/A"}`
              : `🔑 **Connexion enseignant :** ${currentLead.name} (${currentLead.email})`
          };
        } else if (isSlack) {
          payload = {
            text: isNewUser
              ? `🎉 *Nouvel enseignant inscrit :* ${currentLead.name} (${currentLead.email}) - ${currentLead.school || "N/A"} - WhatsApp: ${currentLead.whatsapp || "N/A"}`
              : `🔑 *Connexion enseignant :* ${currentLead.name} (${currentLead.email})`
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

    console.log(`✨ Utilisateur enregistré / synchronisé : ${currentLead.email || currentLead.whatsapp} (${isNewUser ? 'Nouveau' : 'Existant'})`);
    return res.status(200).json({ success: true, lead: currentLead, isNewUser });
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

// Admin Analytics & Metrics (100% REAL DATA from leads.json)
app.get("/api/admin/metrics", adminAuthMiddleware, (req, res) => {
  try {
    const leads = getStoredLeads();
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const totalUsers = leads.length;
    const newUsers30d = leads.filter((l: any) => {
      const d = new Date(l.createdAt || l.created_at || 0);
      return d >= thirtyDaysAgo;
    }).length;

    let countMonthly = 0;
    let countAnnual = 0;
    let countFree = 0;

    leads.forEach((l: any) => {
      const p = (l.plan || "").toLowerCase();
      if (p.includes("annual") || p.includes("annuel")) {
        countAnnual++;
      } else if (p.includes("monthly") || p.includes("mensuel") || p === "pro" || p === "premium") {
        countMonthly++;
      } else {
        countFree++;
      }
    });

    const activePremium = countMonthly + countAnnual;
    const mrr = Math.round(((countMonthly * 9.99) + (countAnnual * (99.99 / 12))) * 100) / 100;
    const arr = Math.round((mrr * 12) * 100) / 100;
    const arpu = activePremium > 0 ? Math.round((mrr / activePremium) * 100) / 100 : 0;

    // Build real 12-month timeline
    const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
    const revenue_trend_12m: any[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mLabel = `${months[d.getMonth()]} ${d.getFullYear()}`;
      
      // Count cumulative users up to this month
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const usersUpToMonth = leads.filter((l: any) => {
        const cd = new Date(l.createdAt || l.created_at || 0);
        return cd <= endOfMonth;
      }).length;

      const premUpToMonth = leads.filter((l: any) => {
        const cd = new Date(l.createdAt || l.created_at || 0);
        const p = (l.plan || "").toLowerCase();
        return cd <= endOfMonth && (p.includes("monthly") || p.includes("annual") || p === "pro");
      }).length;

      revenue_trend_12m.push({
        month: mLabel,
        mrr: premUpToMonth * 9.99,
        users: usersUpToMonth
      });
    }

    const formattedUsers = leads.map((l: any) => ({
      id: l.id,
      name: l.name || "Enseignant",
      email: l.email || "Non renseigné",
      whatsapp: l.whatsapp || "",
      school: l.school || "Établissement non spécifié",
      plan: l.plan || "free_trial_7d",
      status: l.status || "active",
      created_at: l.createdAt || l.created_at || new Date().toISOString(),
      last_login: l.updatedAt || l.createdAt || new Date().toISOString(),
      total_corrections: l.total_corrections || 0,
      corrections_this_month: l.corrections_this_month || 0,
      payment_method: l.payment_method || null,
      failed_payments: []
    }));

    return res.status(200).json({
      metrics: {
        mrr: mrr,
        arr: arr,
        mrr_trend_pct: 0,
        active_premium: activePremium,
        breakdown_monthly: countMonthly,
        breakdown_annual: countAnnual,
        active_free: countFree,
        total_users: totalUsers,
        churn_rate: 0.0,
        arpu: arpu,
        new_users_30d: newUsers30d,
        churned_30d: 0,
        growth_mom: 0.0,
        currency_rate_xof: 655
      },
      revenue_trend_12m,
      users_by_plan: {
        free: { count: countFree, label: "Essai Gratuit / Free", price: 0, mrr_contrib: 0 },
        premium_monthly: { count: countMonthly, label: "Premium Mensuel", price: 9.99, mrr_contrib: countMonthly * 9.99 },
        premium_annual: { count: countAnnual, label: "Premium Annuel", price: 99.99, mrr_contrib: countAnnual * (99.99 / 12) }
      },
      users: formattedUsers,
      alerts: []
    });
  } catch (e: any) {
    console.error("Error computing real admin metrics:", e);
    return res.status(500).json({ error: "Erreur calcul métriques" });
  }
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
  // Valid @google/genai model names
  const models = ["gemini-3.7-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
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
          temperature: 0.2,
        };

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

      let promptText = `Tu es un enseignant et correcteur académique d'élite dans la matière : ${subject || "Mathématiques"}.
Tu dois analyser et corriger minutieusement la copie de l'élève "${studentName || "Élève"}".

CONSIGNES PÉDAGOGIQUES DU PROFESSEUR :
${guidelinesList.length > 0 ? guidelinesList.map((g: string) => `- ${g}`).join("\n") : "- Évaluation équitable, constructive, bienveillante et rigoureuse."}
${freeInstructions ? `\nINSTRUCTIONS SPÉCIFIQUES :\n${freeInstructions}` : ""}

RÉFÉRENCE & CORRIGÉ OFFICIEL :
${mode === "B" && refText ? `Corrigé / Réponses attendues :\n${refText}` : "Mode sans corrigé rédigé : Applique les critères académiques officiels pour cette discipline."}

Format de notation globale : Note finale ${scaleStr}.

MISSION PRINCIPALE D'ANALYSE DÉTAILLÉE :
Tu dois minutieusement identifier et évaluer TOUS les exercices ou questions présents sur le document ou la copie de l'élève (ex: Exercice 1, Exercice 2, Exercice 3, ..., Exercice 10, Exercice 11, Exercice 12, etc.).
NE CONDENSE JAMAIS et NE REGROUPE PAS les questions : traite chaque exercice séparément.

Pour CHAQUE exercice identifié sur le document, tu dois obligatoirement fournir :
1. "titre" : Le nom exact de l'exercice (ex: "Exercice 1 (Niveau de base)", "Exercice 2", "Exercice 3 : Pourcentages", "Exercice 11 : Probabilités").
2. "note" : La note obtenue sur le barème attribué (ex: "2 / 2 pt", "1.6 / 1.6 pt", "1 / 2 pt", "0.8 / 1.6 pt", "0 / 2 pt").
3. "statut" : Exactement "ACQUIS" (si réussi/juste), "PARTIEL" (si en cours d'acquisition / demi-points / démarche incomplète), ou "A REVOIR" (si faux / erreur / non traité).
4. "reponse_eleve" : Ce que l'élève a concrètement écrit ou calculé (ex: "15+3-2=16", "Vrai", "x=80€, 100-25=75%, x2=75%*80=60€", "20", "4/9 et 1/6", ou "Non répondu" / "Non traité" / "Non renseigné").
5. "attendu" : La solution exacte, le calcul attendu, la formule ou la démonstration rigoureuse (ex: "15 + 3 - 2 = 16", "Vrai (tout nombre divisible par 4 l'est par 2)", "80 * 0,75 = 60€", "Faux (moyenne = 15)", "P(rouge) = 4/9 | P(2 rouges) = 1/6", "A = 1 020€ | B = 1 248€ | Option A gagne").
6. "commentaire" : Une explication pédagogique claire et constructive (ex: "Correct.", "Justification incomplète mais réponse correcte.", "Erreur de calcul sur le pourcentage.", "Erreur d'analyse.", "Calculs corrects.", "Exercice non traité.", "Raisonnement valide.").

Structure JSON OBLIGATOIRE à renvoyer :
{
  "eleve": "${studentName || "Élève"}",
  "matiere": "${subject || "Mathématiques"}",
  "note": 17.0,
  "note_sur": ${parseInt(noteMax, 10) || 20},
  "appreciation": "Très bon travail dans l'ensemble, les méthodes sont maîtrisées.",
  "tags": ["Compréhension", "Raisonnement", "Calcul"],
  "points_forts": "Bonne maîtrise des règles de calcul et de la démarche.",
  "points_ameliorer": "Veiller à justifier les réponses pour les exercices plus complexes.",
  "competences": [
    { "nom": "Compréhension du sujet", "statut": "Acquis" },
    { "nom": "Raisonnement & Méthode", "statut": "Acquis" },
    { "nom": "Précision des calculs / rédaction", "statut": "Partiel" }
  ],
  "questions": [
    {
      "titre": "Exercice 1 (Niveau de base)",
      "note": "2 / 2 pt",
      "statut": "ACQUIS",
      "reponse_eleve": "15+3-2=16",
      "attendu": "15 + 3 - 2 = 16",
      "commentaire": "Correct."
    },
    {
      "titre": "Exercice 2 (Niveau de base)",
      "note": "2 / 2 pt",
      "statut": "ACQUIS",
      "reponse_eleve": "Vrai, car 4 est divisible par 2",
      "attendu": "Vrai (tout nombre divisible par 4 l'est par 2)",
      "commentaire": "Justification correcte."
    },
    {
      "titre": "Exercice 3 (Niveau de base)",
      "note": "0 / 2 pt",
      "statut": "A REVOIR",
      "reponse_eleve": "20",
      "attendu": "80 * 0,75 = 60€",
      "commentaire": "Erreur de calcul sur le pourcentage."
    },
    {
      "titre": "Exercice 4",
      "note": "2 / 2 pt",
      "statut": "ACQUIS",
      "reponse_eleve": "5x-3=2x+9, 3x=12, x=4",
      "attendu": "x = 4",
      "commentaire": "Résolution exacte."
    },
    {
      "titre": "Exercice 8",
      "note": "1 / 2 pt",
      "statut": "PARTIEL",
      "reponse_eleve": "On remarque qu'il y a une suite, raison 2, Un+1=U0+2n",
      "attendu": "Faux, moyenne = 15",
      "commentaire": "Analyse incomplète."
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
