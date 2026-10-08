"""Possession-clock rules, fighting-game gauge, animated HUD and stage-sign checks."""
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
      window.s=pokeJamGame.scene.getScene('MatchScene'); s.updateCpuMovement=()=>{};
      window.check=(ok,message)=>{if(!ok)throw Error(message);};
      window.step=(n,fps=60)=>{for(let i=0;i<n;i++)s.update(0,1000/fps);};
      window.setup=()=>{s.coop=false;s.restartMatch();s.players[0].x=460;s.players[0].y=286;};
      setup(); check(s.shotClock===24,'New match starts at 24');
      step(600); check(s.shotClock>13.8&&s.shotClock<14.1&&s.ball.holder===s.players[0], 'Ten backcourt seconds are legal; no eight-second rule');
      const left=s.shotClock; s.passBall(s.players[0],s.players[1]); step(24);
      check(s.ball.holder===s.players[1]&&s.shotClock<left&&s.shotClock>left-0.5, 'Same-team pass/catch must not reset clock');
      s.setLooseBall(460,286,0,0,0); const looseLeft=s.shotClock;s.updateShotClock(0.2);
      check(s.shotClock<looseLeft,'Loose ball without rim contact keeps ticking');
      s.giveBall(s.players[2]);check(s.shotClock===24,'Opponent possession resets to 24');
      s.giveBall(s.players[0]);check(s.shotClock===24,'Friendly steal/recovery starts new possession');
      s.inbound('cpu',''); const frozen=s.shotClock;step(10);check(s.shotClock===frozen,'Dead inbound must freeze shot clock');
      step(20);check(s.shotClock>23.8&&s.ball.holder.team==='cpu','Inbound starts a full possession clock');
      setup();s.togglePause();const paused=s.shotClock;step(240);check(s.shotClock===paused,'Pause freezes possession clock');s.togglePause();
      for(const fps of [30,60,120]){
        setup();s.shotClock=0.12;step(Math.ceil(fps*0.2),fps);
        check(s.possessionTeam==='cpu'&&s.pendingInbound&&s.messageText.text==='SHOT CLOCK VIOLATION','Clock expiry must cause one opposing inbound');
        check(s.players[0].stats.shots===0&&s.styleLedger.events.length===0,'Violation must not grant shot/style stats');
        check(!s.actionNeedsRelease.has(0),'Idle violation must not swallow the next defensive action');
      }
      setup();s.shotClock=0.2;s.startShot(s.players[0]);step(16);
      check(s.possessionTeam==='cpu'&&!s.players[0].shotAttempt,'Unreleased takeoff cannot evade possession expiry');
      check(s.actionNeedsRelease.has(0),'Held shot through expiry requires a fresh button press');
      setup();s.shotClock=0.02;window.pokeJamShotChance=()=>1;
      s.startShot(s.players[0]);s.releaseShot(s.players[0],520);step(60);
      check(s.score.player===3&&s.possessionTeam==='cpu','Shot released before zero can score after zero');
      setup();s.giveBall(s.players[2]);s.players[2].x=500;s.players[2].y=286;s.shotClock=0.01;
      s.startShot(s.players[2]);s.releaseShot(s.players[2],520);step(1);s.onActionDown(0);
      check(s.shotClock===0&&s.controlledPlayer().blocking,'Defenders may still block a legal shot in flight after possession buzzer');
      setup();window.pokeJamShotChance=()=>0;s.shotClock=0.02;
      s.startShot(s.players[0]);s.releaseShot(s.players[0],520);
      s.players[1].x=150;s.players[2].x=150;s.players[3].x=150;step(50);
      check(s.shotClockRimTeam==='player'&&s.shotClock===0,'Rim miss waits for rebound rather than violating');
      s.giveBall(s.players[1]);check(s.shotClock===14&&!s.shotClockRimTeam,'Offensive rim rebound resets to 14');
      s.shotClockRimTeam='player';s.giveBall(s.players[2]);check(s.shotClock===24,'Defensive rim rebound gets 24');
      setup();s.shotClock=0.1;s.players[0].ultimateCharge=100;s.startUltimate(s.players[0]);step(8);
      check(!s.ultimate&&s.possessionTeam==='cpu'&&s.players[0].stats.shots===0,'Unreleased ultimate does not pause clock or count a shot');
      setup();s.clock=0.01;s.shotClock=0.01;step(1);
      check(s.quarter===2&&s.messageText.text!=='SHOT CLOCK VIOLATION','Period buzzer takes priority');
      setup();step(350);check(document.querySelector('#shot-clock-value').textContent===String(Math.ceil(s.shotClock)),'Scoreboard mini timer must show live remaining time');
      s.shotClock=3.5;s.updateHud();check(document.querySelector('#shot-clock').classList.contains('urgent'),'Final seconds need a visible warning');
      setup();s.players[0].ultimateCharge=100;s.presentation.playerHud();
      check(s.presentation.meterMode==='gauge'&&document.querySelector('[value="gauge"]').checked,'New fighting-game gauge is default');
      check(s.presentation.hud[0].portrait.texture.key==='pikachu-Charge','HUD uses real action-sheet frames');
      s.isPaused=true;s.animator.pause(true);
    }""")
    frame = page.locator("#game-root canvas")
    before = Image.open(BytesIO(frame.screenshot())).convert("RGB")
    page.evaluate("() => {s.matchTime+=260;s.presentation.playerHud();}")
    after = Image.open(BytesIO(frame.screenshot())).convert("RGB")
    roof = (0, 0, before.width, int(before.height*0.19))
    assert ImageChops.difference(before.crop(roof), after.crop(roof)).getbbox(), "Animated icon pixels must visibly change"
    page.screenshot(path="/tmp/pokejam-gauge-desktop.png", full_page=True)
    court = frame.bounding_box()
    meter = page.locator("#shot-meters").bounding_box()
    assert meter["y"] >= court["y"]+court["height"]-1, "Gauge band must not cover sprites"
    page.evaluate("() => {s.coop=true;s.presentation.meters();s.reducedEffects=true;s.presentation.playerHud();window.hudFrame=s.presentation.hud[0].portrait.frame.name;}")
    page.evaluate("() => {s.matchTime+=260;s.presentation.playerHud();check(s.presentation.hud[0].portrait.frame.name===hudFrame,'Reduced effects freezes decorative icon animation');}")
    assert page.locator(".shot-slot").nth(1).is_visible()
    page.screenshot(path="/tmp/pokejam-gauge-coop.png", full_page=True)
    page.set_viewport_size({"width":390,"height":844});page.wait_for_timeout(200)
    page.screenshot(path="/tmp/pokejam-gauge-narrow.png", full_page=True)
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"), "Narrow HUD must not overflow"
    assert not errors, errors
    browser.close()
    print("PASS: 24-second possession clock, no eight-second rule, pass/loose-ball/pause continuity, violations, legal released shots, rim rebounds, ultimate/period priority, bottom gauge, animated icons, reduced effects and responsive layout.")
