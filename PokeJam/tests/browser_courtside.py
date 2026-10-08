"""Comparison ratings, controls, takeoff scoring, defensive perks and READY art."""
import sys
from io import BytesIO
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8002"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True)
    page = browser.new_page(viewport={"width":1280,"height":900})
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "/compare.html?kind=pokemon&q=pichu", wait_until="domcontentloaded")
    page.wait_for_selector("#pokemon-card .profile-stars")
    page.evaluate("""async () => {
      const {loadGameData}=await import('./js/data.js');const d=await loadGameData();
      const p=d.pokemon.find(p=>p.slug==='pichu');
      if(!document.querySelector('#pokemon-card .profile-stars').getAttribute('aria-label').includes(p.stars.overall))throw Error('Stored overall stars');
      const nba=document.querySelector('#player-card h2').textContent;
      if(Number(document.querySelector('.profile-overall').textContent)!==d.players.find(p=>p.name===nba).overall_2k)throw Error('Real 2K overall');
      if(document.querySelector('a[href="test_match.html"]'))throw Error('Public verification feature remains');
      for(const url of ['test_match.html','js/test_match.js'])if((await fetch(url)).status!==404)throw Error('Verification page must be removed');
    }""")
    page.locator("#pokemon-card summary").click()
    assert page.locator(".profile-star-list .profile-star-row").count() == 11
    assert page.locator(".rating-star > span[style*='50%']").count() > 0
    page.screenshot(path="/tmp/pokejam-comparison-stars.png", full_page=True)
    page.locator("#query").fill("Stephen Curry"); page.locator("button[type=submit]").click()
    page.wait_for_function("document.querySelector('#player-card h2').textContent==='Stephen Curry'")
    assert "built like" not in page.locator("#trait-matches").inner_text()
    assert page.locator("#pokemon-card .profile-stars").count() == 12
    page.set_viewport_size({"width":390,"height":844})
    page.wait_for_function("document.documentElement.scrollWidth<=innerWidth")
    page.wait_for_timeout(150)
    page.screenshot(path="/tmp/pokejam-comparison-narrow.png", full_page=True)
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"), page.evaluate("Array.from(document.querySelectorAll('main *')).filter(e=>e.getBoundingClientRect().right>innerWidth).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,text:e.textContent.slice(0,50)}))")
    page.set_viewport_size({"width":1280,"height":900})
    page.goto(BASE + "/play.html?test=1&help=1", wait_until="domcontentloaded")
    page.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.firePerks")
    page.evaluate("""() => {
      window.s=pokeJamGame.scene.getScene('MatchScene');window.check=(v,msg)=>{if(!v)throw Error(msg);};
      window.step=n=>{for(let i=0;i<n;i++)s.update(0,1000/60);};
      s.updateCpuMovement=()=>{};s.readMovement=()=>{};
      check(s.isPaused&&document.querySelector('#controls-dialog').open,'Main-menu help opens paused');
      const time=s.matchTime;step(90);check(s.matchTime===time,'Manual freezes game');
    }""")
    assert page.locator("#controls-dialog kbd").count() >= 30
    assert page.locator("#controls-dialog kbd svg").count() >= 4
    page.screenshot(path="/tmp/pokejam-controls.png", full_page=True)
    page.get_by_role("button", name="Close How to Play").click()
    page.wait_for_function("!pokeJamGame.scene.getScene('MatchScene').isPaused")
    page.locator("#pause-match").click(); page.locator("#how-to-play").click()
    page.get_by_role("button", name="Close How to Play").click()
    assert page.evaluate("s.isPaused"), "Closing manual must preserve previous pause"
    page.locator("#how-to-play").click()
    page.keyboard.press("Escape")
    page.wait_for_function("!document.querySelector('#controls-dialog').open")
    assert page.evaluate("s.isPaused"), "Escape preserves existing pause"
    page.locator("#how-to-play").click()
    page.set_viewport_size({"width":390,"height":844})
    assert page.evaluate("document.querySelector('#controls-dialog').scrollWidth<=document.querySelector('#controls-dialog').clientWidth")
    page.screenshot(path="/tmp/pokejam-controls-narrow.png", full_page=True)
    page.get_by_role("button", name="Close How to Play").click()
    page.set_viewport_size({"width":1280,"height":900})
    page.evaluate("""() => {
      window.setup=()=>{s.coop=false;s.restartMatch();window.a=s.players[0];window.b=s.players[2];
        for(const p of s.players){p.record=s.recordsBySlug[p.slug];p.x=450;p.y=420;}
        a.x=430;a.y=286;a.facing=2;b.x=490;b.y=286;window.pokeJamShotChance=()=>1;};
      setup();const hoop=s.offenseHoop('player');
      check(s.pointsFrom({x:624,y:286},'player')===2,'Exactly on arc is two');
      check(s.pointsFrom({x:623,y:286},'player')===3,'Just outside arc is three');
      check(s.pointsFrom({x:700,y:420},'player')===3,'Corner arc, not radial distance');
      check(s.pointsFrom({x:700,y:385},'player')===2,'Inside painted ellipse');
      check(s.pointsFrom({x:337,y:286},'cpu')===3&&s.pointsFrom({x:336,y:286},'cpu')===2,'CPU mirror arc');
      const sign=s.arena.stageSignBounds;check(sign.width<140&&Math.abs(sign.x+sign.width/2-892)<1&&sign.y+sign.height<147,'Smaller plaque centered above rear doorway');
      const oldRange=s.dunkRange;s.dunkRange=()=>1200;
      for(const [x,y,points] of [[623,286,3],[624,286,2],[700,420,3],[790,286,2]]){
        setup();a.x=x;a.y=y;s.startDunk(a);check(a.dunk.points===points,'Takeoff determines points');
        step(110);check(s.score.player===points&&a.stats.makes===1,'Normal dunk resolves captured takeoff score');
      }
      setup();s.giveBall(b);b.x=337;b.y=286;s.startDunk(b);step(110);check(s.score.cpu===3,'CPU dunk uses same rule');
      setup();a.x=620;a.y=286;s.startDunk(a,true);step(100);check(s.score.player===3,'Alley finish uses receiver takeoff');
      s.dunkRange=oldRange;
      for(const x of [430,800]){setup();a.x=x;a.ultimateCharge=100;s.startUltimate(a,true);step(180);
        check(s.score.player===(x===430?3:2),'Ultimate dunk retains takeoff points across court');}
      setup();a.record=s.recordsBySlug.charizard;a.onFire=true;s.firePerks.ignite(a);s.giveBall(b);
      a.fireSession.nextCastAt=s.matchTime;check(s.firePerks.cast(a),'Flamethrower must work on defense without ball');
      s.firePerks.update(0.2);check(s.firePerks.status(b,'burn'),'Defensive Flamethrower slows opponent');
      check(!s.players[1].statuses.size,'No friendly fire');
      for(const rng of [0,0.99]){
        setup();s.giveBall(b);const random=Math.random;let calls=0;
        Math.random=()=>calls++===0?0:rng;try{s.tryShove(a);s.updateShove(a,0.09);}finally{Math.random=random;}
        check(Boolean(s.firePerks.status(b,'stun'))===(rng===0),'Shove stun is chance-based after successful contact');
        if(rng===0)check(Math.abs(s.firePerks.status(b,'stun').expiresAt-s.matchTime-3000)<0.001,'Shove uses bounded three-second stun');
      }
      setup();s.players.forEach((p,i)=>{p.ultimateCharge=100;Object.assign(p,[{x:360,y:245},{x:575,y:370},{x:630,y:230},{x:330,y:370}][i]);});
      for(const p of s.players)s.syncPlayerSprites(p);s.updateBall(0);s.presentation.update(0);s.sortSprites();s.isPaused=true;
      check(s.presentation.hud.every(h=>h.auraRear.commandBuffer.length>0),'READY draws aura around every portrait');
    }""")
    canvas=page.locator("#game-root canvas")
    first=Image.open(BytesIO(canvas.screenshot())).convert("RGB")
    page.screenshot(path="/tmp/pokejam-ready-auras.png", full_page=True)
    page.evaluate("() => {s.matchTime+=250;s.presentation.update(0);}")
    animated=Image.open(BytesIO(canvas.screenshot())).convert("RGB")
    assert ImageChops.difference(first,animated).crop((0,0,animated.width,90)).getbbox(), "Portrait aura animates"
    page.evaluate("""() => {
      s.reducedEffects=true;s.presentation.update(0);check(s.presentation.hud.every(h=>h.auraRear.commandBuffer.length>0),'Reduced effects keeps READY aura');
      for(const p of s.players)p.ultimateCharge=0;s.presentation.update(0);
      check(s.presentation.hud.every(h=>!h.auraRear.commandBuffer.length&&!h.auraFront.commandBuffer.length),'Aura clears after charge consumed');
      s.isPaused=false;s.restartMatch();delete window.pokeJamShotChance;
    }""")
    assert not errors, errors
    browser.close()
    print("PASS: actual comparison ratings/stars, removed verification feature, desktop/narrow keycap manual and pause ownership, doorway plaque, normal/CPU/alley/ultimate takeoff scoring, defensive Flamethrower, shove stun probability, animated typed READY auras and cleanup.")
