# Playtest report: a first-time player, jobs 1–10 and later jobs

## How the playtest was run

- **Who played.** `scripts/playtest/player.ts` drives a real Chromium through Playwright. It starts from a fresh save every run.
- **What it may look at.** Every tap is chosen only from what is on screen:
  - the hint line, the glowing part and the gesture hand (its position and kind)
  - the pulsing or glowing buttons
  - the readouts and the ticket text
  - the parts sheet
- **What it may not look at.** It never reads the job data or the game code. The game phase is read only to label its notes.
- **What it knows.** Like a player who knows a little about cars, it maps visible clue text to a part ("11.2 V, too weak" → battery). It uses the tools left to right until a clue points to a part, and it follows a pulsing button.
- **What it records.** It notes:
  - every wait of more than 2 s with nothing to do
  - every time it had to look through more than one parts tab
  - more than one hint at once, or a hint over the thing to touch
  - a step that takes more than 6 s
  - being stuck
- **When it taps on its own.** When the game shows "Tap to speed up", it taps right away, as a player would.

| Run | Size | Build | Video | Result |
| --- | --- | --- | --- | --- |
| Before, jobs 1–10 | 390×844 phone | main (`ee8dcc3`) | [phone-jobs-1-10.mp4](phone-jobs-1-10.mp4) | 7:17 for 10 jobs, 57 waits over 2 s, 5 tab hunts |
| Before, jobs 1–10 | 1920×1080 desktop | main (`ee8dcc3`) | [desktop-jobs-1-10.mp4](desktop-jobs-1-10.mp4) | the same flow and the same waits as on the phone |
| Before, later jobs | 390×844 | main | not recorded | job 15 OK, job 20 **stuck**, jobs 21 and 28 **stuck**, daily OK |
| After, jobs 1–10 | 390×844 phone | this branch | [phone-jobs-1-10-after.mp4](phone-jobs-1-10-after.mp4) | **4:46** for 10 jobs, **0** waits over 2 s, **0** tab hunts, nothing stuck |
| After, jobs 1–10 | 1920×1080 desktop | this branch | not recorded | 4:51, 0 waits over 2 s, 0 tab hunts, nothing stuck |
| After, later jobs | 390×844 | this branch | not recorded | jobs 15, 20, 21 and 28 and the daily job are all finished |

All times in the table below are video times (taken from a traced re-run of the same playthrough, so they may differ from the video by a few seconds toward the end). "Before" means `phone-jobs-1-10.mp4` (or the desktop video where it says so), and "after" means `phone-jobs-1-10-after.mp4`. Jobs 1–10 were reordered for variety, so the job numbers in the two videos are not the same job (see row 7).

## What happened and what was fixed

