# Higgsfield B-roll — shot list & prompts

Higgsfield (higgsfield.ai) est une plateforme web : les clips se génèrent
dans ton compte, puis se déposent ici. La vidéo Remotion les tisse
automatiquement entre les scènes typographiques.

## Comment intégrer tes clips

1. Génère les clips ci-dessous sur higgsfield.ai (format 16:9, ≥1080p).
2. Télécharge-les dans `video/public/broll/` : `broll-1.mp4`, `broll-2.mp4`, `broll-3.mp4`.
3. Dans `video/src/Video.tsx`, remplis le tableau `BROLL` :
   `export const BROLL = ["broll/broll-1.mp4", "broll/broll-2.mp4", "broll/broll-3.mp4"];`
   puis insère des scènes `{ d: 90, C: () => <Broll file="…" /> }` où tu veux
   (un composant `<OffthreadVideo src={staticFile(file)} />` suffit).
4. `npm run render` dans `video/`.

## Les 3 clips à générer (direction artistique : énergie memecoin,
   lumière chaude orange, jamais de texte incrusté — le texte est chez nous)

### Clip 1 — ouverture (après la scène logo)
> Cinematic macro shot of a golden coin spinning in slow motion on a cream
> paper surface, warm orange rim lighting, shallow depth of field, dust
> particles floating, high contrast studio look, no text, 4k

### Clip 2 — tension de marché (avant la scène "the offer")
> Fast dolly-in over a dark trading desk at night, multiple glowing candle
> charts reflected on a trader's glasses, green and red candles flickering,
> orange accent light, cinematic, moody, no text, 4k

### Clip 3 — la paie (avant le CTA final)
> Slow motion burst of hundred dollar bills and golden confetti flying
> against a cream background, warm orange studio lighting, playful and
> premium, cartoon-like energy, no text, 4k

## Specs
- 16:9, 1920×1080 min, 24–30 fps, 3–4 s par clip (les scènes font 90 frames).
- Pas de texte dans l'image (le lettrage vit dans Remotion).
- Palette : crème #f2efe6, encre #131110, orange #ff5200 — demande "warm
  orange accent" dans chaque prompt pour rester dans la charte.
