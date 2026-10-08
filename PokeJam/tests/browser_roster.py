"""Twenty-mon asset audit, four-slot lineup lifecycle and the first expansion's move packages."""
import json
from io import BytesIO
from pathlib import Path
import sys

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8002"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
NEW = ["wartortle", "venusaur", "gengar", "mewtwo", "gardevoir", "weavile"]
roster = json.loads((ROOT / "data/playable_roster.json").read_text())
manifest = json.loads((ROOT / "assets/animations/manifest.json").read_text())
assert len(roster["players"]) == 20
for entry in roster["players"]:
    slug = entry["slug"]
    assert (ROOT / f"assets/pokemon/{slug}.png").exists()
    assert (ROOT / f"assets/animations/{slug}/credits.txt").read_text().strip()
    actions = manifest["players"][slug]["actions"]
    assert {"Idle", "Walk", "Attack", "Charge", "Hurt"} <= actions.keys()
    if slug in NEW:
        assert "Shoot" in actions
    for action, data in actions.items():
        sheet = Image.open(ROOT / data["path"])
        rows = sheet.height // data["height"]
        assert sheet.width == data["width"] * len(data["durations"]) and sheet.height % data["height"] == 0, (slug, action)
        assert rows == 8 if action in {"Idle", "Walk"} else 1 <= rows <= 8, (slug, action)
        assert all(duration > 0 for duration in data["durations"])
        for direction in range(rows):
            band = sheet.crop((0, direction * data["height"], sheet.width, (direction + 1) * data["height"]))
            assert band.getchannel("A").getbbox(), (slug, action, direction)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + "/play.html?test=1", wait_until="domcontentloaded")
    page.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.firePerks")
    page.evaluate("""() => {
      window.s = pokeJamGame.scene.getScene('MatchScene'); window.f = s.firePerks;
      window.check = (ok, msg) => { if (!ok) throw Error(msg); };
      window.step = n => { for (let i=0;i<n;i++) s.update(0,1000/60); };
      window.cpu = s.updateCpuMovement; s.updateCpuMovement = () => {};
      window.pokeJamShotChance = () => 1;
      check(s.players.length === 4 && PokeJamRoster.players.length === 20, 'Roster expansion must keep 2v2');
      check(!s.setLineup(['gengar','gengar','lucario','snorlax']), 'Reject duplicate lineup');
      check(!s.setLineup(['missing','pikachu','lucario','snorlax']), 'Reject unavailable species');
      for (const entry of PokeJamRoster.players) {
        check(s.recordsBySlug[entry.slug].id === entry.id, 'Roster must use real existing model record');
        for (const direction of [0,1,2,3,4,5,6,7]) check(s.anims.exists(entry.slug+'-Walk-'+direction), 'Eight-direction walk must load');
      }
    }""")
    page.locator("#choose-lineup").click()
    for selector in ["lead", "partner", "cpu-lead", "cpu-partner"]:
        assert page.locator(f"#lineup-{selector} option").count() == 20
    for selector, slug in zip(["lead", "partner", "cpu-lead", "cpu-partner"], NEW[:4]):
        page.select_option(f"#lineup-{selector}", slug)
    assert "Hydro Pump" in page.locator("#lineup-lead-preview").inner_text()
    assert "Psystrike" in page.locator("#lineup-cpu-partner-preview").inner_text()
    page.screenshot(path="/tmp/pokejam-expanded-lineup.png", full_page=True)
    page.locator("#lineup-form button[type=submit]").click()
    page.locator("#setup-start").click()
    page.evaluate("""() => {
      check(s.players.map(p=>p.slug).join() === 'wartortle,venusaur,gengar,mewtwo', 'Both selected teams must be actual court species');
      check(s.ball.holder===s.players[0] && s.controlledPlayer()===s.players[0], 'Lead must start with possession');
      check(s.players[0].name.text==='Wartortle' && s.players[2].name.text==='Gengar', 'World names must follow species');
      s.giveBall(s.players[1]); check(s.controlledPlayer()===s.players[1], 'New species catches must switch solo control');
      s.coop=true;s.restartMatch(); s.giveBall(s.players[1]);
      check(s.humanIndex(s.players[0])===0 && s.humanIndex(s.players[1])===1, 'New species co-op assignments must remain fixed');
      s.coop=false;s.restartMatch();
    }""")
    for slug in NEW:
        page.evaluate("""slug => {
          s.setLineup([slug,'charizard','lucario','snorlax']); const p=s.players[0];
          check(s.ball.holder===p && p.record===s.recordsBySlug[slug], 'Actual model must follow selection');
          p.moving=true; p.facing=6;p.actionVisualUntil=0;s.syncPlayerSprites(p);
          check(p.sprite.anims.currentAnim.key===slug+'-Walk-6', 'Selected species must animate left run');
          p.moving=false;p.actionVisualUntil=0;p.ultimateCharge=100;
          s.updateHud();s.presentation.update();
          check(p.chargeUi.meter.id==='ultimate-'+slug && p.chargeUi.status.textContent==='READY', 'Charge HUD must follow selection');
          const profile=PokeJamFinishes.profileFor(p.record);
          check(s.startUltimate(p), 'Every new mon needs a usable charged finish');step(165);
          check(s.score.player===3 && p.stats.makes===1, 'Outside-arc finish must resolve exactly once');
          check(s.styleLedger.totals.player===(profile.signature?150:100), 'Signature/generic style must match');
          s.restartMatch();p.ultimateCharge=100;check(s.startUltimate(p,true), 'Every mon needs a forced dunk option');step(165);
          check(s.score.player===3,'Forced dunk must work from outside arc');
          s.restartMatch();s.giveBall(s.players[2]);s.players[2].ultimateCharge=100;
          const swap=[s.players[2].slug,s.players[1].slug,p.slug,s.players[3].slug];
          s.setLineup(swap);const enemy=s.players[2];s.giveBall(enemy);enemy.ultimateCharge=100;
          check(s.startUltimate(enemy),'New species must finish on CPU team');step(165);
          check(s.score.cpu===3,'CPU signature must resolve on correct team');
          s.coop=true;s.restartMatch();s.giveBall(s.players[1]);check(s.humanIndex(s.players[1])===1,'P2 must own teammate');
          s.coop=false;s.restartMatch();
        }""", slug)
    page.evaluate("""() => {
      window.perkSetup=slug=>{
        s.setLineup([slug,'charizard','lucario','snorlax']);s.isPaused=false;
        const p=s.players[0], b=s.players[2];p.x=430;p.y=286;p.facing=2;b.x=500;b.y=286;
        s.players[1].x=480;s.players[1].y=286;s.players[3].x=820;
        f.ignite(p);p.fireSession.nextCastAt=s.matchTime;return [p,b,s.players[1]];
      };
      let [p,b,friend]=perkSetup('wartortle');
      check(f.config(p).active.name==='Hydro Pump','Wartortle needs water fallback');
      s.giveBall(friend);check(f.cast(p),'Hydro Pump must work on defense/off ball');step(23);
      check(b.knockback && Math.round(b.knockback.to.x-b.knockback.from.x)===160 && !friend.knockback,'Hydro Pump must push enemy five spots and spare teammate');
      [p,b,friend]=perkSetup('venusaur');check(f.config(p).active.name==='Razor Blade','Venusaur needs grass fallback');
      check(f.cast(p),'Razor Blade must cast');step(23);check(b.knockback && Math.round(Math.hypot(b.knockback.to.x-b.knockback.from.x,b.knockback.to.y-b.knockback.from.y))===128 && !friend.knockback,'Leaf volley must push once, never teammate');
      [p,b,friend]=perkSetup('mewtwo');check(f.config(p).active.name==='Psybeam','Mewtwo needs named perk');
      s.giveBall(friend);check(f.cast(p),'Psybeam must work without the ball');step(23);
      check(f.status(b,'confusion') && !friend.statuses.size,'Psybeam must confuse only opponents');
      [p,b,friend]=perkSetup('gardevoir');check(f.config(p).active.name==='Hypnosis' && f.has(p,'unlimitedPassing'),'Gardevoir needs Hypnosis and Fairy passive');
      s.passBall(p,friend);check(s.ball.flight.uninterceptable,'Gardevoir on-fire passes must be protected');
      s.restartMatch();[p,b,friend]=perkSetup('gardevoir');check(f.cast(p),'Hypnosis must cast');step(23);
      check(f.status(b,'sleep') && !friend.statuses.size,'Hypnosis must cause enemy-only sleep');
      [p,b,friend]=perkSetup('weavile');check(f.config(p).active.name==='Powder Snow' && f.has(p,'suckerPunch'),'Dark/Ice must get one active and its counter passive');
      const rng=Math.random;Math.random=()=>0;try {check(f.cast(p),'Powder Snow must cast');step(15);} finally {Math.random=rng;}
      check(f.status(b,'freeze') && !friend.statuses.size,'Snow must freeze opponent, not teammate');
      [p,b,friend]=perkSetup('gengar');p.ultimateCharge=0;
      check(f.cast(p) && s.ultimate.profile.name==='Shadow Ball','On-fire Gengar needs automatic zero-charge finisher');step(165);
      check(s.score.player===3 && s.styleLedger.totals.player===0,'Free Shadow Ball must score without ultimate style');
      s.setLineup(['mewtwo','gardevoir','gengar','weavile']);p=s.players[0];b=s.players[2];
      f.apply(b,p,'freeze');f.ignite(b);p.ultimateCharge=100;s.score.player=9;
      s.setLineup(['wartortle','venusaur','gengar','mewtwo']);
      check(s.players.every(p=>!p.statuses.size&&!p.onFire&&!p.ultimateCharge&&!p.ultimate),'Lineup change must clear old status/fire/charge');
      check(s.score.player===0 && s.styleLedger.events.length===0 && s.clock===120 && s.shotClock===24,'Lineup change must reset match');
      check(s.ball.holder===s.players[0] && s.players.every(p=>f.ui.has(p) && s.presentation.aura.has(p)),'Effects must retain correct court-slot owners');
      s.updateCpuMovement=cpu;step(360);check(s.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),'New CPU lineup must play without invalid positions');
      s.updateCpuMovement=()=>{};s.restartMatch();s.isPaused=true;
      for(const p of s.players){p.ultimateCharge=100;s.syncPlayerSprites(p);}s.updateHud();s.presentation.update();
    }""")
    page.wait_for_timeout(120)
    canvas = page.locator("#game-root canvas")
    desktop = Image.open(BytesIO(canvas.screenshot())).convert("RGB")
    assert len(desktop.getcolors(desktop.width * desktop.height)) > 1000, "Arena and new characters must render nonblank"
    page.screenshot(path="/tmp/pokejam-expanded-court.png", full_page=True)
    page.evaluate("() => s.setLineup(['mewtwo','gardevoir','gengar','weavile'])")
    page.evaluate("() => {s.isPaused=true;for(const p of s.players){p.ultimateCharge=100;s.syncPlayerSprites(p);}s.presentation.update();}")
    page.evaluate("""() => {
      for(const p of s.players) check(p.sprite.texture.key===p.slug+'-'+p.visualAction,
        'Keeping species in the same slot must restore sheet texture, not magnify static fallback');
    }""")
    page.wait_for_timeout(100)
    other = Image.open(BytesIO(canvas.screenshot())).convert("RGB")
    assert ImageChops.difference(desktop, other).getbbox(), "Changing species must change court pixels"
    page.screenshot(path="/tmp/pokejam-expanded-court-b.png", full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    page.locator("#choose-lineup").click()
    page.screenshot(path="/tmp/pokejam-expanded-narrow.png", full_page=True)
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Lineup must fit narrow width"
    assert page.locator("#match-setup").evaluate("el => el.scrollWidth <= el.clientWidth"), "Lineup preview text must not overflow"
    page.locator("#setup-cancel").click()
    assert not errors, errors
    fallback = browser.new_page()
    fallback.route("**/assets/animations/manifest.json", lambda route: route.fulfill(status=404, body="missing"))
    fallback.goto(BASE + "/play.html?test=1", wait_until="domcontentloaded")
    fallback.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.firePerks")
    fallback.evaluate("""() => {
      const s=pokeJamGame.scene.getScene('MatchScene');s.setLineup(['mewtwo','gardevoir','gengar','weavile']);
      for(const p of s.players) {s.syncPlayerSprites(p);if(p.sprite.texture.key!==p.slug)throw Error('New mon needs static fallback');}
    }""")
    dex = browser.new_page()
    dex.goto(BASE + "/pokedex.html", wait_until="domcontentloaded")
    dex.wait_for_selector("#roster-cards .pokemon-card")
    assert dex.locator("#roster-cards .pokemon-card").count() == 20
    assert "Mewtwo" in dex.locator("#roster-cards").inner_text()
    assert "Darkrai" in dex.locator("#roster-cards").inner_text()
    browser.close()
    print("PASS: twenty-species assets/directions, both lineup teams, first expansion's six ultimates and forced dunks, solo/co-op/CPU control, on-fire attacks and opponent isolation, lifecycle cleanup, canvas pixels, narrow menu, fallback sprites and honest Pokedex roster.")
