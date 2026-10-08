"""Full roster setup, stage lifecycle, art pixels and relative visible-body safeguards."""
from io import BytesIO
import json
from pathlib import Path
import sys
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8002"
ROOT = Path(__file__).resolve().parents[1]
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
roster = json.loads((ROOT / "data/playable_roster.json").read_text())["players"]
manifest = json.loads((ROOT / "assets/animations/manifest.json").read_text())["players"]
assert len(roster) == 20 and len({p["slug"] for p in roster}) == 20
for entry in roster:
    for action in entry["visual"].get("animation", {}).get("actions", {}).values():
        assert action in manifest[entry["slug"]]["actions"], (entry["slug"], action)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True)
    page = browser.new_page(viewport={"width":1280,"height":900})
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.goto(BASE + "/play.html?test=1&setup=1", wait_until="domcontentloaded")
    page.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.matchSetup")
    page.evaluate("""() => {
      window.s=pokeJamGame.scene.getScene('MatchScene');s.audio.muted=true;
      window.check=(ok,msg)=>{if(!ok)throw Error(msg);};window.clock=s.clock;
      check(s.setupActive&&s.isPaused&&!s.input.keyboard.enabled,'Initial menu must lock match and keyboard');
    }""")
    assert page.locator("#setup-roster button").count() == 20
    page.locator("#lineup-lead").focus()
    page.evaluate("""() => document.addEventListener('keydown', event => {
      window.menuKey={target:event.target.id,prevented:event.defaultPrevented};
    }, {once:true})""")
    page.keyboard.press("ArrowDown")
    assert page.evaluate("menuKey.target==='lineup-lead'&&!menuKey.prevented"), "Game key capture must not obstruct menu inputs"
    page.select_option("#lineup-lead", "charizard")
    assert page.locator("#lineup-lead").input_value() == "charizard"
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    page.evaluate("() => check(s.clock===clock&&s.setupActive,'Menu cannot start gameplay from Escape')")
    for _ in range(20):
        page.locator("#random-all").click()
        assert page.locator("#choose-stage").is_enabled()
        assert page.evaluate("new Set([...document.querySelectorAll('#lineup-form select')].map(el=>el.value)).size===4")
    page.locator("[aria-label='Random your team']").click()
    page.locator("[aria-label='Random opponents']").click()
    for field, slug in zip(["lead","partner","cpu-lead","cpu-partner"],["venusaur","wartortle","darkrai","garchomp"]):
        page.select_option("#lineup-" + field, slug)
    page.screenshot(path="/tmp/pokejam-20-team-setup.png", full_page=True)
    page.locator("#choose-stage").click()
    assert page.locator("#stage-options input").count() == 4
    page.locator("#setup-back").click()
    assert page.locator("#lineup-lead").input_value() == "venusaur"
    page.locator("#choose-stage").click()
    page.screenshot(path="/tmp/pokejam-stage-select.png", full_page=True)
    page.locator('[name="stage-choice"][value="sinnoh"]').check()
    page.locator("#setup-start").click()
    page.evaluate("""() => {
      check(s.stage.id==='sinnoh'&&s.arena.backdrop.texture.key==='sinnohBackdrop','Start must load selected arena art');
      check(!s.setupActive&&!s.isPaused&&s.input.keyboard.enabled,'Start unlocks gameplay');
      check(s.players.map(p=>p.slug).join()==='venusaur,wartortle,darkrai,garchomp','Chosen opponents and team must be used');
      check(s.ball.holder===s.players[0]&&s.clock>119&&s.shotClock>23,'Start resets possession and clocks');
      check(s.players[0].marker.getBounds().right<s.players[0].name.getBounds().left,'Control tag must sit beside the name, not below it over the teammate');
      s.isPaused=true;s.animator.pause(true);s.updateCpuMovement=()=>{};
      window.stageChildren=s.children.list.length;
      for(let i=0;i<12;i++)s.setStage(['indigo','sinnoh','pwt'][i%3]);
      check(s.children.list.length===stageChildren,'Stage swaps must destroy all prior stage objects');
      window.areas={};
      for(const slug of ['venusaur','wartortle']) {
        const data=s.animator.manifest[slug].actions.Idle, img=s.textures.get(slug+'-Idle').getSourceImage();
        const canvas=document.createElement('canvas');canvas.width=data.width;canvas.height=data.height;
        const g=canvas.getContext('2d');const scale=s.animator.bodyMetrics.get(slug).scale;
        areas[slug]=[];
        for(let dir=0;dir<8;dir++) {
          g.clearRect(0,0,canvas.width,canvas.height);g.drawImage(img,0,dir*data.height,data.width,data.height,0,0,data.width,data.height);
          const pixels=g.getImageData(0,0,canvas.width,canvas.height).data;
          let n=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>8)n++;
          areas[slug].push(n*scale*scale);
        }
      }
      check(areas.venusaur.every((n,i)=>n>areas.wartortle[i]*1.4),'Visible Venusaur body must exceed Wartortle in all eight directions');
      for(const metric of s.animator.bodyMetrics.values())check(metric.target>=45&&metric.target<=112&&metric.scale<=4.5,'Body size guards must be bounded');
    }""")
    previous = None
    for stage in ["indigo","sinnoh","pwt"]:
        page.evaluate("""id=>{s.setStage(id);s.restartMatch();s.isPaused=true;
          for(const p of s.players){p.ultimateCharge=100;s.syncPlayerSprites(p);}s.presentation.update();s.animator.pause(true);}""", stage)
        page.wait_for_timeout(100)
        canvas = page.locator("#game-root canvas")
        art = Image.open(BytesIO(canvas.screenshot())).convert("RGB")
        assert len(art.getcolors(art.width*art.height)) > 1000
        band = art.crop((0, round(art.height*.2), art.width, round(art.height*.33)))
        if previous is not None:
            assert ImageChops.difference(previous,band).getbbox(), "Stage art must be genuinely different"
        previous = band
        page.screenshot(path=f"/tmp/pokejam-stage-{stage}.png", full_page=True)
    page.locator("#choose-lineup").click()
    page.select_option("#setup-mode","coop")
    page.locator("#choose-stage").click()
    page.locator('[name="stage-choice"][value="random"]').check()
    page.locator("#setup-start").click()
    page.evaluate("""() => {
      check(s.coop&&s.humanIndex(s.players[1])===1,'Setup co-op must retain P2');
      const stage=s.stage.id;s.restartMatch();check(s.stage.id===stage,'Rematch preserves arena');
    }""")
    page.locator("#choose-lineup").click()
    page.set_viewport_size({"width":390,"height":844})
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
    page.screenshot(path="/tmp/pokejam-20-setup-narrow.png",full_page=True)
    page.locator("#choose-stage").click()
    page.screenshot(path="/tmp/pokejam-stage-select-narrow.png",full_page=True)
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
    page.locator("#setup-cancel").click()
    assert not errors, errors
    fallback = browser.new_page()
    fallback.on("pageerror",lambda err:errors.append(str(err)))
    fallback.route("**/assets/arenas/sinnoh-backdrop-v1.png",lambda route:route.fulfill(status=404,body="missing"))
    fallback.goto(BASE+"/play.html?test=1",wait_until="domcontentloaded")
    fallback.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.matchSetup")
    fallback.evaluate("""() => {const s=pokeJamGame.scene.getScene('MatchScene');s.setStage('sinnoh');
      if(s.arena.hasBackdrop||s.arena.stageSign.text!=='SINNOH')throw Error('Missing backdrop needs named procedural fallback');}""")
    assert not errors,errors
    browser.close()
print("PASS: full roster menu/random/unique teams, two-step stage selection and back/cancel, solo/co-op lifecycle, three distinct stage assets, stable stage cleanup, eight-direction visible Venusaur size guards, narrow layouts and missing-art fallback.")
