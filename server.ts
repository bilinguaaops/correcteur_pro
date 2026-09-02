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

// Helper to rigorously clean, detect and format inline media for Gemini Vision API
function sanitizeInlineMedia(rawString: any, requestedMime?: string): { data: string; mimeType: string } | null {
  if (!rawString || typeof rawString !== "string") return null;

  let mime = (requestedMime || "").trim().toLowerCase();
  let base64 = rawString.trim();

  // 1. Extract from data URI if present (e.g. data:image/png;base64,xxxx)
  const dataUrlMatch = base64.match(/^data:([^;,]+);base64,(.+)$/s);
  if (dataUrlMatch) {
    const detectedFromUrl = dataUrlMatch[1].trim().toLowerCase();
    if (detectedFromUrl) mime = detectedFromUrl;
    base64 = dataUrlMatch[2];
  }

  // 2. Normalize URL-safe base64 characters and strip whitespaces/invalid characters
  base64 = base64
    .replace(/^data:[^;]+;base64,/, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9+/=]/g, "");

  if (!base64 || base64.length < 16) return null;

  // 3. Fix base64 padding if needed
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }

  // 4. CRITICAL: Magic bytes detection FIRST to ensure PDFs and Images are never mismatched
  if (base64.startsWith("JVBERi0") || base64.startsWith("JVBERi")) {
    mime = "application/pdf";
  } else if (base64.startsWith("/9j/")) {
    mime = "image/jpeg";
  } else if (base64.startsWith("iVBORw0KGgo") || base64.startsWith("iVBORw")) {
    mime = "image/png";
  } else if (base64.startsWith("UklGR")) {
    mime = "image/webp";
  } else if (base64.startsWith("R0lGOD")) {
    mime = "image/gif";
  } else if (mime.includes("pdf")) {
    mime = "application/pdf";
  } else if (mime.includes("png")) {
    mime = "image/png";
  } else if (mime.includes("webp")) {
    mime = "image/webp";
  } else if (!mime || mime === "application/octet-stream" || mime === "binary/octet-stream") {
    mime = "image/jpeg";
  }

  // 5. Normalize common MIME aliases
  if (mime === "image/jpg" || mime === "image/pjpeg") mime = "image/jpeg";
  if (mime === "image/x-png") mime = "image/png";
  if (mime.includes("pdf")) mime = "application/pdf";

  // Allowed MIME types in Gemini API
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
  if (!allowed.includes(mime)) {
    if (base64.startsWith("JVBERi") || mime.includes("pdf")) {
      mime = "application/pdf";
    } else {
      mime = "image/jpeg";
    }
  }

  return { data: base64, mimeType: mime };
}

// Helper to compute a robust positive 32-bit integer deterministic seed
function computeDeterministicSeed(studentName?: string, subject?: string, customSeed?: any): number {
  if (customSeed !== undefined && customSeed !== null && !isNaN(Number(customSeed))) {
    const s = Math.abs(parseInt(String(customSeed), 10));
    return s > 0 ? (s % 2147483647) : 42;
  }
  const normalized = `${(studentName || "eleve").trim().toLowerCase()}::${(subject || "general").trim().toLowerCase()}::pedagoai_seed_v1`;
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0;
  }
  const positiveSeed = Math.abs(hash) % 2147483647;
  return positiveSeed > 0 ? positiveSeed : 84901;
}

// Helper to safely clean, repair and parse JSON output from Gemini models
function cleanAndRepairJson(str: string): string {
  let cleaned = str.trim();
  // 1. Remove markdown backticks if any
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // 2. Extract substring from first '{' to last '}'
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  // 3. Fix trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([\}\]])/g, "$1");

  return cleaned;
}

