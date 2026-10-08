"""Contact root-motion, Darkrai visibility and clipped high-resolution meter regressions."""
from io import BytesIO
import sys

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright


BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8003"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900}, device_scale_factor=2)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + "/play.html?test=1", wait_until="domcontentloaded")
    page.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.presentation")
    page.evaluate("""() => {
      window.s=pokeJamGame.scene.getScene('MatchScene');s.audio.muted=true;s.isPaused=true;
      window.check=(ok,msg)=>{if(!ok)throw Error(msg);};
      s.setLineup(['arcanine','pikachu','darkrai','lucario']);s.isPaused=true;
      const a=s.players[0],d=s.players[2];
      for(const p of [a,d]) for(let direction=0;direction<8;direction++) {
        p.x=400;p.y=320;p.facing=direction;p.moving=false;
        const position=[p.x,p.y,p.z],point=PokeJamArena.project(p.x,p.y,p.z);
        for(const cue of ['shove','steal']) {
          s.showAction(p,cue,'Attack',360);
          for(let i=0;i<10;i++) {
            s.matchTime=p.actionVisualStartedAt+i*35;s.syncPlayerSprites(p);
            const frame=p.sprite.frame,key=p.sprite.texture.key+':'+frame.name;
            const anchor=s.animator.frameAnchors.get(key);
            check(anchor&&p.sprite.originX===anchor[0]&&p.sprite.originY===anchor[1],'Contact must remove source root-motion');
            check(Math.abs(p.sprite.x-point.x)<=4&&Math.abs(p.sprite.y-point.y)<=4,'Contact cannot visually teleport the body');
            check(p.sprite.visible&&p.sprite.alpha===1,'No contact flicker');
          }
        }
        check([p.x,p.y,p.z].every((v,i)=>v===position[i]),'Contact animation cannot move physics');
      }
      check(a.visual.animation.actions.shove==='Charge','Arcanine must use a restrained brace, not a pounce');
      d.actionVisualUntil=0;d.shove=null;d.moving=false;
      for(let direction=0;direction<8;direction++) for(let i=0;i<8;i++) {
        d.facing=direction;s.matchTime+=55;s.syncPlayerSprites(d);
        check(d.visualAction==='Idle'&&d.sprite.texture.key==='darkrai-Idle','Darkrai must keep an upright idle');
        check(d.sprite.visible&&d.sprite.alpha===1&&d.sprite.frame.cutHeight>0,'Darkrai must remain visible');
      }
      s.isPaused=false;s.restartMatch();s.updateCpuMovement=()=>{};
      a.x=400;a.y=320;a.facing=2;d.x=460;d.y=320;s.giveBall(d);
      check(s.tryShove(a),'Real shove must start');
      check(a.shove.duration===0.28&&a.actionVisualDuration===360,'Physics timing stays unchanged; visual recovery is gentler');
      const start=a.actionVisualStartedAt;
      s.matchTime=start+270;a.shove.elapsed=0.27;s.syncPlayerSprites(a);const before=a.visualProgress;
      s.matchTime=start+290;s.updateShove(a,0.02);s.syncPlayerSprites(a);
      check(!a.shove&&a.visualCue==='shove'&&a.visualProgress>before,'Shove recovery must not rewind or replay its animation');
      s.restartMatch();s.isPaused=true;window.p=s.controlledPlayer();
      p.x=400;p.y=320;s.startShot(p);s.matchTime=p.shotAttempt.startedAt+350;
      s.presentation.meters();
      check(s.presentation.slots[0].canvas.width===800,'Meter must render at double resolution');
      const context=s.presentation.slots[0].canvas.getContext('2d');
      for(const [x,y] of [[0,32],[399,32],[10,20],[390,20],[5,48],[395,48]])
        check(context.getImageData(x*2,y*2,1,1).data[3]===0,'Beveled housing must have clean transparent corners');
    }""")
    meter = page.locator(".shot-slot canvas").first
    first = Image.open(BytesIO(meter.screenshot())).convert("RGB")
    meter.screenshot(path="/tmp/pokejam-polished-gauge.png")
    page.evaluate("() => {s.matchTime+=160;s.presentation.meters();}")
    later = Image.open(BytesIO(meter.screenshot())).convert("RGB")
    assert ImageChops.difference(first, later).getbbox(), "Gauge must visibly advance"
    band = page.locator("#shot-meters").bounding_box()
    court = page.locator("#game-root canvas").bounding_box()
    assert band["y"] >= court["y"] + court["height"] - 1, "Gauge stays clear of every mon"
    page.screenshot(path="/tmp/pokejam-polished-desktop.png", full_page=True)
    page.set_viewport_size({"width": 720, "height": 900})
    page.wait_for_timeout(100)
    page.evaluate("() => {s.coop=true;s.presentation.meters();}")
    assert page.evaluate("document.documentElement.scrollWidth<=window.innerWidth"), "Narrow desktop must not overflow"
    page.screenshot(path="/tmp/pokejam-polished-narrow.png", full_page=True)
    assert not errors, errors
    browser.close()
print("PASS: anchored eight-direction contact frames, upright visible Darkrai, unchanged shove physics, continuous recovery, crisp clipped meter, animated fill and desktop layout.")
