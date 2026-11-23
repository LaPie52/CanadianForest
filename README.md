# La grande chasse photo — forêt canadienne

Mini-jeu HTML/CSS/JavaScript prêt pour GitHub Pages, compatible souris et écran tactile.

## Fichiers
- `index.html` : accueil, jeu et écran de résultats
- `style.css` : interface responsive
- `game.js` : cibles, points, sons et classement
- `config.js` : paramètres publics Supabase à renseigner
- `assets/` : décor et sprites des cibles
- `supabase-setup.sql` : création de la table et des règles d'accès

## 1. Activer le classement partagé (Supabase)

1. Crée un projet sur https://supabase.com/
2. Dans le tableau de bord Supabase, ouvre **SQL Editor**.
3. Colle le contenu de `supabase-setup.sql` et exécute-le.
4. Ouvre **Project Settings → API** (ou **Data API** selon l'interface).
5. Copie l'URL du projet et la clé publique `anon` / `publishable`.
6. Dans `config.js`, remplace :
   - `https://TON-PROJET.supabase.co`
   - `TA_CLE_ANON_OU_PUBLISHABLE`
7. Ne mets jamais la clé `service_role` dans le site public.

Le classement est alors commun à tous les visiteurs du site GitHub Pages. Le TOP 10 est chargé en ligne et chaque fin de partie envoie le surnom et le score.

## 2. Publier sur GitHub Pages

1. Crée un dépôt GitHub public.
2. Ajoute tous les fichiers et le dossier `assets/` en conservant leur structure.
3. Dans **Settings → Pages**, choisis **Deploy from a branch**, branche `main`, dossier `/ (root)`.
4. Enregistre et attends l'URL publiée par GitHub.

Le site est statique : aucune compilation ni installation n'est nécessaire.

## 3. Jouer sur téléphone

Le jeu accepte le tactile : touche directement une cible pour marquer les points. Sur téléphone, l'expérience est plus confortable en mode paysage. Le navigateur doit autoriser les sons après le premier appui.

## Barème
- Écureuil, tamia coréen, oie : +100
- Cerf, renard : +200
- Ours : +300
- Garçon ou fille : −500

Partie de 30 secondes. Les cibles apparaissent aléatoirement.

## Important : confiance du classement

Cette version utilise la clé publique Supabase dans le navigateur et des règles RLS pour permettre la lecture et l'ajout des scores. C'est adapté à un jeu amical entre visiteurs, mais **ce n'est pas un système anti-triche** : un utilisateur technique pourrait envoyer un faux score via l'API. Pour un classement compétitif à enjeu, il faudrait déplacer la validation des parties côté serveur (par exemple via une Supabase Edge Function avec limitation de fréquence et vérification).
