interface ApiRequest {
  method?: string;
  body?: any;
  query?: Record<string, any>;
  headers?: Record<string, any>;
  socket?: any;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: any) => void;
  send: (data: any) => void;
  end: () => void;
  setHeader: (k: string, v: string) => ApiResponse;
}
import fs from 'fs';
import path from 'path';

const LEADS_FILE = path.join(process.cwd(), 'leads.json');

function getStoredLeads() {
  try {
    if (fs.existsSync(LEADS_FILE)) {
      return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading leads:', e);
  }
  return [];
}

function saveStoredLeads(leads: any[]) {
  try {
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving leads:', e);
  }
}

export default function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PATCH,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const { email, whatsapp, name, school, plan } = req.body || {};
      if (!email && !whatsapp) {
        return res.status(400).json({ error: 'Un email ou un numéro WhatsApp est requis.' });
      }

      const leads = getStoredLeads();
      const cleanEmail = (email || '').trim().toLowerCase();
      const cleanPhone = (whatsapp || '').trim();

      const existingIndex = leads.findIndex((l: any) =>
        (cleanEmail && l.email === cleanEmail) || (cleanPhone && l.whatsapp === cleanPhone)
      );

      if (existingIndex >= 0) {
        leads[existingIndex].name = (name || leads[existingIndex].name || '').trim();
        leads[existingIndex].school = (school || leads[existingIndex].school || '').trim();
        if (plan) leads[existingIndex].plan = plan;
        leads[existingIndex].updatedAt = new Date().toISOString();
        saveStoredLeads(leads);
        return res.status(200).json({ success: true, lead: leads[existingIndex] });
      }

      const lead = {
        id: 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        email: cleanEmail,
        whatsapp: cleanPhone,
        name: (name || '').trim(),
        school: (school || '').trim(),
        plan: plan || 'free',
        status: 'active',
        createdAt: new Date().toISOString(),
        userAgent: req.headers['user-agent'] || '',
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
      };

      leads.unshift(lead);
      saveStoredLeads(leads);

      // Forward to Webhook if configured (Google Sheets, Zapier, Make, Telegram, Discord, etc.)
      const webhookUrl = process.env.LEADS_WEBHOOK_URL;
      if (webhookUrl) {
        try {
          fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'new_lead',
              timestamp: new Date().toISOString(),
              data: lead
            })
          }).catch(err => console.error('Webhook error:', err));
        } catch (we) {
          console.error('Webhook dispatch error:', we);
        }
      }

      return res.status(200).json({ success: true, lead });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Erreur serveur' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { id, plan, status, notes, name, school } = req.body || {};
      const leads = getStoredLeads();
      const lead = leads.find((l: any) => l.id === id);
      if (!lead) return res.status(404).json({ error: 'Utilisateur non trouvé' });

      if (plan !== undefined) lead.plan = plan;
      if (status !== undefined) lead.status = status;
      if (notes !== undefined) lead.notes = notes;
      if (name !== undefined) lead.name = name;
      if (school !== undefined) lead.school = school;
      lead.updatedAt = new Date().toISOString();

      saveStoredLeads(leads);
      return res.status(200).json({ success: true, lead });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Erreur serveur' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      let leads = getStoredLeads();
      leads = leads.filter((l: any) => l.id !== id);
      saveStoredLeads(leads);
      return res.status(200).json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Erreur serveur' });
    }
  }

  if (req.method === 'GET') {
    const leads = getStoredLeads();
    return res.status(200).json({ leads, count: leads.length });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
