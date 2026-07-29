# 🧪 Répertoire des Scénarios de Tests (QA)

Ce document centralise les scénarios de tests fonctionnels de la plateforme NextLayer. Il est conçu pour être utilisé lors des phases de validation (QA) après chaque mise à jour. Vous pouvez copier ce tableau directement dans Excel, Google Sheets ou Notion pour y ajouter des colonnes de statut (ex: `À tester`, `En cours`, `Validé 🟢`, `Échoué 🔴`).

## 🛒 1. Pipeline Commandes & Stock (Standard)

| ID | Module | Scénario / Action | Résultat Attendu |
| :--- | :--- | :--- | :--- |
| **CMD-01** | Commande | Créer une commande avec un article "Standard" en stock. | La commande est créée en statut `pending`. Le stock actuel n'est pas encore débité. |
| **CMD-02** | Commande / Stock | Passer la commande standard (CMD-01) en statut `ready`. | Le système valide la disponibilité, déduit la quantité exacte du stock, et enregistre un mouvement de stock (Stock Movements). |
| **CMD-03** | Commande / Stock | Tenter de passer une commande standard en `ready` alors que le stock est insuffisant. | Le système bloque l'action, affiche une erreur claire indiquant l'article manquant et la quantité requise vs disponible. |

## ⚙️ 2. Pipeline Production (Sur Mesure & Composites)

| ID | Module | Scénario / Action | Résultat Attendu |
| :--- | :--- | :--- | :--- |
| **PRD-01** | Commande / Prod | Créer une commande avec un article "Sur mesure" (Custom). | La commande est créée et un job de production est automatiquement généré en statut `queued`. |
| **PRD-02** | Commande / Prod | Créer une commande avec un article "Composite" (plusieurs pièces). | La commande est créée. Le système génère un job de production distinct pour chaque sous-pièce du composite. |
| **PRD-03** | Production | Avancer un job de production de `queued` à `printing`. | Le statut du job passe à `printing`. (Optionnel: la commande globale passe en `in_production` si c'est le 1er job). |
| **PRD-04** | Production | Marquer un job de production comme `done` (terminé). | Une modale s'ouvre pour saisir les paramètres réels (coût, temps, grammes de filament, bobine utilisée). |
| **PRD-05** | Production | Renseigner les données de fin de production et valider. | Le job passe en `done`. Le stock du filament utilisé (Materials) est déduit selon les grammes saisis. |
| **PRD-06** | Commande | Marquer une commande sur mesure payée (`Paid`). | Si la commande est personnalisée, le système l'ajoute automatiquement au catalogue "Produits" avec son coût réel calculé. |

## 🤝 3. Pipeline Revendeurs (Consignations)

| ID | Module | Scénario / Action | Résultat Attendu |
| :--- | :--- | :--- | :--- |
| **REV-01** | Revendeur | Créer une nouvelle consignation de 10 articles pour un revendeur. | La consignation est "Active". Le stock global de ces articles est débité de 10 unités. |
| **REV-02** | Revendeur | Enregistrer une vente de 3 articles sur cette consignation. | La quantité vendue passe à 3. Le tableau de bord affiche un revenu "Revendeur" en attente de règlement. |
| **REV-03** | Revendeur | Enregistrer un retour de 2 articles invendus. | La quantité retournée passe à 2. Ces 2 articles sont réintégrés au stock global. |
| **REV-04** | Revendeur | Clôturer (Settle) la consignation. | Le statut passe à "Settled". Le revenu des 3 ventes est officiellement ajouté aux KPIs du Dashboard. |

## 💳 4. Pipeline Finances & Founder Wallet

| ID | Module | Scénario / Action | Résultat Attendu |
| :--- | :--- | :--- | :--- |
| **FIN-01** | Dépenses | Ajouter une dépense classique payée en cash par l'entreprise. | La dépense apparaît dans la liste et diminue le "Net Profit" du mois en cours dans le Dashboard. |
| **FIN-02** | Dépenses | Ajouter une dépense partagée (Split) entre 2 fondateurs. | La dépense est divisée. Le solde des contributions de chaque fondateur augmente proportionnellement dans "Per Team Member". |
| **FIN-03** | Founder Wallet | Passer une commande de 50 TND et la payer via le "Founder Wallet" du Fondateur A. | La commande passe en statut `paid`. |
| **FIN-04** | Dashboard | Vérifier l'impact de l'action FIN-03 sur le Dashboard. | Le revenu direct de l'entreprise **N'A PAS** augmenté de 50 TND. Le Net Profit reste intact. |
| **FIN-05** | Founder Wallet | Vérifier le solde du Fondateur A dans la page Dépenses suite à FIN-03. | La carte du Fondateur A affiche : Consommé = 50 TND. Le "Wallet Balance" est réduit de 50 TND. |

---

### 💡 Conseil d'utilisation
Pour un usage professionnel au quotidien, exportez ce format vers **Notion** en copiant/collant ce tableau, et ajoutez-y une colonne de Cases à cocher (Checkboxes) ou de menus déroulants (To Do, Passé, Échoué). Ainsi, avant chaque déploiement majeur, l'équipe pourra dérouler ces tests de bout en bout pour garantir une stabilité totale à 100%.
