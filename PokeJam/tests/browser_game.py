"""Desktop regression checks using Playwright and installed Google Chrome.

Start http.server from PokeJam, then run with playwright on PYTHONPATH.
An optional first argument overrides http://127.0.0.1:8001.
"""
import sys
from io import BytesIO

from PIL import Image

from playwright.sync_api import sync_playwright


BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8001"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=CHROME, headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    # Phaser consumes DOM key events on its next frame.
    for action in ("down", "up", "press"):
        method = getattr(page.keyboard, action)
        def flushed(*args, method=method, **kwargs):
            method(*args, **kwargs)
            page.wait_for_timeout(50)
        setattr(page.keyboard, action, flushed)
    page.goto(BASE + "/play.html?test=1", wait_until="domcontentloaded")
    page.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.players.length === 4")
    page.evaluate("""() => {
      window.s = pokeJamGame.scene.getScene('MatchScene');
      window.originalCpu = s.updateCpuMovement;
      s.updateCpuMovement = () => {};
      window.pokeJamShotChance = () => 1;
      window.step = (frames) => { for (let i = 0; i < frames; i++) s.update(0, 1000 / 60); };
      window.setup = (coop = false) => {
        s.coop = coop; s.manualControl = false; s.isPaused = false; s.gameOver = false; s.quarter = 1; s.clock = 120;
        s.shotClock=24; s.shotClockRimTeam=null;
        s.pauseOverlay.setVisible(false); s.pauseText.setText('PAUSED').setVisible(false);
        s.cancelUltimate('reset'); s.finishEvents = [];
        s.firePerks.clear(true);
        s.pendingInbound = null; s.score = {player: 0, cpu: 0}; s.resetPlayers();
        for (const p of s.players) {
          p.nextActionAt = 0; p.callHeld = false; p.calling = false; p.passCharge = null;
          p.nextCallAt = 0; p.jockeying = false; p.reachUntil = 0;
          p.makeStreak = 0; p.onFire = false;
          p.ultimateCharge = 0; p.record = s.recordsBySlug[p.slug];
        }
        s.giveBall(s.players[0]);
        s.updateHud();
      };
      window.check = (ok, message) => { if (!ok) throw new Error(message + ' ' + JSON.stringify({
        ball: s.ball.state, holder: s.ball.holder?.slug, time: s.matchTime,
        players: s.players.map(p => ({slug:p.slug, x:p.x, y:p.y, z:p.z, shooting:p.shooting,
          charge: Boolean(p.passCharge), held:p.shootHeld, dunk:p.dunking, prep:Boolean(p.alleyPrep)}))
      })); };
      setup();
      check(s.scoreText.text.includes('Q1 2:00'), 'Quarter and clock must be rendered Phaser text');
      step(121);
      check(s.clock < 119 && s.scoreText.text.includes('1:58'), 'Clock must count down');
    }""")
    page.keyboard.press("Escape")
    page.evaluate("""() => {
      const time = s.matchTime, clock = s.clock; step(120);
      check(s.isPaused && s.matchTime === time && s.clock === clock, 'Pause must freeze match time');
    }""")
    page.keyboard.press("Escape")
    page.evaluate("() => setup()")
    page.keyboard.press("q")
    page.evaluate("""() => {
      check(s.controlledPlayer() === s.players[1] && s.ball.holder === s.players[0], 'Q must switch offense without transferring ball');
      s.giveBall(s.players[0]);
      check(s.controlledPlayer() === s.players[0], 'Teammate possession must restore ball-handler control after manual selection');
    }""")
    page.locator("#switch-mon").click()
    page.evaluate("() => check(s.controlledPlayer() === s.players[1], 'Switch button must select other Pokemon')")
    page.evaluate("""() => {
      setup(); s.players[0].x = 800; s.players[0].y = 286;
      window.shotsBeforeFake = s.players[0].stats.shots;
    }""")
    page.keyboard.press("j")
    page.evaluate("""() => {
      check(s.ball.holder === s.players[0] && s.players[0].z === 0 && !s.players[0].dunking,
        'Quick non-turbo J near rim must pump fake while retaining ball');
      check(s.players[0].stats.shots === shotsBeforeFake, 'Pump fake must not count as shot');
      step(20);
    }""")
    page.keyboard.down("Shift")
    page.keyboard.press("j")
    page.evaluate("() => check(s.players[0].dunking, 'Turbo tap must commit to dunk instead of fake')")
    page.keyboard.up("Shift")
    page.evaluate("""() => {
      setup(); const p = s.players[0]; p.x = 800; p.y = 286;
    }""")
    page.keyboard.down("j")
    page.evaluate("""() => {
      step(10);
      check(s.players[0].dunking && s.ball.state === 'dunk', 'Held J in range must start dunk');
      check(s.ball.holder === s.players[0], 'Dunker must retain possession during approach');
      step(12); check(s.players[0].x > 800 && s.players[0].z > 0, 'Dunk must travel and jump');
    }""")
    page.keyboard.up("j")
    page.evaluate("""() => { step(55); check(s.score.player === 2, 'Unblocked dunk must finish'); }""")

    page.evaluate("""() => {
      setup(); const p = s.players[0]; p.x = 500; p.y = 230;
    }""")
    page.keyboard.down("j")
    page.keyboard.down("d")
    page.evaluate("""() => {
      const x = s.players[0].x; step(20);
      check(s.players[0].x === x && s.players[0].z > 0, 'Jump shot must lock court movement');
    }""")
    page.keyboard.up("d")
    page.keyboard.up("j")
    page.evaluate("""() => { check(s.ball.state === 'shot', 'J release outside dunk range must release jumper'); }""")

    page.evaluate("""() => {
      setup(); s.players[0].x = 710; s.players[0].y = 286;
      s.players[1].x = 780; s.players[1].y = 286;
      s.players[2].x = 400; s.players[3].x = 350;
      step(1); check(s.players[1].callout.visible, 'CPU under rim must call with exclamation');
    }""")
    page.keyboard.down("i")
    page.evaluate("""() => {
      step(28); check(s.ball.holder === s.players[0], 'Hold I must keep ball with passer');
      check(s.players[1].z > 28, 'Hold I must prepare airborne receiver');
    }""")
    page.keyboard.up("i")
    page.evaluate("""() => {
      check(s.ball.state === 'alley', 'Release I with airborne receiver must lob');
      step(18); check(s.players[1].dunking, 'CPU receiver must finish automatically');
      step(40); check(s.score.player === 2, 'CPU alley-oop must score');
    }""")

    page.evaluate("""() => {
      setup(true); s.players[0].x = 710; s.players[0].y = 286;
      s.players[1].x = 790; s.players[1].y = 286;
    }""")
    page.keyboard.down("l")
    page.keyboard.down("i")
    page.evaluate("""() => {
      step(20); check(s.players[1].callout.visible, 'Human teammate must call while pass key held');
      check(s.players[1].z > 28, 'Human call must start preparation jump');
    }""")
    page.keyboard.up("i")
    page.evaluate("""() => {
      step(18); check(s.players[1].awaitingFinish && !s.players[1].dunking && s.score.player === 0,
        'Human receiver must wait for shoot input');
    }""")
    page.keyboard.up("l")
    page.keyboard.down("k")
    page.evaluate("""() => { check(s.players[1].dunking, 'P2 shoot must finish caught lob'); step(42); check(s.score.player === 2, 'P2 oop must score'); }""")
    page.keyboard.up("k")

    page.evaluate("""() => {
      setup(true); s.players[0].x = 710; s.players[0].y = 286;
      s.players[1].x = 790; s.players[1].y = 286;
    }""")
    page.keyboard.down("l")
    page.keyboard.down("i")
    page.evaluate("() => step(20)")
    page.keyboard.up("i")
    page.keyboard.up("l")
    page.evaluate("""() => {
      step(100); check(s.score.player === 0 && !s.players[1].dunking,
        'Human receiver who never shoots must not auto-score');
      setup(); s.players[1].x = 300; s.players[1].y = 340;
    }""")
    page.keyboard.press("i")
    page.evaluate("""() => {
      check(s.ball.state === 'pass', 'Tap I outside oop window must be a normal pass');
      step(25); check(s.ball.holder === s.players[1], 'Normal pass must arrive');
    }""")

    page.evaluate("""() => {
      setup(); const handler = s.players[2], defender = s.players[0];
      handler.x = 510; handler.y = 286; defender.x = 550; defender.y = 286;
      s.giveBall(handler); s.soloPlayer = defender;
      window.savedRandom = Math.random; Math.random = () => 0;
    }""")
    page.keyboard.down("i")
    page.keyboard.press("j")
    page.evaluate("""() => {
      check(s.players[0].jockeying && s.ball.state === 'loose', 'Jockey plus J must attempt steal');
      step(20); check(s.ball.holder === s.players[0], 'Successful steal must be recoverable by defender');
      check(s.players[0].ultimateCharge === 15, 'Successful steal must earn 15 charge');
      Math.random = savedRandom;
    }""")
    page.keyboard.up("i")

    page.evaluate("""() => {
      setup(); const p = s.players[0]; p.x = 800; p.y = 286;
      window.pokeJamShotChance = () => 0; s.startDunk(p); step(55);
      check(s.score.player === 0 && !p.dunking, 'Rimmed dunk must miss without scoring');
      window.pokeJamShotChance = () => 1;
      setup(); s.setLooseBall(960, 300, 0, 0, 0); step(1);
      check(s.ball.state === 'dead' && s.pendingInbound.player.team === 'cpu', 'Out of bounds must switch possession');
      s.togglePause(); const at = s.pendingInbound.at; step(100);
      check(s.pendingInbound && s.pendingInbound.at === at, 'Paused inbound must not complete');
      s.togglePause(); step(30); check(s.ball.holder.team === 'cpu', 'Inbound must resume after pause');
    }""")

    page.evaluate("""() => {
      setup(); const attacker = s.players[2], defender = s.players[0];
      attacker.x = 180; attacker.y = 286; defender.x = 165; defender.y = 286;
      s.giveBall(attacker); s.soloPlayer = defender; s.startDunk(attacker);
      Math.random = () => 0;
    }""")
    page.keyboard.press("j")
    page.evaluate("""() => {
      check(s.players[0].blocking, 'J must block when opponent is dunking');
      step(18); check(s.players[0].stats.blocks > 0 && s.score.cpu === 0, 'Block must interrupt dunk before scoring');
      check(s.players[0].ultimateCharge === 20, 'Successful block must earn 20 charge');
      Math.random = savedRandom;
      setup(); s.clock = 0; step(1);
      check(s.quarter === 2 && s.clock === 120, 'Clock zero must advance quarter');
      s.quarter = 4; s.clock = 0; s.score = {player: 2, cpu: 2}; s.pendingInbound = null; step(1);
      check(s.quarter === 5 && s.clock === 60, 'Tied fourth quarter must start overtime');
      s.score.player = 4; s.clock = 0; s.pendingInbound = null; step(1);
      check(s.gameOver && s.pauseText.text === 'PLAYER WINS', 'Overtime lead must end match');
      setup();
      const made = (player) => s.resolveShot({shooter:player, made:true, points:2, kind:'jumper'});
      made(s.players[0]); made(s.players[0]);
      check(!s.players[0].onFire && s.players[0].makeStreak === 2, 'Two makes must not activate fire');
      made(s.players[0]); step(45);
      check(s.players[0].ultimateCharge === 100, 'Three baskets must fill and cap ultimate charge');
      check(s.players[0].onFire && s.fireText.text.includes('PIKACHU'), 'Third make must activate visible fire');
      window.pokeJamShotChance = () => 0.5;
      check(Math.abs(s.chanceFor(s.players[0], 'jumper', 0, 200) - 0.62) < 0.001, 'Fire must grant shooting bonus');
      const stamina = s.players[0].stamina;
      s.movePlayer(s.players[0], 1, 0, true, 0.2);
      check(s.players[0].stamina >= stamina, 'Fire turbo must not drain stamina');
      s.isPaused = true; step(120); check(s.players[0].onFire, 'Pause must preserve fire'); s.isPaused = false;
      made(s.players[2]); check(!s.players[0].onFire && s.players[0].makeStreak === 0, 'Opposing basket must extinguish fire');
      made(s.players[1]); made(s.players[1]); made(s.players[1]);
      s.resolveShot({shooter:s.players[1], made:false, points:2, kind:'jumper', hoop:s.offenseHoop('player')});
      check(s.players[1].onFire && s.players[1].makeStreak === 0, 'Miss resets activation streak but preserves active fire');
      window.pokeJamShotChance = () => 1;
      setup();
      const handler = s.players[1], support = s.players[0];
      handler.x = 600; handler.y = 286; support.x = 500; support.y = 385;
      s.players[2].x = 650; s.players[2].y = 158;
      s.players[3].x = 650; s.players[3].y = 420;
      s.giveBall(handler);
      const firstTarget = s.offBallTarget(support, handler, s.matchTime);
      check(firstTarget.role === 'space' && Math.hypot(firstTarget.x - 874, firstTarget.y - 286) > 135,
        'Support must seek space instead of camping directly under the rim');
      check(s.offBallTarget(support, handler, s.matchTime + 200) === firstTarget,
        'Support target must persist between evaluations without jitter');
      s.players[2].x = firstTarget.x; s.players[2].y = firstTarget.y;
      const nextTarget = s.offBallTarget(support, handler, s.matchTime + 800);
      check(Math.hypot(nextTarget.x - firstTarget.x, nextTarget.y - firstTarget.y) > 100,
        'Support must relocate when a defender closes its spot');
      support.calling = true;
      const before = Math.hypot(support.x - 874, support.y - 286);
      handler.passCharge = {to:support, startedAt:s.matchTime};
      originalCpu.call(s, support, s.matchTime, 0.1);
      check(Math.hypot(support.x - 874, support.y - 286) < before,
        'Explicit held pass must still bring support toward an alley-oop');
      handler.passCharge = null;
      setup(); s.giveBall(s.players[2]);
      check(s.offBallTarget(s.players[3], s.players[2], s.matchTime).role === 'space',
        'CPU opponent support must also seek space during transition');
      setup(); s.giveBall(s.players[0]);
      s.players[0].x = 600; s.players[0].y = 286; s.players[1].x = 720; s.players[1].y = 350;
      s.players[2].x = 400; s.players[2].y = 100; s.players[3].x = 400; s.players[3].y = 450;
      Math.random = () => 0;
      check(s.offBallTarget(s.players[1], s.players[0], s.matchTime).role === 'cut',
        'An open lane must allow an occasional rim cut');
      s.players[1].offBallPlan = null; Math.random = () => 0.99;
      check(s.offBallTarget(s.players[1], s.players[0], s.matchTime).role === 'space',
        'The same open lane must not force a cut every time');
      Math.random = savedRandom;
      setup(); s.updateCpuMovement = originalCpu;
      delete window.pokeJamShotChance;
      step(1800);
      check(s.players.every(p => Number.isFinite(p.x + p.y + p.z)), 'AI smoke run must preserve valid positions');
    }""")
    page.screenshot(path="/tmp/pokejam-game-desktop.png", full_page=True)
    page.evaluate("""() => {
      setup(); s.players[0].x = 480; s.players[0].y = 286;
      s.recordBucket(s.players[0]); s.recordBucket(s.players[0]); s.recordBucket(s.players[0]);
      s.updateHud(); s.syncPlayerSprites(s.players[0]);
    }""")
    page.screenshot(path="/tmp/pokejam-fire-desktop.png", full_page=True)
    page.evaluate("() => setup()")
    pixels = Image.open(BytesIO(page.locator("#game-root canvas").screenshot())).convert("RGB")
    assert len(pixels.getcolors(pixels.width * pixels.height)) > 100, "Game canvas must be nonblank"
    page.select_option("#match-mode", "coop")
    page.evaluate("""() => {
      step(30); check(s.coop && s.score.player === 0 && s.score.cpu === 0, 'Co-op selector must restart match');
      check(s.controlledPlayer(0) === s.players[0] && s.controlledPlayer(1) === s.players[1], 'Co-op controls must stay with their Pokemon');
    }""")
    page.locator("#pause-match").click()
    page.evaluate("() => check(s.isPaused, 'Pause button must pause')")
    page.locator("#restart-match").click()
    page.evaluate("() => check(!s.isPaused && !s.gameOver && s.clock > 119.8 && s.clock <= 120, 'Restart must reset paused match')")
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path="/tmp/pokejam-game-narrow.png", full_page=True)
    pixels = Image.open(BytesIO(page.locator("#game-root canvas").screenshot())).convert("RGB")
    assert len(pixels.getcolors(pixels.width * pixels.height)) > 100, "Narrow game canvas must be nonblank"
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Game layout must fit narrow viewport"
    page.set_viewport_size({"width": 1280, "height": 900})
    page.goto(BASE + "/compare.html?kind=player&q=lebron-james", wait_until="domcontentloaded")
    page.wait_for_selector("#player-card img.player-photo")
    page.wait_for_function("document.querySelector('#player-card img')?.naturalWidth > 0")
    page.wait_for_function("document.querySelector('#pokemon-card img')?.naturalWidth > 0")
    image = page.locator("#player-card img").get_attribute("src")
    assert image.startswith("assets/players/"), image
    assert "built like" not in page.locator("#trait-matches").inner_text()
    page.screenshot(path="/tmp/pokejam-compare-desktop.png", full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path="/tmp/pokejam-compare-narrow.png", full_page=True)
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Comparison overflows narrow viewport"
    page.goto(BASE + "/compare.html?q=pichu", wait_until="domcontentloaded")
    page.wait_for_function("document.querySelector('#message').textContent.includes('No close NBA')")
    page.wait_for_function("document.querySelector('#pokemon-card img')?.complete && document.querySelector('#pokemon-card img')?.naturalWidth > 0")
    page.wait_for_function("document.querySelector('#player-card img')?.complete && document.querySelector('#player-card img')?.naturalWidth > 0")
    assert "Closest available" in page.locator("#message").inner_text()
    assert "Closest available profile" in page.locator("#player-card").inner_text()
    page.set_viewport_size({"width": 1280, "height": 900})
    page.wait_for_timeout(150)
    page.screenshot(path="/tmp/pokejam-pichu-fit.png", full_page=True)
    page.evaluate("""async () => {
      const {assessProfileMatch, profileResults, topProfileMatches} = await import('./js/match.js');
      const attributes = Array.from({length:10}, (_, i) => 'a' + i);
      const record = (value) => ({level:50, attributes:Object.fromEntries(attributes.map(a => [a, value]))});
      const low = record(20), high = record(70), near = record(25);
      if (topProfileMatches(low, [high], attributes, 10)[0].distance !== 0) throw Error('Centered rank changed');
      if (assessProfileMatch(low, high, attributes).close) throw Error('Same shape with large absolute gap must fail fit');
      if (!assessProfileMatch(low, low, attributes).close) throw Error('Identical profile must pass fit');
      if (!profileResults(low, [high, near], attributes, 10).hasCloseMatch) throw Error('Search entire pool for valid alternatives');
      if (profileResults(low, [high], attributes, 10).hasCloseMatch) throw Error('Far pool must remain closest available');
    }""")
    assert not page.get_by_role("link", name="Verify Matches").count()
    assert not errors, errors
    print("PASS: Q/button switching, pump fake/turbo/hold, fire, HUD, pause, dunk, jumper lock, alley-oops, steals, blocks, two-minute quarters/overtime, off-ball spacing/relocation/cuts, AI smoke, canvas, portraits, match fit and responsive layout.")
    browser.close()
