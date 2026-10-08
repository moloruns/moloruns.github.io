"""All type fallbacks, status rules, opponent isolation and real escape inputs."""
import sys
from io import BytesIO
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

BASE=sys.argv[1] if len(sys.argv)>1 else "http://127.0.0.1:8002"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=CHROME,headless=True)
    page=browser.new_page(viewport={"width":1280,"height":900})
    errors=[];page.on("pageerror",lambda e:errors.append(str(e)))
    page.goto(BASE+"/play.html?test=1",wait_until="domcontentloaded")
    page.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.firePerks")
    page.evaluate("""() => {
      window.s=pokeJamGame.scene.getScene('MatchScene');window.f=s.firePerks;
      window.check=(ok,message)=>{if(!ok)throw Error(message);};
      s.updateCpuMovement=()=>{};s.readMovement=()=>{};
      window.step=n=>{for(let i=0;i<n;i++)s.update(0,1000/60);};
      window.setup=(type='electric')=>{
        for(const p of s.players)p.record=s.recordsBySlug[p.slug];s.coop=false;s.restartMatch();
        window.a=s.players[0];window.friend=s.players[1];window.b=s.players[2];
        a.record={...a.record,slug:'fixture-'+type,types:[type]};a.x=430;a.y=286;a.facing=2;
        friend.x=440;friend.y=330;b.x=490;b.y=286;s.players[3].x=760;
        for(const p of s.players)s.syncPlayerSprites(p);s.sortSprites();
      };
      window.fire=()=>{a.onFire=true;f.ignite(a);a.fireSession.nextCastAt=s.matchTime;};
      window.withRng=(value,fn)=>{const original=Math.random;Math.random=()=>value;try{fn();}finally{Math.random=original;}};
      setup();check(Object.keys(PokeJamPerkManifest.types).length===18,'All 18 type fallbacks must exist');
      for(const kind of ['paralysis','burn','freeze','sleep','confusion','poison','stun']){
        check(!f.apply(a,friend,kind)&&!friend.statuses.size,'Statuses must reject teammate: '+kind);
        check(f.apply(a,b,kind),'Enemy status must apply: '+kind);f.clear();
      }
      const fx=friend.x;f.push(a,friend,{x:1,y:0},160);check(friend.x===fx&&!friend.knockback,'Push must reject teammate');
      setup();f.apply(a,b,'burn');b.ultimateCharge=50;s.addUltimateCharge(b,20);
      check(b.ultimateCharge===65&&f.moveScale(b)===0.85&&f.defenseScale(b)===0.65,'Burn must slow, penalize earned charge and defensive strength');
      f.apply(a,b,'paralysis');check(f.moveScale(b)===0.3,'Paralysis must slow much more than burn');
      s.matchTime+=810;withRng(0,()=>f.update(0));check(f.locked(b),'Paralysis must sometimes lock for half a second');
      s.matchTime+=501;check(!f.locked(b),'Paralysis pulse must release after 500 ms');
      setup();f.apply(a,b,'poison');b.ultimateCharge=50;s.addUltimateCharge(b,35);
      check(b.ultimateCharge===50&&f.moveScale(b)===0.85,'Poison blocks all new charge and uses burn slow');
      const poisonEnd=f.status(b,'poison').expiresAt;check(Math.abs(poisonEnd-s.matchTime-15000)<0.001,'Poison duration is 15 seconds');
      s.matchTime=poisonEnd+1;f.update(0);s.addUltimateCharge(b,20);check(b.ultimateCharge===70,'Charge earning recovers after poison');
      setup();f.apply(a,b,'confusion');const x=b.x;s.movePlayer(b,1,0,false,0.1);
      check(b.x<x&&Math.abs(f.status(b,'confusion').expiresAt-s.matchTime-5000)<0.001,'Confusion reverses movement for five seconds');
      setup();f.apply(a,b,'stun');const pos=b.x;s.movePlayer(b,1,0,false,0.1);s.tryBlock(b);
      check(b.x===pos&&!b.blocking,'Stun blocks movement/actions');s.matchTime+=3001;f.update(0);check(!f.locked(b),'Stun ends after three seconds');
      setup();f.apply(b,a,'freeze');f.render();s.isPaused=true;s.animator.pause(true);
    }""")
    canvas=page.locator("#game-root canvas")
    frozen=Image.open(BytesIO(canvas.screenshot())).convert("RGB")
    page.screenshot(path="/tmp/pokejam-status-freeze.png",full_page=True)
    page.evaluate("""() => {
      check(f.ui.get(a).ice.visible&&f.ui.get(a).label.text.includes('MASH J + I'),'Ice and mash prompt must render');
      const end=f.status(a,'freeze').expiresAt;step(120);check(f.status(a,'freeze').expiresAt===end,'Pause must freeze status time');
      s.isPaused=false;window.escapeStart=s.matchTime;
      f.mash(a,'J');const taps=f.status(a,'freeze').taps;s.matchTime+=200;f.mash(a,'J');
      check(f.status(a,'freeze').taps===taps,'Repeated same key must not count as alternating mash');
      window.need=f.status(a,'freeze').needed;
    }""")
    for i in range(16):
        if not page.evaluate("Boolean(f.status(a,'freeze'))"):
            break
        page.evaluate("() => {s.matchTime+=200;document.activeElement?.blur();}")
        page.keyboard.press("i" if i%2==0 else "j")
    page.evaluate("""() => {
      check(!f.status(a,'freeze')&&s.matchTime-escapeStart<3200,'Reasonable alternating mash must escape ice within three seconds');
      check(!a.pendingShot&&!a.shotAttempt&&a.stats.shots===0,'Final escape tap must not accidentally shoot');
      f.render();s.isPaused=true;
    }""")
    thawed=Image.open(BytesIO(canvas.screenshot())).convert("RGB")
    assert ImageChops.difference(frozen,thawed).getbbox(),"Ice must visibly disappear after escape"
    page.evaluate("""() => {
      setup();f.apply(b,a,'freeze');s.matchTime+=7001;f.update(0);check(!f.locked(a),'Ice automatically melts after seven seconds');
      setup();f.apply(b,a,'sleep');check(f.status(a,'sleep').needed===18,'Sleep escape is harder than freeze');
      f.render();s.isPaused=true;
    }""")
    page.screenshot(path="/tmp/pokejam-status-sleep.png",full_page=True)
    page.evaluate("""() => {
      s.isPaused=false;for(let i=0;i<18;i++){s.matchTime+=200;f.mash(a,i%2?'I':'J');}
      check(!f.status(a,'sleep'),'Sleep mash escape must work');
      setup();f.apply(b,a,'sleep');s.matchTime+=6001;f.update(0);check(!f.locked(a),'Sleep expires at six seconds');
      setup();f.apply(a,b,'freeze');for(let i=0;i<16;i++){s.matchTime+=210;f.update(0);}
      check(!f.locked(b),'CPU must escape at a realistic mash cadence');
      setup('water');check(!f.cast(a),'Cold mon must not cast');a.onFire=true;f.ignite(a);
      const due=a.fireSession.nextCastAt;s.matchTime=due-1;f.update(0);
      check(!f.casts.length,'Automatic cast must wait full initial interval');
      s.matchTime=due;f.update(0);check(f.casts.length===1,'Ready automatic cast starts at its deadline');
      const next=a.fireSession.nextCastAt;f.update(0.7);s.matchTime=next-1;f.update(0);
      check(!f.casts.length,'Recovery ending must not bypass cooldown');
      s.matchTime=next;f.update(0);check(f.casts.length===1,'Automatic cooldown allows repeat');
      a.onFire=false;f.update(0);check(!f.casts.length&&!a.fireSession,'Fire ending cancels cast and session');
      setup();f.apply(b,a,'freeze');const end=f.status(a,'freeze').expiresAt;
      s.matchTime+=500;check(!f.apply(b,a,'freeze')&&f.status(a,'freeze').expiresAt===end,'Hard status cannot refresh');
      s.matchTime=end;f.update(0);check(!f.apply(b,a,'freeze'),'Thaw grants brief same-status protection');
      s.matchTime+=1001;check(f.apply(b,a,'freeze'),'Protection ends after one second');
      setup();s.coop=true;window.p2=friend;f.apply(b,p2,'freeze');f.render();
      check(f.ui.get(p2).label.text.includes('K + L'),'P2 has its own escape controls');
      s.isPaused=true;const taps=f.status(p2,'freeze').taps;s.onActionDown(1);s.onPassDown(1);
      check(f.status(p2,'freeze').taps===taps,'Paused keyboard actions must not advance mash');
      s.isPaused=false;
    }""")
    for i in range(14):
        if not page.evaluate("Boolean(f.status(p2,'freeze'))"):
            break
        page.evaluate("() => {s.matchTime+=200;document.activeElement?.blur();}")
        page.keyboard.press("k" if i%2==0 else "l")
    page.evaluate("""() => {
      check(!f.status(p2,'freeze')&&!p2.pendingShot&&!p2.passCharge,'Real P2 keys must escape without a follow-on action');
      for(const type of ['electric','fighting','poison','ground','bug','ice']){
        setup(type);fire();if(type==='poison'){b.x=a.x+28;b.y=a.y;}
        withRng(0,()=>{check(f.cast(a),'Type must cast: '+type);f.update(0.2);});
        const expected={electric:'paralysis',fighting:'stun',poison:'poison',ground:'stun',bug:'stun',ice:'freeze'}[type];
        check(f.status(b,expected),'Type status must hit: '+type);check(!friend.statuses.size,'Area move must not hit friend: '+type);
        check(!f.cast(a),'Cooldown prevents immediate repeat: '+type);
      }
      setup('ground');b.z=80;fire();f.cast(a);f.update(0.2);check(!b.statuses.size,'Bulldoze must miss airborne mons');
      for(const type of ['water','grass','fire','psychic']){
        setup(type);fire();f.cast(a);withRng(0,()=>{for(let i=0;i<20;i++){s.matchTime+=16;f.update(0.016);}});
        if(type==='water'||type==='grass')check(b.knockback&&Math.round(Math.hypot(b.knockback.to.x-b.knockback.from.x,b.knockback.to.y-b.knockback.from.y))===(type==='water'?160:128),'Projectile push distance: '+type);
        else check(f.status(b,type==='fire'?'burn':'sleep'),'Projectile status: '+type);
        if(type==='fire'){check(f.patches.length===4,'Flame Burst produces four court flames');s.matchTime+=3001;f.update(0);check(!f.patches.length,'Flames expire after three seconds');}
        check(!friend.statuses.size&&!friend.knockback,'Projectile must not hit friend: '+type);
      }
      setup('water');b.x=880;f.push(a,b,{x:1,y:0},160);check(b.knockback.to.x===896,'Push clamps at playable edge');
      setup('normal');fire();s.giveBall(b);a.x=430;b.x=480;a.facing=2;
      withRng(0,()=>{s.tryShove(a);s.updateShove(a,0.09);});check(b.knockback.to.x-b.knockback.from.x===128,'Normal fire shove becomes Take Down');
      setup('rock');fire();check(f.moveScale(a)>1,'Rock Polish gives speed');s.trySteal(b,a);check(s.ball.holder===a&&b.stats.steals===0,'Rock Polish prevents steals');
      setup('dark');fire();withRng(0,()=>s.trySteal(b,a));check(f.status(b,'stun')&&s.ball.holder===a,'Sucker Punch rejects steal and stuns opponent');
      setup('flying');fire();check(f.moveScale(a)>1&&f.moveScale(friend)===1,'Tailwind affects owner only, not teammate');
      setup('fairy');fire();s.passBall(a,friend);const pass=s.ball.flight;
      b.x=s.ball.x=a.x+20;b.y=s.ball.y=a.y;s.ball.z=38;
      withRng(0,()=>check(!f.intercept(pass),'Fairy pass cannot be intercepted'));
      setup('water');s.passBall(a,friend);b.x=s.ball.x=a.x+20;b.y=s.ball.y=a.y;s.ball.z=38;
      withRng(0,()=>check(f.intercept(s.ball.flight)&&s.ball.holder===b,'Non-fairy pass can actually be intercepted'));
      setup('steel');fire();a.x=820;s.startDunk(a);b.blocking=true;b.blockAttempted=false;b.z=60;
      s.ball.x=b.x=a.x;s.ball.y=b.y=a.y;s.ball.z=115;
      withRng(0,()=>s.checkBlocks());check(a.dunking&&b.stats.blocks===0,'Iron Defense protects on-fire dunks');
      for(const type of ['ghost','dragon']){
        setup(type);fire();a.ultimateCharge=40;window.pokeJamShotChance=()=>0;
        check(f.cast(a)&&s.ultimate.profile.perk,'Automatic finisher must start without meter: '+type);
        check(a.ultimateCharge===40,'Automatic finish must not spend charged ultimate');step(210);
        check(s.score.player===3&&a.stats.makes===1,'Automatic finish outside the arc must score three even with zero probability hook: '+type);
      }
      setup();a.record=s.recordsBySlug.charizard;a.onFire=true;f.ignite(a);a.fireSession.nextCastAt=s.matchTime;
      a.x=430;a.y=286;a.facing=2;b.x=490;b.y=286;s.players[3].x=370;s.players[3].y=286;
      f.cast(a);withRng(0,()=>f.update(0.2));check(f.status(b,'burn')&&!s.players[3].statuses.size,'Flamethrower must affect only its forward partial semicircle');
      const base=72+a.record.attributes.dunk*1.45;check(s.dunkRange(a)>base&&s.dunkRange(a)<=base+40,'Wing Lift extends bounded dunk range');
      f.apply(b,friend,'sleep');s.inbound('cpu','');check(s.players.every(p=>!p.statuses.size)&&!f.casts.length&&!f.projectiles.length&&!f.patches.length,'Inbound clears statuses and hazards');
      setup();f.apply(b,a,'poison');fire();s.restartMatch();check(!a.statuses.size&&!a.fireSession,'Restart clears all temporary state');
      delete window.pokeJamShotChance;
    }""")
    page.set_viewport_size({"width":390,"height":844});page.wait_for_timeout(150)
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"),"Effects HUD must fit narrow layout"
    assert not errors,errors
    browser.close()
    print("PASS: all 18 type fallbacks, seven statuses, teammate isolation, charge/defense penalties, timed/keyboard/CPU escape, cooldowns, projectiles/hazards, passive protections, auto finishers, Charizard cone/range and lifecycle cleanup.")