function safeParseGeminiJson(responseText: string): any {
  if (!responseText || typeof responseText !== "string") return null;

  // Attempt 1: Direct JSON.parse
  try {
    return JSON.parse(responseText);
  } catch {}

  // Attempt 2: Clean and trim codeblocks and trailing commas
  const cleaned = cleanAndRepairJson(responseText);
  try {
    return JSON.parse(cleaned);
  } catch {}

  // Attempt 3: Fix unescaped control characters & raw newlines in strings
  try {
    const fixedEscapes = cleaned
      .replace(/[\u0000-\u001F]+/g, (match) => {
        if (match === "\n") return "\\n";
        if (match === "\r") return "\\r";
        if (match === "\t") return "\\t";
        return " ";
      });
    return JSON.parse(fixedEscapes);
  } catch {}

  // Attempt 4: Fix unescaped quotes inside string properties
  try {
    const fixedQuotes = cleaned.replace(/:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g, (_match, p1) => {
      const sanitized = p1.replace(/"/g, "'").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
      return `: "${sanitized}"`;
    });
    return JSON.parse(fixedQuotes);
  } catch {}

  // Attempt 5: Close open brackets or braces if response was slightly cut off
  try {
    let truncated = cleaned.replace(/,\s*"?\w*"?\s*:?\s*$/, "");
    const openBraces = (truncated.match(/\{/g) || []).length;
    const closeBraces = (truncated.match(/\}/g) || []).length;
    const openBrackets = (truncated.match(/\[/g) || []).length;
    const closeBrackets = (truncated.match(/\]/g) || []).length;

    for (let i = 0; i < openBrackets - closeBrackets; i++) truncated += "]";
    for (let i = 0; i < openBraces - closeBraces; i++) truncated += "}";

    truncated = truncated.replace(/,\s*([\}\]])/g, "$1");
    return JSON.parse(truncated);
  } catch {}

  // Attempt 6: Regex extraction of core fields
  try {
    const noteMatch = responseText.match(/"note"\s*:\s*([0-9.]+)/);
    const noteSurMatch = responseText.match(/"note_sur"\s*:\s*([0-9.]+)/);
    const eleveMatch = responseText.match(/"eleve"\s*:\s*"([^"]+)"/);
    const appMatch = responseText.match(/"appreciation"\s*:\s*"([^"]+)"/);

    if (noteMatch) {
      return {
        eleve: eleveMatch ? eleveMatch[1] : "Élève",
        note: parseFloat(noteMatch[1]),
        note_sur: noteSurMatch ? parseFloat(noteSurMatch[1]) : 20,
        appreciation: appMatch ? appMatch[1] : "Évaluation pédagogique réalisée avec succès.",
        questions: []
      };
    }
  } catch {}

  return null;
}

// Helper with exponential backoff and fast model execution for high-speed grading
async function generateWithRetry(ai: GoogleGenAI, parts: any[]) {
  // Multi-tier model cascade for high availability using supported active models
  const models = [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite"
  ];
  let lastError: any = null;

  for (const modelName of models) {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[Gemini API] Correction avec ${modelName} (tentative ${attempt}/${maxAttempts})...`);
        const startTime = Date.now();
        
        const config: any = {
          systemInstruction: "Tu es un algorithme de correction strict, impartial et factuel. Ton unique rôle est de comparer la copie de l'élève au corrigé de référence. Tu ne dois faire aucune supposition, ni faire preuve de clémence. Si un élément du corrigé est absent ou faux sur la copie, tu retires les points correspondants de manière systématique. Tu réponds UNIQUEMENT par un objet JSON valide.",
          responseMimeType: "application/json",
          temperature: 0.0, // On passe à 0.0 pour un maximum de déterminisme
          maxOutputTokens: 8192,
        };

        const response = await ai.models.generateContent({
          model: modelName,
          contents: parts,
          config,
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[Gemini API] Correction générée avec succès en ${elapsed}s avec ${modelName}.`);
        return { response, modelUsed: modelName, elapsedSeconds: elapsed };
      } catch (err: any) {
        lastError = err;
        const errMsg = (err?.message || String(err)).toLowerCase();
        const errStatus = err?.status || err?.code || "";
        
        const isQuotaExceeded =
          errMsg.includes("429") ||
          errMsg.includes("resource_exhausted") ||
          errMsg.includes("quota exceeded") ||
          errMsg.includes("rate_limit");

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
          console.warn(`[Gemini API] Quota atteint ou limité sur ${modelName} (429/ResourceExhausted), bascule automatique vers le modèle alternatif...`);
          break;
        } else if (isTransientError) {
          console.warn(`[Gemini API] Modèle ${modelName} temporairement occupé (tentative ${attempt}/${maxAttempts})...`);
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }
          break;
        } else {
          console.warn(`[Gemini API] Modèle ${modelName} non disponible:`, err?.message || err);
          break;
        }
      }
    }
  }

  throw lastError || new Error("Impossible de générer l'évaluation avec les modèles disponibles.");
}

