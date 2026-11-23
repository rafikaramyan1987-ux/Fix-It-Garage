# Fix It Garage 1.1.1 — release

Written by `npm run release` (`scripts/release.mjs`): every portal build is rebuilt and zipped with its static checks,
then each portal folder gets the game zip to upload and a media zip with that portal's store images / videos (files at
the zip root). Store texts and per-portal notes: the README in each `submission*/` folder.

| Portal | Game zip (upload) | Media zip |
|---|---|---|
| CrazyGames | `crazygames/fix-it-garage-crazygames-v1.1.1.zip` | `crazygames/fix-it-garage-crazygames-media.zip`: cover-1920x1080.png, cover-800x1200.png, cover-800x800.png, trailer-1080x1920.mp4, trailer-1920x1080.mp4 |
| GameDistribution | `gamedistribution/fix-it-garage-gd-v1.1.1.zip` | `gamedistribution/fix-it-garage-gamedistribution-media.zip`: thumb-1280x550.jpg, thumb-1280x720.jpg, thumb-200x120.jpg, thumb-512x384.jpg, thumb-512x512.jpg |
| GamePix | `gamepix/fix-it-garage-gamepix-v1.1.1.zip` | `gamepix/fix-it-garage-gamepix-media.zip`: cover-1360x850.jpg, icon-256x256.jpg |
| Playgama | `playgama/fix-it-garage-playgama-v3.zip` | `playgama/fix-it-garage-playgama-media.zip`: cover-1080x1920.png, cover-1920x1080.png, cover-800x800.png, icon-512x512.png |
| GameMonetize | `gamemonetize/fix-it-garage-gamemonetize-v1.zip` | `gamemonetize/fix-it-garage-gamemonetize-media.zip`: fix-it-garage-512x340.jpg, fix-it-garage-512x384.jpg, fix-it-garage-512x512.jpg |
| Open portals (itch.io, Newgrounds, …) | `web/fix-it-garage-web-v2.zip` | `web/fix-it-garage-web-media.zip`: cover-630x500.png, icon-512x512.png, screenshot-1.png, screenshot-2.png, screenshot-3.png, screenshot-4.png |
| Y8 | `y8/fix-it-garage-y8-v1.zip` | `y8/fix-it-garage-y8-media.zip`: gameplay-1280x720.mp4, gameplay-960x720.mp4, promo-gamecard.png, promo-landscape.png, promo-portrait.png, standard-1.png, standard-2.png, standard-3.png, standard-4.png, standard-5.png, standard-6.png, widescreen-1.png, widescreen-2.png, widescreen-3.png, widescreen-4.png, widescreen-5.png, widescreen-6.png |

## Y8 media slots (`y8/media/`, also in `y8/fix-it-garage-y8-media.zip`)

| Y8 Studio → Media slot | File | Spec |
|---|---|---|
| Standard Screenshot (4:3) ×6 | `standard-1.png` … `standard-6.png` | 760x570 PNG, < 2 MB |
| Widescreen Screenshot (16:9) ×6 | `widescreen-1.png` … `widescreen-6.png` | 1280x720 PNG, < 5 MB |
| Landscape Promo | `promo-landscape.png` | 1920x1080 PNG, < 5 MB |
| Portrait Promo | `promo-portrait.png` | 1080x1920 PNG, < 5 MB |
| Game Card Promo | `promo-gamecard.png` | 760x570 PNG, < 2 MB |
| Gameplay Video (16:9) — approved, unchanged | `gameplay-1280x720.mp4` | H.264 1280x720, 28 s |
| Gameplay Video (4:3) — the same take, if asked | `gameplay-960x720.mp4` | H.264 960x720, 28 s |

Screenshots `N` are the same moment at both sizes, each a different career job and car, all mid-gameplay (no menu,
title, tutorial hint or arrow, loading screen, level select, popup or caption):
1. Job 19, classic car: the battery tester clipped on the terminals
2. Job 33, hatchback up on the lift: unbolting the leaking exhaust
3. Job 21, pickup on the lift: the wheel nuts coming off in a star pattern
4. Job 22, sports car: wheel off, the worn brake pads coming out
5. Job 17, sedan: spraying fresh paint over the scratch
6. Job 3, van: pouring oil into the engine

Promos: the 3D garage scene with the game logo "Fix It Garage" as the only text (no tagline, no buttons, no sign).
