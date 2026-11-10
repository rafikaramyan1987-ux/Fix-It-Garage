# CrazyGames quality guidelines: how Fix It Garage meets them

## Onboarding
- [x] **Straight into play:** a new player is in the first job within a few seconds of loading. There is no menu, intro or text page first, and the car drives in at once. Returning players get the main menu. (e2e: "a new player lands straight in the first job")
- [x] **Tutorial inside gameplay:** a hand pointer and a glowing highlight on the next button, or an arrow on the next 3D part. Each step has one short line of text, one step at a time.
- [x] **Only the core actions are taught:** use a tool (battery tester), order and swap a part (battery), test the car.
- [x] **Everything else is introduced when first needed:**
  - star-pattern wheel nuts, pouring, paint and the lift buttons each explain themselves with a short prompt the first time they appear
  - a locked tool says where to buy it
  - a tricky customer's ticket explains the twist
  - the Garage is suggested when the first upgrade becomes affordable
- [x] **The tutorial is skippable** with a button on the bubble, saved, and never shown again.
- [x] **The goal is always visible:** the job ticket shows the customer's complaint, the reward and time bonus, the target time, and the clues found so far. The HUD shows the workshop clock and the remaining bonus.

## General principles
- [x] **Controls:** mouse and touch are the main controls. Big buttons (54 px or more), generous touch areas on 3D parts, and it works in landscape and portrait.
- [x] **Instant feedback on every tap:**
  - every button gives a click sound and a press animation
  - a tap on a 3D part gives a ring, and a tap on nothing gives a soft "miss" ring and sound
  - bolts ratchet with a progress ring
  - parts thud with dust, the last terminal sparks, a fixed fault sparkles, and payment adds coins and stars
- [x] **No waiting screens:** after the first load (one loading bar of about 0.9 MB) nothing blocks for more than 1 s. Arrivals and camera moves are short gameplay animations, and readouts close with one tap.
- [x] **Saving:** progress is saved automatically under one known localStorage key (or the portal's cloud storage).
- [x] **Languages:** 10 languages, picked from GamePix.lang(), the CrazyGames locale or the browser language. The player can change it in Settings. CI checks that every language has every key, and an e2e test checks that text fits in de, ru, fr, pl and tr at 390x844 and 1920x1080.
- [x] **Ads:**
  - interstitials only between jobs, at most one per 2 minutes, never during a repair
  - rewarded ads only from buttons the player taps (hint, free spare part, double payment), each with a TV icon and a clear label
  - one notice line before the first rewarded ad of the session
  - the reward is given only when the ad completed; otherwise "No ad available right now, try later" shows for 2.5 s
  - the web build has no ads at all

## Fun
- [x] **Every job is a small deduction puzzle:** the symptom, then the clues (each tool costs time), then the right part. Wrong parts cost money and a star, and the test drive names what is still wrong.
- [x] **Pacing and variety:**
  - 40 hand-made career jobs, then endless generated jobs
  - two-fault jobs from job 17
  - every 5th job is a tricky customer (misleading, in a rush, picky or VIP)
  - the job validator checks that no two jobs in a row are identical and that the career changes car type every job
- [x] **Repetition shrinks with upgrades:**
  - the impact wrench turns all the nuts of a wheel, or all the bolts of a part, with one hold
  - express parts arrive faster
  - the second lift speeds up work underneath
  - the paint booth speeds up paint jobs
- [x] **Goals beyond the next job:** garage upgrades (visible in the 3D garage), new car types, a daily job at double pay, a repair book and 13 achievements.

## Uniqueness
- [x] An original repair game built on a diagnosis loop: symptoms, then clues, then deduction, then a tactile repair, then a test drive.
- [x] **Rules that make players think:**
  - classic cars have no OBD port, and electric cars have no exhaust
  - a car that won't start can't be test-driven or listened to
  - some symptoms are shared (battery vs starter, tyre vs tie rod), so a second tool is needed
- [x] Original names and art: no brands, logos or characters from other games.

## Aesthetics
- [x] **One consistent style:** cozy, bright, stylized low-poly.
  - cars from the Kenney Car Kit (CC0)
  - every garage prop, part and tool modelled in code in the same rounded style
  - the same soft lighting, shadows and environment reflections everywhere
- [x] **UI:** one rounded font family (Fredoka, with Nunito for Cyrillic), one colour palette and SVG icons. Posters and labels in the 3D scene are picture-only, so they suit every language.
- [x] **Audio:** synthesised sound effects at balanced levels through one compressor, and a gentle looping garage tune scheduled bar by bar so it loops cleanly. Music and sound effects each have their own switch, and the portal or ads can mute everything.

## Restricted keys
- [x] **Keyboard is optional:** shortcuts are listed in a small overlay (the ⌨ button, desktop only):
  - 1–7: tools
  - R: repair
  - T: test drive
  - H: hint
  - Space or Enter: next step / confirm
  - P: pause
- [x] `KeyboardEvent.code` is used, so the shortcuts work the same on QWERTY and AZERTY keyboards.
- [x] **Escape is never used**, so it stays free for leaving fullscreen. Pause is on P (and the pause button). Shortcuts with Ctrl, Cmd or Alt are ignored. (e2e: "keyboard (optional) …")