| # | Job | Time in video (before → after) | What happened | Why it is a problem | Fix | Fixed? |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | every job (phone) | 0:00–0:09 → 0:00–0:06 | In the garage view the car is a small toy in the middle. The bottom 40–50% of the screen is empty grey floor, and the tool grid covers a quarter of it. | The thing to look at is tiny, and half the screen shows nothing. | The camera frames the subject in the free band between the top strips (HUD, steps, ticket) and the bottom toolbar or action button, using an off-centre projection and a fit to that band. It follows smoothly when the toolbar comes and goes. Portrait shots are closer and steeper (garage, test, engine bay, wheel, OBD). | Yes |
| 2 | 1 (phone) | 0:09–0:30 → 0:06–0:21 | Battery swap: the engine bay fills the top half, and the bottom 40% is empty floor. | The action sits high up, and the player's thumb covers the parts of the engine. | Same as row 1, plus a tighter portrait engine-bay shot. | Yes |
| 3 | 1 (phone) | 0:01 → 0:01 | While the toolbar slides in, "Tap the battery tester" lands on the top row of the tool grid. | The hint covers the button it points to. | The hint is placed from the toolbar's layout position, not from its moving, animated box. | Yes |
| 4 | every job | 0:30–0:38, 1:24–1:33, 2:19–2:28, … → 0:21–0:26, 1:00–1:05 | From the passed test drive to "Next customer" takes **5.6–6.4 s**, and the next car's arrival takes **4 s** more. Nothing can be tapped. | That is more than 10 s of dead time per job. | The hand-back drive is shorter (2.4 s → 1.6 s, while the camera pulls back at the same time). The arrival is shorter (2.0 s → 1.5 s). The success pause is shorter (1.6 s → 0.9 s). All of it is **skippable**: a "▶▶ Tap to speed up" chip appears, and a tap plays the rest 4× faster. | Yes |
| 5 | 2, 3, 4, 7–10 | 0:44–0:50 (listen), 1:45–1:54 (look under), 2:52–3:02 (test drive, **6.4 s**) → 0:30–0:33, 1:12–1:14, 1:16–1:20 | The diagnosis tools "Listen", "Look under" and "Test drive" play 3.5–6.4 s scenes with nothing to do. | They are waits, and the player has to do them again on most jobs. | Every tool scene is skippable. The camera and lift return while the toolbar is already up. The battery tester is shorter: the hood opens while the camera moves, and measuring takes 1.8 s → 1.05 s. | Yes |
| 6 | every repair | 0:09–0:30, 0:51–1:24, 1:54–2:19, … → — | Between the player's moves during a repair there are 2.2–3.3 s gaps: the part drops, the camera moves, the money counts down, the lift rises. | Many small waits add up, and the rhythm feels slow. | Camera moves are 20% shorter. The money counts down while the part drops. The whole fitting is skippable *between* the player's moves: the chip disappears and the speed goes back to normal whenever something can be touched. The lift rising is skippable. | Yes (no wait over 2 s in the after run) |
| 7 | 2→3, 5→6, 8→9 | 0:51–2:19, 3:29–4:30, 5:37–6:34 → whole video | Neighbouring jobs repeat the same hands-on repair: brake pads and then a flat tyre (both take the wheel off, nut by nut), alternator and then spark plugs (both are engine bay swaps), air filter and then starter (engine bay again). | The first ten jobs feel like the same job twice in a row. | Jobs 1–10 are reordered: battery, brake pads, **oil (van)**, tyre, alternator, **muffler (van, under the car)**, spark plugs, **brake disc**, starter, tyre (rush). Neighbours now never share a repair action. The van unlocks at job 3. The job validator now fails CI if two neighbouring jobs in 1–10 share a repair action. | Yes |
| 8 | 2, 3, 4, 7, 10 | 0:51, 1:54, 3:02 (**4 tabs**), 4:46, 6:56 → none | The parts sheet always opens on "Engine bay". To order brake pads, tyre, oil or muffler, the player looks through 2–4 tabs. | The player has just found the clue, and now has to hunt for the part. | The parts sheet opens on the tab where the latest problem was found: the part group that best matches the latest bad reading. | Yes |
| 9 | 3 (phone) | 1:39–1:45 → — | Listen view: a traffic cone fills the bottom of the screen in front of the car. | It is clutter in front of the subject. | The cones moved to the far left corner, away from every camera path. | Yes |
| 10 | 4 → 3 (phone) | 2:48–2:52 → 1:14–1:16 | OBD scanner ("Reading the car's computer…"): the blue lift post stands between the camera and the car. | The player sees a post instead of the car. | The OBD view comes more from the front. The lift posts fade to see-through whenever they stand between the camera and what it looks at. | Yes |
| 11 | 7 → 6 (phone) | 4:46–5:06 → 2:36–2:49 | Muffler swap under the car: the lift post covers half of the bolts. | The thing to touch is hidden. | The posts fade, as in row 10. | Yes |
| 12 | 21, 28 (two faults) | not recorded | After one of the two faults is fixed, the test drive fails ("Not fixed yet: …"). The **Test button keeps pulsing**, and Repair does not. A player who follows the glow presses Test again and again: the bot did it for 60 minutes. | This is a soft lock for anyone who trusts the glowing button. | After a failed test drive, the Test button stops pulsing until a new part is fitted. Repair pulses again. The steps bar goes back to "Find", and one line says "One fault left: **pick a tool**". There is an e2e test for this. | Yes (jobs 21 and 28 are finished) |
| 13 | 20 (tricky) | not recorded | The clues point to the catalytic converter ($220), but the player has $150. The Order button is greyed out, and nothing on screen says what to do. | This is a dead end. It can also happen in a normal career after buying upgrades or a few wrong parts. | A part can always be ordered. When the player is short of cash, the part goes on credit ("Short of cash: on credit, the customer pays it back"), and the balance shows a red minus until the customer pays. There is an e2e test for this. | Yes (job 20 is finished) |
| 14 | 2 (brake job, found in the after run) | — → 0:33–1:00 | When the new pads are placed, the camera jumps to a steep overview. The caliper bolts to tighten are then hidden behind the car body, and on desktop the spare wheel could leave the screen. | The player can't see what the glowing hint points at. | The brake parts are placed from a side view. The camera goes back to the wheel close-up for the bolts, and the hub and the wheel are framed together for "put the wheel back". As a safety net, a repair step never waits on an object outside the screen: the camera moves to it first. | Yes |
| 15 | 15 (tricky, misleading) | not recorded | The job could be played. The tie rod was on the 3rd tab (row 8). | — | Row 8. | Yes |
| 16 | 28 (two faults, after) | not recorded | The oil warning light is a clue for low oil (fluids tab) and for a leaking oil gasket (underside tab). The sheet opened on Fluids, and the gasket was on the next tab. | It is a small hunt, and only on a job whose clue fits both parts. | Not changed on purpose: opening the right tab here would give away the deduction. | Accepted |
| 17 | daily job | not recorded | It could be played from the menu at double pay, and it returns to the menu. | — | — | Nothing to fix |
| 18 | all (desktop) | desktop 0:00–0:09, 0:30–0:38 | The same issues as on the phone, in a milder form: the car is small in the garage and test views, and there are the same waits. | — | Rows 1 and 4–8. The landscape garage and test shots are also tighter. | Yes |

**Checked and fine in both runs:**
- never more than one hint line
- no hint over the thing to touch
- the hint hides after the first correct move
- the next action is visible within 2 s at every step: the glowing part with the gesture hand, or a pulsing button

## Numbers

| | Before | After |
| --- | ---: | ---: |
| Jobs 1–10 on the phone (video length) | 7:17 | 4:46 |
| Waits over 2 s with nothing to do (jobs 1–10) | 57 | 0 |
| Parts-tab hunts | 5 | 0 |
| Later jobs that could not be finished (20, 21, 28) | 3 | 0 |
