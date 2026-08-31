# Correcteur Pédagogique Pro — Design System & Spécifications Dashboard Admin

## 1. Palette de Couleurs & Tokens

Le dashboard administrateur applique une identité visuelle dark ultra-lisible, premium et contrastée, alignée sur le modèle SaaS moderne :

| Rôle | Nom du Token | Valeur Hex / CSS | Utilisation |
|---|---|---|---|
| **Arrière-plan** | `Navy Base` | `#0A122A` | Fond global du dashboard |
| **Surfaces & Cartes** | `Card Surface` | `#111A35` | Fond des modules de métriques, tables et modales |
| **Bordures** | `Border Subtle` | `rgba(59, 130, 246, 0.2)` | Délimitation subtile des composants |
| **Texte Principal** | `Vanilla Bright` | `#FFF7E6` | Typographie haute lisibilité et titres |
| **Texte Secondaire** | `Text Muted` | `#94A3B8` | Sous-titres, labels, légendes et dates |
| **Accent SaaS** | `Accent Blue` | `#3B82F6` | Boutons d'actions, KPI phares et graphes |
| **Positif / Gain** | `Success Green` | `#10B981` | Tendances positives (+12%), statut actif, conversions |
| **Négatif / Perte** | `Alert Red` | `#EF4444` | Churn, paiements échoués, suppressions |
| **Avertissement** | `Warning Amber` | `#F59E0B` | Comptes en pause, alertes modérées |

---

## 2. Typographie & Hiérarchie

- **Titres (H1)** : 36px / 600 weight (`Outfit`, `Plus Jakarta Sans`)
- **En-têtes de modules (H2)** : 24px / 600 weight
- **Métriques clés (KPI Big Numbers)** : 32px à 38px / 800 weight tabular
- **Corps de texte (Body)** : 14px / 400 weight (hauteur de ligne 1.5)
- **Badges & Légendes (Caption)** : 12px / 600 weight

---

## 3. Composants & Spécifications UX

### Métriques Business (Hero Row)
- Grille responsive 4 colonnes (2x2 sur mobile / tablette)
- Cartes à bordures subtiles (`rgba(59, 130, 246, 0.2)`) et fond semi-transparent
- Affichage double devise instantané ($ USD et F CFA XOF, 1 USD = 655 XOF)

### Visualisations & Graphiques
- **Graphique 1 (Line Chart)** : Évolution du MRR sur 12 mois avec infobulles interactives et courbe d'interpolation lissée.
- **Graphique 2 (Donut Chart)** : Répartition des utilisateurs par plan (*Free*, *Premium Monthly*, *Premium Annual*).
- **Graphique 3 (Bar Chart)** : Contribution de chaque plan au revenu récurrent mensuel.

### Tableau de Gestion des Comptes Enseignants
- Recherche instantanée par nom, email, téléphone ou établissement (<500ms).
- Filtres rapides : Tous, Actifs, Inactifs, En Pause, Free, Premium, Churnés.
- Tri multicritères par colonne (Date d'inscription, Nom, Email, Plan, Activité).
- Menu d'actions (⋯) complet :
  1. *Voir le profil complet* (Modale détaillée)
  2. *Upgrader vers Premium* / *Passer en Free*
  3. *Mettre en pause* / *Réactiver*
  4. *Émettre un remboursement* (montant + motif)
  5. *Envoyer un email* (modèles prédéfinis)
  6. *Supprimer le compte* (avec confirmation sécurisée)

### Bandeaux d'Alertes Stratégiques
- **Alerte Rouge** : Paiements échoués nécessitant une relance.
- **Alerte Jaune** : Augmentation du taux de churn au-delà du seuil de 3.5%.
- **Alerte Bleue** : Utilisateurs inactifs depuis plus de 30 jours (campagne de réengagement).

### Export & Reporting
- Export CSV instantané de la base utilisateurs.
- Export CSV de l'historique financier des transactions.
