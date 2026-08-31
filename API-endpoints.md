# Correcteur Pédagogique Pro — Documentation des Endpoints API Backend

## 1. Vue d'ensemble de l'Architecture

Toutes les routes API suivent les standards RESTful, retournent du JSON (`application/json`) et intègrent la gestion des erreurs HTTP (400, 401, 404, 500).

---

## 2. Endpoints Métriques & Analytics

### `GET /api/admin/metrics`
Retourne la synthèse globale de santé financière et d'usage pour le solo entrepreneur.

**Réponse (200 OK) :**
```json
{
  "mrr": 2450.00,
  "arr": 29400.00,
  "mrr_trend_pct": 12,
  "active_premium": 245,
  "breakdown_monthly": 67,
  "breakdown_annual": 178,
  "active_free": 1200,
  "churn_rate": 0.032,
  "arpu": 12.07,
  "new_users_30d": 89,
  "churned_30d": 3,
  "growth_mom": 0.15,
  "currency_rate_xof": 655
}
```

### `GET /api/admin/charts`
Retourne les données temporelles pour les graphiques de tendance de chiffre d'affaires et de répartition par offre.

---

## 3. Endpoints Gestion des Utilisateurs (Profs)

### `GET /api/leads` ou `GET /api/admin/users`
Retourne la liste filtrée et paginée des enseignants inscrits.

**Paramètres de requête (Optionnels) :**
- `q` : Recherche textuelle (nom, email, tel, école)
- `plan` : `all | free | premium_monthly | premium_annual`
- `status` : `all | active | inactive | paused | churned`
- `limit` : Nombre d'éléments par page (défaut : 25)
- `offset` : Décalage de pagination

### `POST /api/leads`
Capture les coordonnées d'un nouvel enseignant (Lead scraping & inscription).

**Corps de la requête :**
```json
{
  "name": "Émile Dubois",
  "email": "emile@gmail.com",
  "whatsapp": "+225 07 45 89 12",
  "school": "Lycée Classique d'Abidjan",
  "plan": "free"
}
```

### `PATCH /api/leads/:id`
Met à jour le statut, le forfait, ou les notes internes d'un compte utilisateur.

**Corps de la requête (Exemple Upgrade / Pause) :**
```json
{
  "plan": "premium_monthly",
  "status": "active",
  "notes": "Passage en Premium validé par Mobile Money"
}
```

### `DELETE /api/leads/:id`
Supprime définitivement un compte utilisateur.

---

## 4. Endpoints Transactions & Facturation

### `GET /api/admin/transactions`
Retourne l'historique complet des paiements, renouvellements et remboursements.

### `POST /api/admin/refund`
Émet un remboursement pour un paiement spécifique.

**Corps de la requête :**
```json
{
  "transaction_id": "txn_456",
  "user_id": "user_123",
  "amount": 9.99,
  "reason": "Demande de rétractation dans les délais"
}
```

### `POST /api/admin/send-email`
Envoie un email transactionnel ou modèle de réengagement à un enseignant.

**Corps de la requête :**
```json
{
  "user_id": "user_123",
  "template": "re_engagement | payment_retry | premium_welcome",
  "custom_message": "..."
}
```
