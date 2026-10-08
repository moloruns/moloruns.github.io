"""Phase 2.1 release timing, travel, spectacle, shove and results regression."""
import sys
from io import BytesIO

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8002"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=CHROME, headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + "/play.html?test=1", wait_until="domcontentloaded")
    page.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.presentation")
    page.evaluate("""() => {
      window.s = pokeJamGame.scene.getScene('MatchScene');
      window.check = (ok, message) => { if (!ok) throw Error(message); };
      s.updateCpuMovement = () => {};
      window.step = (n, fps=60) => { for (let i=0;i<n;i++) s.update(0,1000/fps); };
      window.setup = () => {
        s.coop = false; s.restartMatch(); s.players[0].x=500; s.players[0].y=286;
        s.players[2].x=150; s.players[3].x=220;
        window.pokeJamShotChance = () => 1; s.updateBall(0);
        for(const p of s.players) s.syncPlayerSprites(p); s.sortSprites();
      };
      setup(); check(s.arena.hasBackdrop, 'Generated stadium art must load');
      const p = s.players[0]; p.x=650;
      delete window.pokeJamShotChance;
      const good = s.chanceFor(p,'jumper',0,224), bad = s.chanceFor(p,'jumper',0.5,224);
      check(good > bad + 0.15 && good < 1, 'Timing must materially affect likelihood without guaranteed greens');
      window.calls=0;
      window.pokeJamShotChance = context => { calls++; window.shotContext=context; return 0.37; };
      s.startShot(p); s.releaseShot(p,520); s.releaseShot(p,520);
      check(calls===1 && shotContext.releaseQuality===0, 'Hook must receive original signed timing and run exactly once');
      check(p.shotAttempt.grade==='GREEN' && p.shotAttempt.released, 'Exact target must grade green');
      check(s.chanceFor(p,'jumper',0,224)===0.37, 'Default timing bonus must not override custom hook');
      s.presentation.meters(); s.isPaused=true;
      for(const p of s.players) s.syncPlayerSprites(p); s.sortSprites();
    }""")
    meter = page.locator("#shot-meters").bounding_box()
    court = page.locator("#game-root canvas").bounding_box()
    assert meter["y"] >= court["y"] + court["height"] - 1, "Bottom gauge must live entirely below gameplay canvas, not over mons"
    assert page.locator(".shot-slot canvas").first.bounding_box()["width"] >= 320, "Solo timing meter must be materially larger"
    page.evaluate("""() => {
      check(s.presentation.hud.length===4 && !s.hudBg.visible, 'HUD must use four canvas portraits, not a scoreboard box');
      check(s.presentation.hud.every(h => h.portrait.y+h.portrait.displayHeight/2<100 && h.name.y<100), 'Portrait HUD belongs in the roof band, away from floor play');
      check(s.presentation.hud.every(h => h.charge.getBounds().right<=960), 'Charge subscripts must fit in the canvas');
      check(s.arena.stageSign.x>900 && s.arena.stageSign.y>100, 'Stage name should move to a back-corner sign');
    }""")
    page.screenshot(path="/tmp/pokejam-phase21-green.png", full_page=True)
    page.evaluate("() => { setup(); s.startShot(s.players[0]); step(8); s.isPaused=true; s.presentation.meters(); }")
    meter_pixels = Image.open(BytesIO(page.locator(".shot-slot canvas").first.screenshot())).convert("RGB")
    page.evaluate("() => { s.isPaused=false; step(12); s.isPaused=true; s.presentation.meters(); }")
    moving_meter = Image.open(BytesIO(page.locator(".shot-slot canvas").first.screenshot())).convert("RGB")
    assert ImageChops.difference(meter_pixels, moving_meter).getbbox(), "Meter fill and cursor must visibly animate through takeoff"
    page.evaluate("""() => {
      setup(); s.startShot(s.players[0]);
      const selected=s.controlledPlayer(); s.switchControlledPlayer();
      check(s.controlledPlayer()===selected, 'Q must not escape committed unreleased jumper');
      step(24); s.togglePause(); window.frozen=s.matchTime;
      s.onActionUp(0); step(80);
      check(s.matchTime===frozen && s.ball.holder===selected, 'Paused release must queue without advancing time');
      s.togglePause(); check(s.ball.state==='shot' && selected.shotAttempt.released, 'Resume must honor queued release');
      s.switchControlledPlayer(); check(s.controlledPlayer()!==selected, 'Q must work after release');
      for (const fps of [30,60,120]) {
        setup(); const p=s.players[0]; p.ultimateCharge=45; p.onFire=true; p.makeStreak=3;
        s.startShot(p); step(Math.ceil(fps*1.2),fps);
        check(s.possessionTeam==='cpu' && p.stats.shots===0 && p.stats.makes===0, 'Unreleased landing must turn over without recording a shot');
        check(p.ultimateCharge===45 && p.onFire && !s.styleLedger.events.length, 'Travel must preserve charge and timed fire, granting no style');
        check(s.actionNeedsRelease.has(0) && !p.shotAttempt, 'Travel must clear attempt and require fresh press');
        s.onActionUp(0); check(!s.actionNeedsRelease.has(0), 'Keyup must rearm shoot');
      }
      setup(); s.beginShotIntent(s.players[0],0); s.onActionUp(0);
      check(!s.players[0].shotAttempt && s.players[0].z===0 && s.players[0].hasBall, 'Pump fake stays legal and has no timing meter');
      setup(); s.startShot(s.players[0]); step(30); s.cancelAction(s.players[0]); s.setLooseBall(300,300,0,0,0); step(45);
      check(s.messageText.text!=='TRAVEL / UP AND DOWN', 'Lost ball must not produce a later travel');
      setup(); s.clock=0.05; s.startShot(s.players[0]); step(5);
      check(s.quarter===2 && s.players[0].stats.shots===0 && s.score.player===0, 'Unreleased jumper must not score after buzzer');
      setup(); s.presentation.update(0); s.isPaused=true; s.animator.pause(true);
    }""")
    canvas = page.locator("#game-root canvas")
    before = Image.open(BytesIO(canvas.screenshot())).convert("RGB")
    page.evaluate("""() => {
      for(const p of s.players) p.ultimateCharge=100;
      s.updateHud();
      check(s.presentation.hud.every(h=>h.charge.text==='100%' && h.charge.getBounds().right<=960), 'Full-charge canvas subscripts must stay readable and unclipped');
      s.presentation.update(0);
      check(s.players.every(p => s.presentation.aura.get(p).front.commandBuffer.length>0), 'All four mons must have body-level aura graphics');
    }""")
    after = Image.open(BytesIO(canvas.screenshot())).convert("RGB")
    assert ImageChops.difference(before, after).getbbox(), "READY aura pixels must be visible"
    page.screenshot(path="/tmp/pokejam-phase21-ready.png", full_page=True)
    page.evaluate("""() => {
      setup(); const p=s.players[0]; p.ultimateCharge=100; s.startUltimate(p); step(12);
      check(s.presentation.dimmer.alpha>0.3 && p.ultimateCharge===0, 'Special must dim arena and consume charge');
      check(s.presentation.aura.get(p).rear.commandBuffer.length>0, 'Caster charge aura must remain after READY spends');
      s.isPaused=true; s.animator.pause(true); window.dim=s.presentation.dimmer.alpha;
    }""")
    page.screenshot(path="/tmp/pokejam-phase21-ultimate.png", full_page=True)
    dimmed = Image.open(BytesIO(canvas.screenshot())).convert("RGB")
    roof = (0, 0, before.width, int(before.height * 0.13))
    assert sum(ImageStat.Stat(dimmed.crop(roof)).mean) < sum(ImageStat.Stat(before.crop(roof)).mean) * 0.8, "Ultimate overlay must actually darken arena pixels"
    page.wait_for_timeout(150)
    page.evaluate("""() => {
      check(s.presentation.dimmer.alpha===dim, 'Pause must freeze activation scene');
      s.cancelUltimate('blocked'); s.presentation.update(0);
      check(s.presentation.dimmer.alpha===0, 'Interrupted ultimate must restore arena');
      setup(); s.passBall(s.players[0],s.players[1]); step(5);
      check(s.presentation.passTrail.length>=3 && s.presentation.passFx.commandBuffer.length>0, 'Pass must produce bounded wind trail');
      s.togglePause(); window.trail=JSON.stringify(s.presentation.passTrail); step(20);
      check(JSON.stringify(s.presentation.passTrail)===trail, 'Paused pass trail must freeze');
    }""")
    page.screenshot(path="/tmp/pokejam-phase21-pass.png", full_page=True)
    page.evaluate("""() => {
      s.togglePause(); step(30); check(!s.presentation.passTrail.length && s.ball.holder===s.players[1], 'Catch must clear wake and retain existing pass outcome');
      check(s.controlledPlayer()===s.players[1], 'Solo pass catch must automatically select teammate');
      setup(); s.switchControlledPlayer(); s.players[1].callHeld=true; s.players[1].jockeying=true;
      s.giveBall(s.players[0]);
      check(s.controlledPlayer()===s.players[0] && !s.players[1].callHeld && !s.players[1].jockeying, 'Manual Q must not suppress subsequent teammate possession or leak old inputs');
      s.giveBall(s.players[2]); check(s.controlledPlayer().team==='player', 'Opponent possession must never select the opponent');
      setup(); s.coop=true; s.giveBall(s.players[1]);
      check(s.controlledPlayer(0)===s.players[0] && s.controlledPlayer(1)===s.players[1], 'Co-op assignments must stay fixed on catches');
      setup(); s.players[0].x=480; s.players[0].y=286; s.players[0].facing=2;
      s.players[2].x=552; s.players[2].y=306; s.giveBall(s.players[2]);
      const assistedRng=Math.random; Math.random=()=>0.4;
      try { s.tryShove(s.players[0]); s.updateShove(s.players[0],0.09);
        check(s.ball.state==='loose' && s.players[0].shove.hit, 'Moderate RNG and 75-unit contact should now make a valid shove effective');
      } finally { Math.random=assistedRng; }
      setup(); s.players[0].x=480; s.players[0].y=286; s.players[0].facing=2;
      s.players[2].x=420; s.players[2].y=286; s.giveBall(s.players[2]);
      s.tryShove(s.players[0]); s.updateShove(s.players[0],0.09);
      check(!s.players[0].shove.hit && s.ball.holder===s.players[2], 'Aim assistance must not reach behind the defender');
      setup(); const p=s.players[0], target=s.players[2];
      p.x=480; p.y=286; p.facing=2; target.x=530; target.y=286; s.giveBall(target);
      const rng=Math.random; Math.random=()=>0;
      try {
        check(s.tryShove(p) && p.stamina===80, 'Shove must spend stamina once');
        step(6);
        check(s.ball.state==='loose' && target.knockback && target.disabledUntil>s.matchTime, 'Successful shove must dislodge ball and recoil victim');
        check(p.stats.steals===0 && p.ultimateCharge===0 && !s.styleLedger.events.length, 'Shove must not farm steal rewards');
        check(!s.tryShove(p), 'Shove cooldown must prevent repeat');
        s.trySteal(p,target); check(p.stats.steals===0, 'Steal must share defensive cooldown');
        s.tryBlock(target); check(!target.blocking, 'Stunned victim must not bypass recovery with a block');
        step(15); check(!p.shove && !p.shotLocked, 'Shove animation must recover');
      } finally { Math.random=rng; }
      setup(); p.x=480; p.y=286; target.x=530; target.y=286; target.z=100; s.giveBall(target,true);
      Math.random=()=>0; try { s.tryShove(p); step(6); check(s.ball.holder===target, 'Airborne target must be immune'); } finally { Math.random=rng; }
      setup(); p.x=480; p.y=286; target.x=530; target.y=286; s.giveBall(target); target.ultimateCharge=100; s.startUltimate(target);
      Math.random=()=>0; try { s.tryShove(p); step(6); check(s.ultimate?.shooter===target && s.ball.holder===target, 'Active special must be shove-protected'); } finally { Math.random=rng; }
      setup(); p.stamina=19; s.giveBall(target); check(!s.tryShove(p), 'Insufficient stamina must reject shove');
      setup(); s.coop=true; s.presentation.meters(); s.isPaused=true;
    }""")
    assert page.locator(".shot-slot").nth(1).is_visible(), "Co-op needs a separate second meter"
    for index, turbo, button in [(0, "Shift", "i"), (1, "Enter", "l")]:
        page.evaluate("""index => {
          setup(); s.coop=index===1;
          const p=s.controlledPlayer(index), target=s.players[2];
          p.x=480; p.y=286; p.facing=2; target.x=530; target.y=286; s.giveBall(target);
          document.activeElement?.blur();
        }""", index)
        page.keyboard.down(turbo)
        page.keyboard.press(button)
        page.keyboard.up(turbo)
        page.evaluate("index => check(Boolean(s.controlledPlayer(index).shove), 'Turbo + pass must dispatch a real shove for either player')", index)
    page.evaluate("() => { setup(); s.reducedEffects=true; }")
    page.keyboard.press("0")
    page.wait_for_function("s.previewEnd && s.quarter===4")
    page.evaluate("() => { check(s.clock<=1 && s.clock>0,'0 must jump to final second'); step(70); check(s.gameOver && s.resultTitle.includes('DRAW'),'Tied preview must end honestly instead of enter overtime'); }")
    page.screenshot(path="/tmp/pokejam-phase21-results.png", full_page=True)
    assert page.locator("#result-title").evaluate("el => el === document.activeElement"), "Results must receive keyboard focus"
    assert page.locator(".results-actions a").get_attribute("href") == "index.html"
    page.locator("#results-lineup").click()
    assert page.locator("#match-setup").is_visible()
    page.locator("#setup-cancel").click()
    page.wait_for_timeout(50)
    page.evaluate("() => check(s.gameOver,'Cancelling lineup must preserve completed match')")
    page.evaluate("""() => document.querySelector('#rematch').addEventListener('click', () => {
      window.rematchState={clock:s.clock, preview:s.previewEnd, over:s.gameOver};
    }, {once:true})""")
    page.locator("#rematch").click()
    page.evaluate("() => { check(!rematchState.preview && !rematchState.over && rematchState.clock===120,'Rematch must clear preview and reset to exactly two minutes'); s.quarter=4; s.clock=0; s.endQuarter(); check(s.quarter===5 && !s.gameOver,'Real tie must still enter overtime'); }")
    page.locator("#open-settings").click()
    page.locator('[name="meter-mode"][value="bar"]').check()
    page.evaluate("() => check(s.presentation.meterMode==='bar','Meter mode must be functional')")
    page.locator("#arena-settings .close-dialog").click()
    page.wait_for_function("!s.isPaused")
    page.evaluate("() => { setup(); s.presentation.meters(); s.isPaused=true; }")
    page.set_viewport_size({"width":390,"height":844})
    page.wait_for_timeout(200)
    page.screenshot(path="/tmp/pokejam-phase21-narrow.png", full_page=True)
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"), "Meters/results must fit narrow viewport"
    page.set_viewport_size({"width":320,"height":800})
    page.wait_for_timeout(150)
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"), "Timing strip must also fit a 320px viewport"
    fallback=browser.new_page()
    fallback.on("pageerror",lambda error:errors.append(str(error)))
    fallback.route("**/assets/arenas/indigo-backdrop-v1.png",lambda route:route.fulfill(status=404,body="missing"))
    fallback.goto(BASE+"/play.html?test=1",wait_until="domcontentloaded")
    fallback.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.presentation")
    fallback.evaluate("() => { const s=pokeJamGame.scene.getScene('MatchScene'); if(s.arena.hasBackdrop || !s.ball.holder) throw Error('Missing backdrop must fall back to playable procedural arena'); }")
    assert not errors, errors
    print("PASS: larger off-court meters, canvas portrait HUD, solo possession switching/co-op ownership, timing/hook contract, pump fakes, pause releases, Q lock, travel at 30/60/120 fps, body auras, dramatic charge, pass wake, forgiving shove reach/aim with cost/recovery/protection, preview/draw/overtime/results actions, responsive layout and backdrop fallback.")
    browser.close()
