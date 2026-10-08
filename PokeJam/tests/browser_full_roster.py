"""All twenty court/HUD animation pixels, new signature finishes and perk assignments."""
from io import BytesIO
import json
from pathlib import Path
import sys
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = sys.argv[1] if len(sys.argv)>1 else "http://127.0.0.1:8002"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
entries = json.loads((ROOT/"data/playable_roster.json").read_text())["players"]
expected = {"arcanine":"Flame Burst","onix":"Bulldoze","marowak":"Bulldoze",
            "infernape":"Flame Burst","luxray":"Discharge","croagunk":"Toxic",
            "staraptor":"Take Down","darkrai":"Sucker Punch","tangrowth":"Razor Blade","garchomp":"Dragon Rush"}
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=CHROME,headless=True)
    page=browser.new_page(viewport={"width":1280,"height":900})
    errors=[]
    page.on("pageerror",lambda err:errors.append(str(err)))
    page.goto(BASE+"/play.html?test=1",wait_until="domcontentloaded")
    page.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.matchSetup")
    page.evaluate("""() => {
      window.s=pokeJamGame.scene.getScene('MatchScene');s.audio.muted=true;
      s.updateCpuMovement=()=>{};window.pokeJamShotChance=()=>1;
      window.check=(ok,msg)=>{if(!ok)throw Error(msg);};
      window.step=n=>{for(let i=0;i<n;i++)s.update(0,1000/60);};
      window.setup=slug=>{
        const others=PokeJamRoster.players.filter(p=>p.slug!==slug).slice(0,3).map(p=>p.slug);
        s.coop=false;s.setLineup([slug,...others]);s.isPaused=true;
        window.p=s.players[0];p.x=350;p.y=330;p.actionVisualUntil=0;
        s.players.slice(1).forEach((p,i)=>{p.x=680+i*60;p.y=430;});
        s.syncPlayerSprites(p);s.updateBall(0);s.presentation.update();
      };
    }""")
    canvas=page.locator("#game-root canvas")
    for entry in entries:
        slug=entry["slug"]
        page.evaluate("slug=>setup(slug)",slug)
        page.evaluate("""() => {
          s.matchTime=0;p.moving=true;p.facing=2;s.syncPlayerSprites(p);s.presentation.update();
          window.beforeFrame=p.sprite.frame.name;
          p.sprite.anims.pause();p.sprite.setFrame(2*s.animator.manifest[p.slug].actions.Walk.durations.length);
          check(p.sprite.texture.key===p.slug+'-Walk','Every court sprite must have native walk');
          for(let d=0;d<8;d++)check(s.anims.exists(p.slug+'-Walk-'+d),'Eight native directions required');
        }""")
        page.wait_for_timeout(40)
        first=Image.open(BytesIO(canvas.screenshot())).convert("RGB")
        page.evaluate("""() => {
          const count=s.animator.manifest[p.slug].actions.Walk.durations.length;
          p.sprite.setFrame(2*count+1);s.matchTime=s.animator.manifest[p.slug].actions.Walk.durations[0]+1;s.presentation.update();
        }""")
        page.wait_for_timeout(40)
        later=Image.open(BytesIO(canvas.screenshot())).convert("RGB")
        factor=first.width/960
        hudcrop=tuple(round(v*factor) for v in (20,0,120,78))
        assert ImageChops.difference(first.crop(hudcrop),later.crop(hudcrop)).getbbox(),f"{slug}: moving HUD pixels"
        point=page.evaluate("PokeJamArena.project(p.x,p.y)")
        crop=tuple(round(v*factor) for v in (point["x"]-90,point["y"]-90,point["x"]+90,point["y"]+70))
        assert ImageChops.difference(first.crop(crop),later.crop(crop)).getbbox(),f"{slug}: moving court pixels"
        if entry["visual"].get("animation"):
            page.evaluate("""() => {
              p.moving=false;const physics=[p.x,p.y,p.z],stats=JSON.stringify(p.stats),charge=p.ultimateCharge;
              for(const cue of ['pass','catch','steal','shove','block','dunk','ultimate','perk','celebrate']) {
                s.showAction(p,cue,'Attack',400);s.syncPlayerSprites(p);s.presentation.update();
                const first=p.sprite.frame.name, portrait=s.presentation.hud[0].portrait.frame.name;
                s.matchTime+=190;s.syncPlayerSprites(p);s.presentation.update();
                check(p.visualAction===p.visual.animation.actions[cue]&&p.sprite.frame.name!==first,'Species-native pose must advance: '+cue);
                check(s.presentation.hud[0].portrait.frame.name!==portrait,'HUD must follow event-timed native frames: '+p.slug+' '+cue);
                check(s.presentation.hud[0].portrait.displayWidth<=64&&s.presentation.hud[0].portrait.displayHeight<=54,'Portrait bounds cannot cover neighboring HUD');
              }
              check([p.x,p.y,p.z].every((v,i)=>v===physics[i])&&JSON.stringify(p.stats)===stats&&p.ultimateCharge===charge,'Animations cannot alter physics/stats');
              p.ultimateCharge=100;s.presentation.update();
              check(s.presentation.hud[0].auraFront.commandBuffer.length>0,'Every READY HUD needs a typed aura');
            }""")
        if slug in expected:
            page.evaluate("""arg => {
              setup(arg.slug);const config=s.firePerks.config(p);
              check((config.active?.name||null)===arg.move,'Expected on-fire package');
              if(arg.slug==='onix')check(config.passives.includes('rockPolish'),'Onix must inherit Rock Polish');
              if(arg.slug==='staraptor')check(config.passives.includes('tailwind'),'Staraptor must inherit Tailwind');
              if(arg.slug==='darkrai')check(config.passives.includes('suckerPunch'),'Darkrai needs counter passive');
              s.isPaused=false;p.ultimateCharge=100;
              const profile=PokeJamFinishes.profileFor(p.record);
              check(s.startUltimate(p),'New species ultimate must start');step(165);
              check(s.score.player===3&&p.stats.makes===1,'Finish must score once from outside arc');
              check(s.styleLedger.totals.player===(profile.signature?150:100),'Finish style must match signature');
              s.restartMatch();p.ultimateCharge=100;s.startUltimate(p,true);step(165);check(s.score.player===3,'Forced dunk must work');
              const lineup=s.players.map(p=>p.slug);[lineup[0],lineup[2]]=[lineup[2],lineup[0]];
              s.setLineup(lineup);const cpu=s.players[2];s.giveBall(cpu);cpu.ultimateCharge=100;
              check(s.startUltimate(cpu),'CPU must be able to use new finish');step(165);check(s.score.cpu===3,'CPU finish must score for CPU');
            }""",{"slug":slug,"move":expected[slug]})
    page.evaluate("""() => {
      setup('infernape');s.isPaused=false;p.ultimateCharge=100;s.startUltimate(p);step(45);
      check(p.ultimate?.stage==='drive'&&Math.abs(p.sprite.rotation)>0.2,'Flame Wheel must visibly rotate through native animation');
      setup('garchomp');s.isPaused=false;s.firePerks.ignite(p);p.fireSession.nextCastAt=s.matchTime;
      check(s.firePerks.cast(p),'Free Dragon Rush must start');step(165);
      check(s.score.player===3&&s.styleLedger.totals.player===0,'Automatic Dragon Rush keeps separate style/charge rules');
      s.setLineup(['onix','infernape','staraptor','tangrowth']);s.isPaused=true;
      for(const p of s.players){p.ultimateCharge=100;s.syncPlayerSprites(p);}s.presentation.update();
    }""")
    page.screenshot(path="/tmp/pokejam-full-roster-animations.png",full_page=True)
    assert not errors,errors
    browser.close()
print("PASS: all twenty native eight-direction walk/court/HUD pixels, sixteen species-native action sequences, bounded portraits and readiness auras, ten new perk packages, signatures/forced dunks/CPU scoring, Flame Wheel rotation, free Dragon Rush and visual-only transforms.")
