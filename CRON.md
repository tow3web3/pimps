# Crons externes (gratuit) — cron-job.org

Le plan Vercel Hobby limite les crons à 1/jour. Les trois tâches du site ont
besoin de plus — la solution gratuite : [cron-job.org](https://cron-job.org)
appelle nos routes, protégées par le `CRON_SECRET`.

## Ce que fait chaque cron

| Route | Cadence | Rôle |
|---|---|---|
| `/api/cron/universe` | toutes les 2 min | balaye pump.fun + DexScreener, met à jour l'univers de tokens |
| `/api/cron/payouts` | toutes les 5 min | **envoie les prizes USDC** — sans lui, personne n'est payé |
| `/api/cron/maintenance` | toutes les heures | purge sessions/nonces expirés, vieilles bougies |

## Configuration (5 minutes)

1. Crée un compte sur cron-job.org (gratuit).
2. Crée **3 jobs**, un par ligne du tableau, avec :
   - **URL** : `https://<ton-domaine>/api/cron/<route>`
   - **Schedule** : la cadence du tableau
   - **Advanced → Headers** : ajoute un header
     `Authorization` = `Bearer <CRON_SECRET>` (la valeur est dans `.env.vercel`)
   - **Request method** : GET
3. Active "save responses" pour voir les réponses (`{"ok":true,...}`).

Sans le header, la route répond 401 — c'est le comportement attendu.

## Vérifier que ça tourne

- `payouts` répond `{"ok":true,"paid":N}` — N > 0 quand un prize part.
- `universe` répond `{"ok":true,"tokens":~200}`.
- Un prize passe `pending → paid` dans le dashboard du gagnant, avec le lien
  Solscan de la transaction.

## Si tu passes Vercel Pro plus tard

`vercel.json` déclare déjà les mêmes crons — il n'y a rien à changer, tu peux
simplement supprimer les jobs cron-job.org.
