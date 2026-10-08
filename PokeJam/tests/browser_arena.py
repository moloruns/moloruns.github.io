"""Indigo Arena presentation, assets, style ledger, settings and lineup regression."""
import sys
from io import BytesIO

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright


BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8002"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=CHROME, headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + "/play.html?test=1", wait_until="domcontentloaded")
    page.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.audio")
    page.evaluate("""() => {
      window.s = pokeJamGame.scene.getScene('MatchScene');
      window.originalCpu = s.updateCpuMovement; s.updateCpuMovement = () => {};
      window.check = (ok, message) => { if (!ok) throw Error(message); };
      window.step = frames => { for (let i = 0; i < frames; i++) s.update(0, 1000 / 60); };
      window.pokeJamShotChance = () => 1;
      s.restartMatch();
      check(s.clock === 120, 'Arena must keep two-minute quarters');
      check(s.players.every(p => p.sprite.anims && s.animator.manifest[p.slug].actions.Walk), 'All four mons need real movement sheets');
      const left = s.arena.hoops[0], right = s.arena.hoops[1];
      for (const item of [left, right]) {
        const target = PokeJamArena.project(item.hoop.x - item.hoop.side * 6, item.hoop.y, 112);
        check(item.rim.x === target.x && item.rim.y === target.y, 'Visible rims must align to shot coordinates');
      }
      check(PokeJamArena.project(48, 98).x > PokeJamArena.project(48, 484).x, 'Court must visibly widen toward the viewer');
    }""")
    page.screenshot(path="/tmp/pokejam-indigo-desktop.png", full_page=True)
    court = page.locator("#game-root canvas").bounding_box()
    assert court["y"] + court["height"] <= 900, "Entire court and canvas portrait HUD must fit the desktop viewport"
    page.keyboard.down("d")
    page.wait_for_timeout(200)
    page.evaluate("""() => {
      check(s.players[0].visualAction === 'Walk' && s.players[0].facing === 2, 'Right movement must animate right-facing run');
      window.runFrame = s.players[0].sprite.frame.name;
    }""")
    page.wait_for_timeout(160)
    page.evaluate("() => check(s.players[0].sprite.frame.name !== runFrame, 'Run frames must advance')")
    page.keyboard.up("d")
    page.keyboard.down("a")
    page.wait_for_timeout(150)
    page.evaluate("() => check(s.players[0].facing === 6, 'Left movement must use left-facing sheet row')")
    page.keyboard.up("a")
    page.locator("#pause-match").click()
    page.evaluate("() => { window.pausedFrame = s.players[0].sprite.frame.name; window.pausedTime = s.matchTime; }")
    page.wait_for_timeout(250)
    page.evaluate("() => check(s.matchTime === pausedTime && s.players[0].sprite.frame.name === pausedFrame, 'Pause must freeze match and animation')")
    page.locator("#pause-match").click()
    page.evaluate("""() => {
      s.restartMatch(); const p = s.players[0]; window.readyBefore = s.audio.readySounds;
      p.ultimateCharge = 100; s.updateHud();
      check(s.audio.readySounds === readyBefore + 1 && p.chargeUi.status.textContent === 'READY', 'Charge crossing must announce READY once');
      s.updateHud(); s.switchControlledPlayer(); s.updateHud(); s.giveBall(p); s.updateHud();
      check(s.audio.readySounds === readyBefore + 1, 'Switching/catching must not repeat ready cue');
      check(p.chargeUi.label.classList.contains('ready'), 'Readiness must remain on the charged owner');
      s.switchControlledPlayer(); s.startUltimate(p); step(165);
      check(s.score.player === 3 && s.styleLedger.totals.player === 150, 'Outside-arc ultimate must award three points plus 150 style only');
      check(s.styleLedger.events.length === 1, 'Signature must not also get generic/dunk reward');
      s.restartMatch();
      const made = {shooter:s.players[0], made:true, kind:'dunk', points:2, hoop:s.offenseHoop('player'), id:'one-dunk', period:1};
      s.resolveShot(made); s.resolveShot(made);
      check(s.score.player === 2 && s.styleLedger.totals.player === 75 && s.players[0].stats.makes === 1, 'Repeated resolution must not duplicate basket or style');
      check(s.styleLedger.award('one-dunk:finish', s.players[0], 'DUNK', 75) === null, 'Ledger must reject replayed award ID');
      check(s.ball.scoreDrop.z === 112, 'Dunk must drop visibly through the actual rim');
      s.ball.state = 'shot'; s.ball.z = 84;
      s.ball.flight = {kind:'dunk', to:{z:84}, elapsed:1, duration:1};
      check(s.ballDisplayPosition().z === 112 && s.ball.z === 84, 'Dunk art must reach rim without changing simulation height');
      s.restartMatch();
      s.resolveShot({shooter:s.players[1], made:true, kind:'dunk', points:2, hoop:s.offenseHoop('player'), alley:true,
        assist:s.players[0], id:'oop', period:1});
      check(s.styleLedger.totals.player === 125 && s.players[0].stats.assists === 1, 'Alley-oop must replace base dunk style and credit assist');
      s.restartMatch(); s.clock = 0;
      s.resolveShot({shooter:s.players[0], made:true, kind:'jumper', points:3, hoop:s.offenseHoop('player'),
        fakeBite:true, id:'fake-buzzer', period:1});
      check(s.score.player === 3 && s.styleLedger.totals.player === 75, 'Context rewards must stay separate from basketball score');
      s.restartMatch();
      s.resolveShot({shooter:s.players[0], made:false, kind:'dunk', points:2, hoop:s.offenseHoop('player'), id:'miss'});
      check(s.styleLedger.totals.player === 0 && s.styleLedger.events.length === 0, 'Miss must award no finish style');
      s.restartMatch();
      const p2 = s.players[0]; p2.ultimateCharge = 100; s.startUltimate(p2); step(55); s.togglePause();
      window.specialStage = s.ultimate.stage; window.specialElapsed = s.ultimate.elapsed;
    }""")
    page.screenshot(path="/tmp/pokejam-indigo-ultimate.png", full_page=True)
    page.wait_for_timeout(150)
    page.evaluate("() => check(s.ultimate.stage === specialStage && s.ultimate.elapsed === specialElapsed, 'Pause must retain finish state')")
    page.locator("#restart-match").click()
    page.evaluate("() => check(!s.ultimate && !s.styleLedger.events.length && !s.stylePopups.length && s.controlledPlayer() === s.ball.holder, 'Restart must clear presentation and select ball owner')")
    page.locator("#open-settings").click()
    page.evaluate("() => check(s.isPaused && document.querySelector('#arena-settings').open, 'Settings must pause live match')")
    page.locator("#reduced-effects").check()
    page.locator("#sfx-volume").fill("0")
    page.locator("#arena-settings .close-dialog").click()
    page.wait_for_function("!s.isPaused")
    page.evaluate("() => check(!s.isPaused && s.reducedEffects && s.audio.volumes.sfx === 0, 'Settings must apply and restore prior pause state')")
    page.locator("#audio-toggle").click()
    page.evaluate("() => check(s.audio.muted && document.querySelector('#audio-toggle').getAttribute('aria-pressed') === 'true', 'Mute must be functional')")
    page.locator("#audio-toggle").click()
    page.evaluate("() => check(!s.audio.muted, 'Unmute must be functional')")
    page.evaluate("""() => {
      check(s.audio.context.state === 'running', 'Real clicks must unlock arena audio');
      const bed = s.audio.bedSource; s.restartMatch(); s.audio.update();
      check(bed && s.audio.bedSource === bed, 'Restart must not stack crowd loops');
    }""")
    page.locator("#choose-lineup").click()
    page.select_option("#lineup-lead", "snorlax")
    page.select_option("#lineup-partner", "snorlax")
    assert page.locator("#lineup-form button[type=submit]").is_disabled(), "Duplicate mons must be rejected"
    page.select_option("#lineup-partner", "lucario")
    page.locator("#lineup-form button[type=submit]").click()
    page.locator("#setup-start").click()
    page.evaluate("""() => {
      check(s.players[0].slug === 'snorlax' && s.players[1].slug === 'lucario', 'Lineup must change actual controlled team');
      check(s.players[2].team === 'cpu' && s.players[3].team === 'cpu', 'Unselected mons must become opponents');
      check(s.ball.holder === s.players[0] && s.controlledPlayer() === s.players[0], 'New lineup must start with controlled ball owner');
      check(s.players[0].x === 250 && s.players[2].x === 704, 'Spawn locations must follow team slot, not species');
      check(document.querySelectorAll('.ultimate-meter')[0].textContent.includes('Snorlax'), 'HUD must follow reordered lineup');
      s.quarter = 4; s.clock = 0; s.score.player = 4; s.endQuarter();
      check(s.gameOver && !document.querySelector('#match-results').hidden, 'End of match must show results');
      check(document.querySelectorAll('#result-rows tr').length === 4 && !document.querySelector('#result-rows').textContent.includes('NaN'), 'Results must show all four players with safe percentages');
    }""")
    page.screenshot(path="/tmp/pokejam-indigo-results.png", full_page=True)
    page.locator("#rematch").click()
    page.evaluate("() => check(!s.gameOver && document.querySelector('#match-results').hidden && s.score.player === 0, 'Rematch must work')")
    page.evaluate("""() => {
      s.restartMatch(); s.audio.muted = true; s.isPaused = true;
      window.oldProjection = PokeJamArena.project(s.ball.x, s.ball.y, s.ball.z);
      s.updateBall(0);
      check(Math.abs(s.ball.sprite.x - oldProjection.x) < 0.01 && Math.abs(s.ball.sprite.y - oldProjection.y) < 0.01,
        'Ball and court must share projection');
    }""")
    canvas = page.locator("#game-root canvas")
    first = Image.open(BytesIO(canvas.screenshot())).convert("RGB")
    page.evaluate("() => { s.arena.react('ultimate', 'player'); s.arena.update(s.matchTime + 280); }")
    second = Image.open(BytesIO(canvas.screenshot())).convert("RGB")
    assert ImageChops.difference(first, second).getbbox(), "Crowd must react visibly"
    assert len(second.getcolors(second.width * second.height)) > 100, "Arena canvas must contain nonblank assets"
    timing = page.evaluate("""async () => {
      s.restartMatch(); s.players[0].ultimateCharge = 100; s.startUltimate(s.players[0]);
      const frames = []; let previous = null;
      await new Promise(resolve => {
        const sample = time => {
          if (previous !== null) frames.push(time - previous);
          previous = time;
          if (frames.length === 100) resolve(); else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      frames.sort((a, b) => a - b); s.restartMatch();
      return {median_ms: frames[50], p95_ms: frames[95], max_ms: frames[99]};
    }""")
    print("Chrome headless frame intervals during a signature finish:", timing)
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path="/tmp/pokejam-indigo-narrow.png", full_page=True)
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Arena controls/HUD must fit narrow layout"
    fallback = browser.new_page(viewport={"width": 1280, "height": 900})
    fallback.on("pageerror", lambda error: errors.append(str(error)))
    fallback.route("**/assets/animations/manifest.json", lambda route: route.fulfill(status=404, body="missing"))
    fallback.goto(BASE + "/play.html?test=1", wait_until="domcontentloaded")
    fallback.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.audio")
    fallback.evaluate("""() => {
      const s = pokeJamGame.scene.getScene('MatchScene');
      if (s.players[0].sprite.texture.key !== 'pikachu' || !s.ball.holder) throw Error('Missing manifest must fall back to playable static art');
    }""")
    missing_sheet = browser.new_page(viewport={"width": 1280, "height": 900})
    missing_sheet.on("pageerror", lambda error: errors.append(str(error)))
    missing_sheet.route("**/assets/animations/pikachu/Walk.png", lambda route: route.fulfill(status=404, body="missing"))
    missing_sheet.goto(BASE + "/play.html?test=1", wait_until="domcontentloaded")
    missing_sheet.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.audio")
    missing_sheet.evaluate("""() => {
      const s = pokeJamGame.scene.getScene('MatchScene'), p = s.players[0];
      p.moving = true; p.actionVisualUntil = 0; s.syncPlayerSprites(p);
      if (p.sprite.texture.key !== 'pikachu' || !s.ball.holder) throw Error('Missing individual sheet must use static art and retain playable possession');
    }""")
    assert not errors, errors
    print("PASS: Indigo projection/hoops, loaded directional animation, pause, readiness ownership/one-shot cues, style deduplication/categories/bonuses, assists, settings, audio, lineup/spawns, results/rematch, crowd pixels, responsive layout and missing-asset fallback.")
    browser.close()
