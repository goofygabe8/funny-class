import puppeteer from 'puppeteer-core';

const URL = process.argv[2] || 'https://gabes-class.pages.dev/?debug=1&server=wss://gabes-class.pages.dev';
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';

async function open() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--window-size=1280,720'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.setViewport({ width: 1280, height: 720 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForFunction(() => typeof window.__game !== 'undefined', { timeout: 15000 });
  return { browser, page, errs };
}

async function hostLobby(page, name = 'Host') {
  await page.evaluate((n) => {
    nameInput.value = n;
    nameInput.dispatchEvent(new Event('input'));
  }, name);
  await page.click('#hostBtn');
  await page.waitForFunction(() => lobbyCode.textContent.length === 5, { timeout: 15000 });
  return page.evaluate(() => lobbyCode.textContent);
}

async function joinLobby(page, code, name = 'Guest') {
  await page.evaluate((n, c) => {
    nameInput.value = n;
    nameInput.dispatchEvent(new Event('input'));
    codeInput.value = c;
  }, name, code);
  await page.click('#joinBtn');
  await page.waitForFunction(() => !document.getElementById('lobby').classList.contains('hidden'), { timeout: 15000 });
}

const { browser, page: host, errs: hostErrs } = await open();
const { page: guest, errs: guestErrs } = await (async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.setViewport({ width: 1280, height: 720 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForFunction(() => typeof window.__game !== 'undefined', { timeout: 15000 });
  return { page, errs };
})();

try {
  const code = await hostLobby(host);
  await joinLobby(guest, code);
  const players = await guest.evaluate(() => [...playerList.children].map((l) => l.textContent));
  if (players.length < 2) throw new Error('join failed: ' + players.join(','));

  await host.evaluate(() => {
    botSelect.value = '3';
    botSelect.dispatchEvent(new Event('change'));
    startBtn.click();
  });
  await host.waitForFunction(() => !!window.__game.race, { timeout: 10000 });
  await guest.waitForFunction(() => !!window.__game.race, { timeout: 10000 });

  await host.evaluate(async () => {
    const { botInput } = await import('/js/bots.js');
    const r = window.__game.race;
    r.laps = 1;
    const orig = r.fixedStep.bind(r);
    r.fixedStep = (dt, inp) => orig(dt, { state: botInput(r.me, r, dt), consumeItem: () => false });
  });
  await guest.evaluate(async () => {
    const { botInput } = await import('/js/bots.js');
    const r = window.__game.race;
    r.laps = 1;
    const orig = r.fixedStep.bind(r);
    r.fixedStep = (dt, inp) => orig(dt, { state: botInput(r.me, r, dt), consumeItem: () => false });
  });

  // Drive until both humans finish or 90s.
  const deadline = Date.now() + 90000;
  let done = false;
  while (Date.now() < deadline) {
    done = await host.evaluate(() => {
      const r = window.__game.race;
      return !!(r && r.resultsShown);
    });
    if (done) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!done) throw new Error('race did not finish in time');

  const rows = await host.evaluate(() => [...resultsTable.querySelectorAll('tr')].map((t) => t.textContent));
  const guestRows = await guest.evaluate(() => [...resultsTable.querySelectorAll('tr')].map((t) => t.textContent));
  console.log(JSON.stringify({
    code,
    hostPlayers: await host.evaluate(() => [...playerList.children].map((l) => l.textContent)),
    guestPlayers: players,
    hostRows: rows,
    guestRows,
    hostErrs,
    guestErrs,
  }, null, 2));
  if (hostErrs.length || guestErrs.length) process.exit(2);
  console.log('live race ok');
} finally {
  await browser.close();
}