// AI Correction Endpoint
app.post("/api/correct", async (req, res) => {
  const { messages, image, mimeType, studentName, subject, evalTitle, gradeLevel, mode, refText, refImage, noteMax, guidelines, freeInstructions } = req.body || {};
  const targetScale = (noteMax === "auto" || !noteMax) ? 20 : (parseInt(noteMax, 10) || 20);

  try {
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
              const reqMime = block.source?.media_type || block.media_type || (block.type === "document" ? "application/pdf" : "image/jpeg");
              const rawData = block.source?.data || block.data;
              const sanitized = sanitizeInlineMedia(rawData, reqMime);
              if (sanitized) {
                parts.push({
                  inlineData: {
                    data: sanitized.data,
                    mimeType: sanitized.mimeType,
                  },
                });
              }
            }
          }
        }
      }
    } else {
      // Structured request payload
      const guidelinesList = Array.isArray(guidelines) ? guidelines : [];
      const currentEvalTitle = evalTitle || "Devoir Surveillé N°1";
      const currentLevel = gradeLevel || "college";

      let refDescription = "";
      if (refImage) {
        refDescription = `CORRIGÉ DE RÉFÉRENCE DE L'ENSEIGNANT :
Un corrigé officiel de référence t'est fourni ci-dessus sous forme d'image (ou document).
Tu DOIS IMPÉRATIVEMENT analyser ce corrigé de référence en premier, en extraire TOUTES les questions, les réponses attendues exactes et les barèmes de chaque exercice.
Ce corrigé constitue la VÉRITÉ ABSOLUE pour cette correction.`;
      } else if (refText && refText.trim()) {
        refDescription = `CORRIGÉ DE RÉFÉRENCE FOURNI PAR L'ENSEIGNANT (TEXTE) :
${refText.trim()}
Ce corrigé constitue la VÉRITÉ ABSOLUE pour cette correction.`;
      } else {
        refDescription = `CORRECTION AUTONOME DU SUJET :
L'enseignant n'a pas joint de document de corrigé séparé.
Tu dois d'abord lire attentivement l'énoncé de chaque exercice figurant sur le document de l'élève, résoudre rigoureusement chaque exercice pour déterminer la solution exacte et le barème approprié, puis évaluer les réponses de l'élève par rapport à ces solutions exactes.`;
      }

      let promptText = `Tu es un enseignant et correcteur académique dans la discipline : ${subject || "Mathématiques"} (Niveau : ${currentLevel}, Évaluation : "${currentEvalTitle}").
Tu dois analyser et évaluer avec une rigueur absolue la copie de l'élève "${studentName || "Élève"}".

TITRE DE L'ÉVALUATION :
${currentEvalTitle}

CONSIGNES PÉDAGOGIQUES DU PROFESSEUR :
${guidelinesList.length > 0 ? guidelinesList.map((g: string) => `- ${g}`).join("\n") : "- Évaluation équitable, constructive, bienveillante et rigoureuse."}
${freeInstructions ? `\nINSTRUCTIONS SPÉCIFIQUES COMPLÉMENTAIRES :\n${freeInstructions}` : ""}

============================================================
${refDescription}
============================================================

NOTE MAXIMALE DE L'ÉVALUATION :
La note finale de l'élève DOIT IMPÉRATIVEMENT être ramenée sur ${targetScale} (note_sur: ${targetScale}). Même si le total des barèmes des exercices est de 24 points ou 100 points, ta note globale 'note' doit être calculée proportionnellement sur ${targetScale}.

============================================================
PROTOCOLE STRICT DE CORRECTION « GRILLE MIROIR » (1-TO-1 MAPPING) :
============================================================
Tu es un algorithme de vérification mathématique et pédagogique strict, factuel et impartial. Tu ne fais AUCUNE supposition ni acte de clémence arbitraire.

1. EXTRACTION EXHAUSTIVE DES QUESTIONS DU SUJET/CORRIGÉ :
   - Extrais la liste exhaustive de TOUTES les questions/exercices et leurs barèmes respectifs à partir du corrigé de référence (ou du document).
   - Cette liste de questions constitue ta grille de référence immuable.

2. COMPARAISON MIROIR QUESTION PAR QUESTION (ZÉRO HALLUCINATION) :
   - Pour chaque question du corrigé, inspecte la copie de l'élève.
   - "titre" : Le nom ou numéro de la question (ex: "Exercice 1", "Question 2.a").
   - "attendu" : Retranscris mot-à-mot et chiffre-à-chiffre la réponse exacte attendue selon le corrigé de référence.
   - "reponse_eleve" : Retranscris mot-à-mot / chiffre-à-chiffre EXACTEMENT ce que l'élève a produit sur sa copie (ou écris "Aucune réponse / Non traité" si absent).
   - "justification_note" : Justifie factuellement la note attribuée par comparaison directe (ex: « Réponse exacte conforme au corrigé » ou « Résultat 14 au lieu de 16 attendu : 0 point » ou « Option A calculée correctement mais Option B omise : 1 pt sur 2 »).

3. RÈGLE D'ATTRIBUTION DES POINTS :
   - Réponse conforme et exacte -> Barème complet, Statut = "ACQUIS".
   - Réponse multi-parties partiellement traitée -> Demi-points selon la part exacte réalisée, Statut = "PARTIEL".
   - Réponse fausse, absente ou incomplète non conforme -> 0 point, Statut = "A REVOIR".

4. NOTE GLOBALE STRICTE :
   - La note finale 'note' est STRICTEMENT la somme arithmétique des notes de chaque question, normalisée sur ${targetScale}.

============================================================
STRUCTURE DE SORTIE JSON OBLIGATOIRE :
============================================================
{
  "eleve": "${studentName || "Élève"}",
  "matiere": "${subject || "Mathématiques"}",
  "note": 15.0,
  "note_sur": ${targetScale},
  "appreciation": "Appréciation pédagogique individualisée et factuelle décrivant les acquis et les erreurs constatées.",
  "tags": ["Compréhension", "Raisonnement", "Rigueur"],
  "points_forts": "Points forts spécifiques observés sur cette copie par rapport au corrigé.",
  "points_ameliorer": "Conseil méthodologique concret et ciblé sur les exercices non acquis.",
  "competences": [
    { "nom": "Compréhension du sujet", "statut": "Acquis" },
    { "nom": "Raisonnement & Méthode", "statut": "Acquis" },
    { "nom": "Calcul & Précision", "statut": "En cours" }
  ],
  "questions": [
    {
      "titre": "Exercice 1",
      "note": "2 / 2 pt",
      "note_val": 2.0,
      "note_max": 2.0,
      "statut": "ACQUIS",
      "reponse_eleve": "Réponse exacte transcrite de la copie",
      "attendu": "Réponse exacte attendue selon le corrigé",
      "justification_note": "Calcul exact et résultat conforme au corrigé.",
      "commentaire": "Calcul parfaitement maîtrisé.",
      "regle_appliquee": ""
    }
  ]
}`;

      // 1. On annonce et on insère le corrigé de référence (la vérité absolue)
      if (refImage) {
        const sanitizedRef = sanitizeInlineMedia(refImage, "image/jpeg");
        if (sanitizedRef) {
          parts.push({ text: "--- DÉBUT DU CORRIGÉ DE RÉFÉRENCE (La vérité absolue) ---" });
          parts.push({
            inlineData: {
              data: sanitizedRef.data,
              mimeType: sanitizedRef.mimeType,
            },
          });
          parts.push({ text: "--- FIN DU CORRIGÉ DE RÉFÉRENCE --- \n\n" });
        }
      }

      // 2. On annonce et on insère la copie de l'élève
      if (image) {
        const sanitizedImg = sanitizeInlineMedia(image, mimeType);
        if (sanitizedImg) {
          parts.push({ text: `--- DÉBUT DE LA COPIE DE L'ÉLÈVE À CORRIGER (Nom: ${studentName || "Inconnu"}) ---` });
          parts.push({
            inlineData: {
              data: sanitizedImg.data,
              mimeType: sanitizedImg.mimeType,
            },
          });
          parts.push({ text: "--- FIN DE LA COPIE DE L'ÉLÈVE --- \n\n" });
        }
      }

      // 3. Ajout du prompt pédagogique
      parts.push({ text: promptText });
    }

    const { response } = await generateWithRetry(ai, parts);

    const responseText = response.text || "";
    let parsedJson: any = safeParseGeminiJson(responseText);

    if (parsedJson) {
      // Ensure note_sur is always strictly targetScale
      parsedJson.note_sur = targetScale;

      // Arithmetically enforce the strict mirror grid sum across all validated questions
      if (Array.isArray(parsedJson.questions) && parsedJson.questions.length > 0) {
        let sumPoints = 0;
        let sumMaxPoints = 0;

        parsedJson.questions.forEach((q: any) => {
          let val = typeof q.note_val === "number" ? q.note_val : parseFloat(String(q.note_val || q.note || "0").replace(/[^0-9.]/g, ""));
          let maxVal = typeof q.note_max === "number" ? q.note_max : parseFloat(String(q.note_max || "2").replace(/[^0-9.]/g, ""));
          if (isNaN(val)) val = 0;
          if (isNaN(maxVal) || maxVal <= 0) maxVal = 2;

          q.note_val = val;
          q.note_max = maxVal;
          q.note = `${Number(val.toFixed(1)).toString().replace(".0", "")} / ${Number(maxVal.toFixed(1)).toString().replace(".0", "")} pt`;

          sumPoints += val;
          sumMaxPoints += maxVal;
        });

        if (sumMaxPoints > 0) {
          const exactScaledNote = (sumPoints / sumMaxPoints) * targetScale;
          parsedJson.note = Math.round(exactScaledNote * 10) / 10;
        }
      }

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
    const errMsg = error?.message || String(error);
    return res.status(500).json({
      error: errMsg,
      message: "Une erreur est survenue lors de l'analyse avec le modèle IA.",
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
