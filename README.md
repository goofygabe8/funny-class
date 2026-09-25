# Kart Rush (Gabe's Class)

A free 3D multiplayer kart racer for Chromebooks.

**Play:** [https://gabes-class.pages.dev](https://gabes-class.pages.dev)  
**Backup:** [https://goofygabe8.github.io/funny-class/](https://goofygabe8.github.io/funny-class/)

One player hosts a lobby and gets a 5-letter code. Friends join with the code.
Multiplayer runs through a free Cloudflare room server (WebSockets), so it works on school networks that block peer-to-peer.

## Controls

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Gas | W / Up | A / RT | GAS |
| Brake | S / Down | B / LT | BRAKE |
| Steer | A D / arrows | Stick | Arrows |
| Drift | Space | LB / RB | DRIFT |
| Item | Shift / E | X / Y | ITEM |

Hold drift while turning to charge blue then orange sparks, then release for a boost.
In the air off a ramp, tap drift for a small trick boost.

## Tracks

Meadow Loop, Sunset Bridge 8, Volcano Twist, Snowy Summit, Neon City.

## Local play

```bash
npm install
npm run dev:server   # Cloudflare room server on :8787
# another terminal:
npx http-server -c-1 -p 8080
```

Open `http://127.0.0.1:8080/?server=ws://127.0.0.1:8787` in two windows.

## Deploy

Needs Cloudflare secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (GitHub Actions or local env):

```bash
npm run deploy
```

Pushes the Worker (`gabes-class-server`) and the Pages site (`gabes-class`).

## Project layout

See `CREDITS.md` for licenses. Server code is in `server/`. Game client is the root `index.html` + `js/` + `css/`.
