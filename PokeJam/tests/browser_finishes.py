"""Ultimate finish and reset checks; run like browser_game.py."""
import sys
from io import BytesIO

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright


BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8001"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=CHROME, headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
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
      window.step = frames => { for (let i = 0; i < frames; i++) s.update(0, 1000 / 60); };
      window.check = (ok, message) => { if (!ok) throw Error(message); };
      window.setup = (coop = false) => {
        s.coop = coop;
        for (const p of s.players) p.record = s.recordsBySlug[p.slug];
        s.restartMatch();
      };
      setup();
      s.switchControlledPlayer();
      check(s.controlledPlayer() !== s.ball.holder, 'Fixture must select off-ball mon');
      s.restartMatch();
      check(s.controlledPlayer() === s.ball.holder && s.ball.holder.team === 'player'
        && !s.pendingInbound, 'Restart must immediately give controlled mon the ball');
      s.switchControlledPlayer(); s.inbound('player', ''); step(30);
      check(!s.manualControl && s.controlledPlayer() === s.ball.holder,
        'Friendly inbound must clear manual selection and select ball holder');
      s.inbound('cpu', ''); step(30);
      check(s.ball.holder.team === 'cpu' && s.controlledPlayer().team === 'player',
        'Opponent inbound must not give player opponent possession');
      setup();
    }""")
    page.keyboard.press("e")
    page.evaluate("""() => {
      check(!s.ultimate && s.players[0].ultimateCharge === 0, 'Empty meter cannot activate');
      s.players[0].ultimateCharge = 100; s.switchControlledPlayer();
    }""")
    page.keyboard.press("e")
    page.evaluate("""() => {
      check(!s.ultimate && s.players[0].ultimateCharge === 100, 'Off-ball activation cannot consume charge');
      s.switchControlledPlayer(); s.togglePause();
    }""")
    page.keyboard.press("e")
    page.evaluate("""() => {
      check(!s.ultimate && s.players[0].ultimateCharge === 100, 'Paused activation cannot consume charge');
      s.togglePause(); s.players[0].x = 150; s.players[0].y = 286; s.updateHud();
      check(!s.ultimateButton.disabled && s.players[0].chargeUi.status.textContent === 'READY',
        'Ready meter must enable clickable ultimate');
    }""")
    page.locator("#ultimate-finish").click()
    page.evaluate("""() => {
      check(s.ultimate?.profile.name === 'Volt Tackle' && s.players[0].ultimateCharge === 0,
        'Click must activate named finish and spend meter');
      step(45);
      check(s.ultimate.stage === 'drive' && s.players[0].x > 150 && s.players[0].z > 0,
        'Full-court Volt Tackle must jump and travel');
      s.isPaused = true;
    }""")
    page.screenshot(path="/tmp/pokejam-volt-tackle.png", full_page=True)
    page.evaluate("""() => {
      const elapsed = s.ultimate.elapsed, clock = s.clock; step(100);
      check(s.ultimate.elapsed === elapsed && s.clock === clock, 'Pause must freeze finish and clock');
      s.isPaused = false; step(150);
      check(s.score.player === 3 && s.players[0].stats.shots === 1 && s.players[0].stats.dunks === 1,
        'Ultimate dunk outside the arc must count one three-point basket');
      check(s.players[0].ultimateCharge === 35 && s.finishEvents.length === 1
        && s.finishEvents[0].styleValue === 150 && s.finishEvents[0].points === 3,
        'Made signature must earn charge and one future style event');
      setup(); const p = s.players[2]; p.x = 820; p.y = 286; s.giveBall(p); p.ultimateCharge = 100;
      window.ultimateContext = null;
      window.pokeJamShotChance = context => { ultimateContext = context; return 1; };
      check(s.startUltimate(p), 'Full-court CPU Aura Sphere must activate'); step(62);
      check(s.ball.state === 'shot' && s.ultimate.profile.name === 'Aura Sphere', 'Aura Sphere must launch projectile');
      check(ultimateContext.ultimate && ultimateContext.distanceToHoop > 700,
        'Probability hook must receive ultimate flag and actual distance');
      s.isPaused = true;
    }""")
    page.screenshot(path="/tmp/pokejam-aura-sphere.png", full_page=True)
    page.evaluate("""() => {
      s.isPaused = false; step(130);
      check(s.score.cpu === 3 && s.finishEvents.length === 1 && s.finishEvents[0].kind === 'jumper',
        'Full-court projectile must score one normal three-point basket');
      setup(); s.players[0].record = s.recordsBySlug.venusaur; s.players[0].ultimateCharge = 100;
      window.pokeJamShotChance = () => 1;
      check(PokeJamFinishes.profileFor(s.players[0].record).kind === 'jumper', 'Generic fixture must default to shot');
    }""")
    page.keyboard.down("Shift")
    page.keyboard.press("e")
    page.keyboard.up("Shift")
    page.evaluate("""() => {
      check(s.ultimate.profile.kind === 'dunk' && s.ultimate.profile.type === 'grass'
        && !s.ultimate.profile.signature, 'Turbo ultimate must force typed generic dunk');
      step(160); check(s.score.player === 3 && s.finishEvents[0].styleValue === 100, 'Generic finish must score and record style');
      setup(true); s.giveBall(s.players[1]); s.players[1].ultimateCharge = 100;
    }""")
    page.keyboard.press("o")
    page.evaluate("""() => {
      check(s.ultimate?.shooter === s.players[1] && s.ultimate.profile.name === 'Flare Blitz',
        'P2 O must activate their own charged finish');
      step(150); check(s.score.player === 3, 'Co-op signature must score from outside the arc');
      setup(); const attacker = s.players[2], defender = s.players[0];
      attacker.x = 510; attacker.y = 286; defender.x = 550; defender.y = 286;
      s.giveBall(attacker); s.soloPlayer = defender; attacker.ultimateCharge = 100;
      window.savedRandom = Math.random; Math.random = () => 0;
      s.startUltimate(attacker);
    }""")
    page.keyboard.press("j")
    page.evaluate("""() => {
      step(18);
      check(!s.ultimate && s.finishEvents.length === 1 && s.finishEvents[0].reason === 'blocked'
        && s.finishEvents[0].styleValue === 0 && s.players[0].ultimateCharge === 20,
        'Blocking windup must interrupt, award defender charge and no style');
      step(160); check(s.score.cpu === 0 && s.players[2].ultimateCharge === 0,
        'Blocked ultimate must not produce a ghost score or refund');
      Math.random = savedRandom;
      window.blockFixture = (special = false, gap = 0, flight = false) => {
        setup(); const attacker = s.players[2], defender = s.players[0];
        s.giveBall(attacker); attacker.x = 510; attacker.y = 286;
        if (special) {
          attacker.ultimateCharge = 100; s.startUltimate(attacker);
          if (flight) s.launchUltimateFlight(s.ultimate);
        } else attacker.shooting = true;
        defender.x = 510 + gap; defender.y = 286; defender.z = 40;
        defender.blocking = true; defender.blockAttempted = false;
        s.ball.x = 510; s.ball.y = 286; s.ball.z = 80;
        const base = Math.max(0.25, Math.min(0.9,
          0.55 + (defender.record.attributes.block - attacker.record.attributes.dunk) / 220));
        Math.random = () => base * 0.7;
        return {attacker, defender};
      };
      let fixture = blockFixture(); s.checkBlocks();
      check(fixture.defender.stats.blocks === 1, 'Normal shot must allow baseline block chance');
      fixture = blockFixture(true); s.checkBlocks();
      check(fixture.defender.stats.blocks === 0 && s.ultimate,
        'Same roll must fail to block protected ultimate windup');
      fixture.attacker.shooting = false; fixture.defender.z = 0;
      s.trySteal(fixture.defender, fixture.attacker);
      check(s.ball.holder === fixture.attacker && fixture.defender.stats.steals === 0,
        'Active ultimate must explicitly protect possession against steals');
      fixture = blockFixture(true, 0, true); s.checkBlocks();
      check(fixture.defender.stats.blocks === 0 && s.ball.flight?.ultimate,
        'Reduced block chance must also protect the released ultimate projectile');
      fixture = blockFixture(false, 70); Math.random = () => 0; s.checkBlocks();
      check(fixture.defender.stats.blocks === 1, 'Ordinary shot must retain existing block reach');
      fixture = blockFixture(true, 70); Math.random = () => 0; s.checkBlocks();
      check(fixture.defender.stats.blocks === 0 && !fixture.defender.blockAttempted,
        'Ultimate must require closer horizontal block contact');
      fixture = blockFixture(true); s.ball.z = 155; Math.random = () => 0; s.checkBlocks();
      check(fixture.defender.stats.blocks === 0 && !fixture.defender.blockAttempted,
        'Ultimate must require closer vertical block timing');
      Math.random = savedRandom;
      setup(); s.players[0].ultimateCharge = 100; window.pokeJamShotChance = () => 0;
      s.startUltimate(s.players[0]); step(160);
      check(s.score.player === 0 && s.finishEvents.length === 1 && s.finishEvents[0].reason === 'miss'
        && s.finishEvents[0].styleValue === 0, 'Missed ultimate must respect probability hook and not score');
      setup(); s.players[0].ultimateCharge = 100; s.startUltimate(s.players[0]); step(45);
      s.switchControlledPlayer(); s.togglePause(); s.restartMatch(); step(180);
      check(!s.ultimate && s.finishEvents.length === 0 && s.players.every(p => p.ultimateCharge === 0)
        && s.score.player === 0 && s.controlledPlayer() === s.ball.holder,
        'Restart mid-finish must clear effects, ledger, meters and restore possession');
      setup(); s.players[0].ultimateCharge = 100; s.clock = 0.1; window.pokeJamShotChance = () => 1;
      s.startUltimate(s.players[0]); step(50);
      check(s.quarter === 1 && s.clock === 0, 'Buzzer must wait for already-started ultimate');
      step(130); check(s.quarter === 2 && s.score.player === 3, 'Buzzer finish must count before advancing quarter');
      setup(); s.players[2].ultimateCharge = 100; s.giveBall(s.players[2]);
      s.players[2].nextShotAt = 0; s.updateCpuMovement = originalCpu; step(1);
      check(s.ultimate?.shooter === s.players[2], 'Charged AI must use ultimate');
      s.updateCpuMovement = () => {}; setup(); s.isPaused = true;
      window.renderProfile = profile => PokeJamFinishes.render(s.ultimateEffect, {
        profile, position: {x:480, y:230}, source:{x:200, y:286}, hoop:s.offenseHoop('player'),
        stage:'flight', progress:0.5, time:500, trail:[{x:260,y:270},{x:380,y:250},{x:480,y:230}]
      });
      check(Object.keys(PokeJamFinishes.SIGNATURES).length === 10, 'All ten outlined signatures must exist');
      check(s.records.every(r => PokeJamFinishes.profileFor(r).name), 'Every Pokemon must have a finish');
    }""")
    baseline = Image.open(BytesIO(page.locator("#game-root canvas").screenshot())).convert("RGB")
    profiles = page.evaluate("""() => [
      ...Object.keys(PokeJamFinishes.SIGNATURES).map(slug => PokeJamFinishes.profileFor(s.recordsBySlug[slug])),
      ...Object.keys(PokeJamFinishes.TYPES).map(type => PokeJamFinishes.profileFor({
        slug:'generic', types:[type], attributes:{dunk:50, shooting:80}
      }))
    ]""")
    visual_variants = set()
    for profile in profiles:
        page.evaluate("profile => renderProfile(profile)", profile)
        page.wait_for_timeout(30)
        rendered = Image.open(BytesIO(page.locator("#game-root canvas").screenshot())).convert("RGB")
        assert ImageChops.difference(baseline, rendered).getbbox(), profile["name"] + " effect is blank"
        visual_variants.add(rendered.tobytes())
    assert len(visual_variants) >= 18, "Typed/signature effects must be visually distinct"
    page.evaluate("""() => {
      setup(); s.players[0].ultimateCharge = 100; s.startUltimate(s.players[0]); step(50); s.isPaused = true;
    }""")
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path="/tmp/pokejam-ultimate-narrow.png", full_page=True)
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Ultimate HUD must fit narrow layout"
    assert not errors, errors
    print("PASS: reset ownership, inbound selection, charge gates, earned meters, full-court shot/dunk, signature/generic effects, P2, AI, blocks, misses, pause, buzzer, reset cancellation, style events and nonblank typed effects on desktop/narrow layouts.")
    browser.close()
