# Kart Rush

A free, low-poly 3D multiplayer kart racer that runs in the browser (built for Chromebooks).
One player hosts a lobby and gets a 5-letter code; friends join by typing the code.
There are 3 tracks, items, drifting with mini-turbos, and AI bots to fill empty spots.

There is no server to pay for. The game is a static website, and players connect directly to
each other with WebRTC through [PeerJS](https://peerjs.com). The free PeerJS broker is only used
to find each other.

## Controls

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Gas | W or Up | A or RT | GAS |
| Brake / reverse | S or Down | B or LT | BRAKE |
| Steer | A D or Left Right | Left stick | Arrow buttons |
| Drift | Space (hold while steering) | LB or RB | DRIFT |
| Use item | Shift or E | X or Y | ITEM |

**Drifting:** hold drift while turning. The sparks turn blue and then orange. Let go for a speed boost
(orange sparks give the bigger one).

**Items** come from the rainbow `?` boxes. Racers further back get better items.

- Mushroom: a quick speed boost
- Banana: dropped behind you, and spins out whoever hits it
- Green shell: fires straight ahead and bounces off walls
- Red shell: follows the track and homes in on the racer ahead of you
- Star: 7 seconds of invincibility and extra speed, and you spin out anyone you touch

## Tracks

- **Meadow Loop**: a grassy circuit with a chicane
- **Sunset Bridge 8**: a figure-8 with an overpass
- **Volcano Twist**: tight hairpins, and the lava slows you down a lot

## Playing locally

Browsers block ES modules from `file://`, so serve the folder:

```bash
cd kart-racer
npx http-server -c-1
# or: python3 -m http.server 8080
```

Open the printed URL. To test multiplayer on one computer, open the page in **two separate windows**
(not two tabs of the same window), host in one and join from the other with the code.

## Deploying for free (GitHub Pages)

1. Create a new repository on GitHub (e.g. `kart-racer`) and push this folder to it:

   ```bash
   cd kart-racer
   git init
   git add .
   git commit -m "Kart Rush"
   git branch -M main
   git remote add origin https://github.com/<your-username>/kart-racer.git
   git push -u origin main
   ```

2. On GitHub, open **Settings > Pages**, set **Source** to "Deploy from a branch", pick `main` and `/ (root)`, and click Save.
3. After a minute the game is live at `https://<your-username>.github.io/kart-racer/`.
   Share that link; everyone opens it in Chrome, one person hosts, and the others join with the code.

Netlify or Cloudflare Pages also work: drag and drop the folder, no build step needed.

## How the multiplayer works

- The host's browser is in charge of the race. It runs the bots, item boxes, shells and bananas,
  decides who got hit, and keeps the finish order. It sends a snapshot of everything 20 times a second.
- Each player drives their own kart locally, so steering has no lag, and sends their position to the host.
  Other karts are smoothed between updates.
- If the host closes the page, the race ends for everyone.
- The host must keep the game tab open. The race keeps running if the host switches to another tab.

## Troubleshooting

- **"No lobby found with that code":** check the code, and make sure the host is still on the lobby screen.
- **Stuck on "Connecting..." on a school network:** some networks block peer-to-peer connections.
  Try a phone hotspot or home Wi-Fi. For locked-down networks you can add a TURN server
  (for example a free [metered.ca](https://www.metered.ca/tools/openrelay/) account) to `ICE_SERVERS` in `js/net.js`.
- **Choppy on an older Chromebook:** keep **Graphics: Low** on the main menu.

## Project layout

```
index.html          page, UI overlays, CDN import map (three.js, PeerJS)
css/style.css       menu, lobby, HUD, results, touch controls
js/main.js          renderer, game loop, screen switching
js/net.js           PeerJS host/join with lobby codes
js/lobby.js         menu + lobby UI, player list, track/bot selection
js/race.js          race flow, networking sync, laps, positions, results
js/kart.js          arcade kart physics, drifting, kart model
js/track.js         spline track builder (road, walls, pads, scenery)
js/tracks/index.js  the 3 track definitions
js/items.js         item boxes, items, projectiles
js/bots.js          AI drivers
js/camera.js        chase camera and menu orbit camera
js/hud.js           position, lap, timer, item slot, minimap
js/input.js         keyboard, gamepad and touch input
```
