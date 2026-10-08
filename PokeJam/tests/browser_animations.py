"""Live directional cycles and event-timed native action frames for all sixteen added mons."""
from io import BytesIO
import json
from pathlib import Path
import sys

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8002"
ROOT = Path(__file__).resolve().parents[1]
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
NEW = ["wartortle", "venusaur", "gengar", "mewtwo", "gardevoir", "weavile",
       "arcanine", "onix", "marowak", "infernape", "luxray", "croagunk",
       "staraptor", "darkrai", "tangrowth", "garchomp"]
roster = json.loads((ROOT / "data/playable_roster.json").read_text())
manifest = json.loads((ROOT / "assets/animations/manifest.json").read_text())["players"]
for entry in roster["players"][4:]:
    for action in entry["visual"]["animation"]["actions"].values():
        assert action in manifest[entry["slug"]]["actions"], (entry["slug"], action)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.goto(BASE + "/play.html?test=1", wait_until="domcontentloaded")
    page.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.firePerks")
    page.evaluate("""() => {
      window.s=pokeJamGame.scene.getScene('MatchScene');s.audio.muted=true;
      s.updateCpuMovement=()=>{};
      window.check=(ok,msg)=>{if(!ok)throw Error(msg);};
      window.step=n=>{for(let i=0;i<n;i++)s.update(0,1000/60);};
      window.setup=slug=>{
        s.coop=false;s.setLineup([slug,'charizard','lucario','snorlax']);s.isPaused=false;
        window.p=s.players[0];p.x=350;p.y=330;p.actionVisualUntil=0;
        s.players[1].x=550;s.players[1].y=400;s.players[2].x=740;s.players[3].x=800;
        s.syncPlayerSprites(p);s.updateBall(0);
      };
      window.poseAt=(cue,ms)=>{s.showAction(p,cue,'Attack',400);s.matchTime+=ms;s.syncPlayerSprites(p);};
    }""")
    for slug in NEW:
        page.evaluate("slug=>setup(slug)", slug)
        page.keyboard.down("d")
        page.wait_for_timeout(230)
        first = page.evaluate("""() => {
          check(p.visualAction==='Walk'&&p.facing===2&&p.x>350,'Live move must walk, face right and translate');
          return p.sprite.frame.name;
        }""")
        page.wait_for_function("first => p.sprite.frame.name !== first", arg=first, timeout=1000)
        normal = page.evaluate("() => p.sprite.anims.timeScale")
        page.keyboard.down("Shift")
        page.wait_for_timeout(120)
        assert page.evaluate("() => p.sprite.anims.timeScale") > normal, f"{slug}: turbo cadence"
        page.keyboard.up("Shift")
        page.keyboard.up("d")
        page.keyboard.down("a")
        page.wait_for_timeout(140)
        page.evaluate("() => check(p.facing===6 && p.sprite.anims.currentAnim.key.endsWith('Walk-6'),'Left direction must use native row')")
        page.keyboard.up("a")
        page.evaluate("""() => {
          s.isPaused=true;s.animator.pause(true);
          const time=s.matchTime,frame=p.sprite.frame.name,x=p.sprite.x,y=p.sprite.y;
          window.paused={time,frame,x,y};
        }""")
        page.wait_for_timeout(100)
        page.evaluate("() => check(s.matchTime===paused.time&&p.sprite.frame.name===paused.frame&&p.sprite.x===paused.x&&p.sprite.y===paused.y,'Pause must freeze frames and secondary motion')")
        page.evaluate("""slug=>{
          setup(slug);s.isPaused=true;p.moving=false;p.actionVisualUntil=0;s.syncPlayerSprites(p);
          const actions=p.visual.animation.actions;
          check(p.visualAction===actions.idle,'Species-specific idle must be selected');
          const stats=JSON.stringify(p.stats),clock=s.clock,charge=p.ultimateCharge,coords=[p.x,p.y,p.z];
          for(const cue of ['pass','catch','steal','perk','celebrate']) {
            s.showAction(p,cue,cue==='catch'?'Charge':'Attack',400);s.syncPlayerSprites(p);
            const start=p.sprite.frame.name;s.matchTime+=220;s.syncPlayerSprites(p);
            check(p.visualAction===actions[cue]&&p.sprite.frame.name!==start,'Native action must change frames: '+cue);
          }
          check(JSON.stringify(p.stats)===stats&&s.clock===clock&&p.ultimateCharge===charge
            &&[p.x,p.y,p.z].every((v,i)=>v===coords[i]),'Visual sequences cannot change stats, clock, charge or collision coordinates');
          s.reducedEffects=true;s.syncPlayerSprites(p);const point=PokeJamArena.project(p.x,p.y,p.z);
          check(p.sprite.x===point.x&&p.sprite.y===point.y&&p.sprite.rotation===0,'Reduced effects removes decorative motion');
          check(p.sprite.scaleX===p.sprite.scaleY,'Reduced effects removes squash/stretch');s.reducedEffects=false;
          s.showAction(p,'perk','Attack',400);s.syncPlayerSprites(p);s.matchTime+=150;s.syncPlayerSprites(p);
          check(p.visualProgress>0.35,'First cast must advance');s.showAction(p,'perk','Attack',400);s.syncPlayerSprites(p);
          check(p.visualProgress===0.12,'Repeated same-key cast must replay from beginning');
          s.isPaused=false;s.firePerks.apply(s.players[2],p,'freeze');s.syncPlayerSprites(p);s.isPaused=true;
          check(p.visualCue==='disabled'&&p.visualProgress===0&&p.sprite.rotation===0,'Freeze must stop action and body motion');
          s.restartMatch();check(p.actionCue==='catch'&&!p.visualWasAirborne,'Reset must replace transient action with opening catch');
        }""", slug)

    # Timed action pixels, not just animation-key metadata, must visibly differ.
    canvas = page.locator("#game-root canvas")
    for slug in NEW:
        page.evaluate("""slug=>{setup(slug);s.isPaused=true;p.actionVisualUntil=0;p.moving=false;
          s.showAction(p,'perk','Attack',400);s.matchTime+=30;s.syncPlayerSprites(p);s.animator.pause(true);}""", slug)
        page.wait_for_timeout(50)
        first = Image.open(BytesIO(canvas.screenshot())).convert("RGB")
        page.evaluate("() => {s.matchTime+=230;s.syncPlayerSprites(p);s.animator.pause(true);}")
        page.wait_for_timeout(50)
        later = Image.open(BytesIO(canvas.screenshot())).convert("RGB")
        point = page.evaluate("() => PokeJamArena.project(p.x,p.y,p.z)")
        factor = first.width / 960
        crop = tuple(round(v * factor) for v in (point["x"] - 95, point["y"] - 90, point["x"] + 95, point["y"] + 75))
        diff = ImageChops.difference(first.crop(crop), later.crop(crop))
        counts = diff.getcolors(diff.width * diff.height)
        assert diff.getbbox() and sum(count for count, pixel in counts if max(pixel) > 30) > 100, f"{slug}: visible action-frame pixel change"
        page.screenshot(path=f"/tmp/pokejam-{slug}-action.png", full_page=True)

    page.evaluate("""() => {
      setup('weavile');s.isPaused=false;s.giveBall(p);p.actionVisualUntil=0;
      s.startShot(p);step(12);check(p.visualCue==='gather','Shot needs gather before release');
      s.releaseShot(p);step(6);check(p.visualCue==='shot'&&p.visualAction==='Shoot','Release needs shoot follow-through');
      setup('wartortle');s.isPaused=false;s.startShot(p);step(75);
      check(s.ball.state==='dead'&&s.possessionTeam==='cpu','Unreleased animated shot must still travel');
      setup('venusaur');s.isPaused=false;const hoop=s.offenseHoop(p.team);p.x=hoop.x-60;p.y=hoop.y;s.startDunk(p);
      step(4);check(p.visualCue==='gather','Dunk needs an initial gather');step(15);
      check(p.visualCue==='dunk'&&p.visualAction==='Strike','Dunk needs species attack extension');
      setup('gardevoir');s.isPaused=false;p.ultimateCharge=100;s.startUltimate(p);step(12);
      check(p.visualCue==='charge','Ultimate needs animated charge');step(31);
      check(p.visualCue==='ultimate'&&p.visualAction==='SpAttack','Moonblast needs special attack frames at release');
      setup('mewtwo');s.isPaused=false;s.firePerks.ignite(p);p.fireSession.nextCastAt=s.matchTime;s.firePerks.cast(p);step(5);
      check(p.visualCue==='perkCharge','Psybeam needs cast anticipation');step(9);
      check(p.visualCue==='perk'&&p.visualAction==='SpAttack','Psybeam needs attack frames at emission');
      setup('gengar');s.isPaused=false;s.giveBall(s.players[2]);p.nextActionAt=0;p.x=s.players[2].x-65;p.y=s.players[2].y;
      s.trySteal(p,s.players[2]);s.syncPlayerSprites(p);check(p.visualCue==='steal'&&p.visualAction==='Lick','Ghost steal needs its native reach rather than recoil');
      setup('gengar');s.isPaused=false;p.shooting=true;
      s.resolveShot({shooter:p,made:true,points:2,kind:'jumper',hoop:s.offenseHoop(p.team),id:'celebrate-live',period:1});
      s.syncPlayerSprites(p);check(p.visualCue==='celebrate'&&p.visualAction==='Twirl','Made-shot celebration must override lingering airborne shooting state');
      s.showAction(p,'ultimate','Attack',450);s.cancelAction(p);s.syncPlayerSprites(p);
      check(p.visualCue!=='ultimate'&&!p.actionCue,'Interrupted move must discard its stale release cue');
      s.coop=true;s.setLineup(['wartortle','weavile','gengar','mewtwo']);s.giveBall(s.players[1]);s.isPaused=false;
      s.players[1].ultimateCharge=100;s.startUltimate(s.players[1],true);step(18);
      check(s.players[1].visualCue==='charge'&&s.humanIndex(s.players[1])===1,'Co-op teammate must animate without changing assignment');
      s.setLineup(['gengar','mewtwo','gardevoir','weavile']);s.isPaused=true;
      for(const p of s.players){p.actionVisualUntil=0;p.ultimateCharge=100;s.syncPlayerSprites(p);}s.updateHud();s.presentation.update();
    }""")
    page.screenshot(path="/tmp/pokejam-animated-lineup-desktop.png", full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path="/tmp/pokejam-animated-lineup-narrow.png", full_page=True)
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
    fallback = browser.new_page()
    fallback.on("pageerror", lambda err: errors.append(str(err)))
    fallback.route("**/assets/animations/mewtwo/SpAttack.png", lambda route: route.fulfill(status=404, body="missing"))
    fallback.goto(BASE + "/play.html?test=1", wait_until="domcontentloaded")
    fallback.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.firePerks")
    fallback.evaluate("""() => {
      const s=pokeJamGame.scene.getScene('MatchScene');s.setLineup(['mewtwo','charizard','lucario','snorlax']);
      const p=s.players[0];s.showAction(p,'perk','Attack',400);s.syncPlayerSprites(p);
      if(p.sprite.texture.key!=='mewtwo'||!p.hasBall)throw Error('Missing native pose must fall back without interrupting gameplay');
    }""")
    assert not errors, errors
    browser.close()
    print("PASS: all sixteen added species' live directional run/turbo cycles; event-timed pass/catch/reach/cast/celebration frames and visible pixels; shot/dunk/ultimate sequences; pause, reduced effects, freeze, same-action replay, physics isolation, reset, co-op, viewport fit and missing-pose fallback.")
