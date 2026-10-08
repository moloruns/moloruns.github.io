"""Timed fire lifecycle and the scoreboard's contained mini shot timer."""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8002"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True)
    page = browser.new_page(viewport={"width":1280,"height":900})
    errors=[]; page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + "/play.html?test=1", wait_until="domcontentloaded")
    page.wait_for_function("window.pokeJamGame?.scene.getScene('MatchScene')?.firePerks")
    page.evaluate("""() => {
      window.s=pokeJamGame.scene.getScene('MatchScene');window.f=s.firePerks;
      window.check=(ok,msg)=>{if(!ok)throw Error(msg);};
      s.updateCpuMovement=()=>{};s.readMovement=()=>{};
      window.step=n=>{for(let i=0;i<n;i++)s.update(0,1000/60);};
      window.setup=()=>{for(const p of s.players)p.record=s.recordsBySlug[p.slug];s.restartMatch();
        window.a=s.players[0];window.b=s.players[2];a.x=430;a.y=286;b.x=490;b.y=286;
        for(const p of s.players)p.record={...p.record,slug:'timer-fixture',types:['flying']};};
      window.fire=()=>{s.recordBucket(a);s.recordBucket(a);s.recordBucket(a);};
      window.rng=(value,fn)=>{const old=Math.random;Math.random=()=>value;try{fn();}finally{Math.random=old;}};
      setup();s.recordBucket(a);s.recordMiss(a);s.recordBucket(a);s.recordBucket(a);
      check(!a.onFire,'Miss still resets streak before ignition');s.recordBucket(a);
      check(a.onFire&&a.fireRemaining===15000,'Third consecutive make starts exactly fifteen seconds');
      f.update(3);check(a.fireRemaining===12000,'Live play consumes timer');
      s.recordBucket(a);check(a.fireRemaining===17000,'Make adds exactly five seconds to remaining time');
      const next=a.fireSession.nextCastAt;s.recordMiss(a);
      check(a.onFire&&a.fireRemaining===17000&&a.fireSession.nextCastAt===next,'Miss leaves fire and cooldown intact');
      s.recordBucket(s.players[1]);check(a.fireRemaining===17000,'Teammate basket does not refill owner');
      for(const fps of [30,60,120]){
        setup();fire();for(let i=0;i<15*fps-1;i++)f.update(1/fps);
        check(a.onFire&&a.fireRemaining>0,'Fire remains before deadline at '+fps);
        f.update(1/fps);check(!a.onFire&&a.fireRemaining===0&&!a.fireSession&&a.makeStreak===0,'Fire expires at fifteen seconds at '+fps);
        check(f.moveScale(a)===1,'Passive boost ends with timer');
      }
      setup();fire();s.togglePause();const remaining=a.fireRemaining;step(120);
      check(a.fireRemaining===remaining,'Pause freezes fire');s.togglePause();s.inbound('cpu','');step(10);
      check(a.fireRemaining===remaining,'Dead inbound freezes fire');step(60);check(a.fireRemaining<remaining,'Fire resumes on live inbound');
      setup();fire();s.recordBucket(b);check(!a.onFire&&a.fireRemaining===0,'Opposing bucket ends fire');
      setup();fire();s.firePerks.ignite(s.players[1]);rng(0,()=>s.trySteal(b,a));
      check(!a.onFire&&a.fireRemaining===0&&b.stats.steals===1,'Successful direct steal ends handler fire');
      check(s.players[1].onFire,'Steal must not extinguish teammate');
      setup();fire();rng(1,()=>s.trySteal(b,a));check(a.onFire,'Failed steal does not extinguish');
      setup();a.record={...a.record,types:['rock']};fire();rng(0,()=>s.trySteal(b,a));
      check(a.onFire&&b.stats.steals===0,'Protected steal does not extinguish');
      setup();fire();s.passBall(a,s.players[1]);s.ball.x=b.x;s.ball.y=b.y;s.ball.z=38;
      rng(0,()=>check(f.intercept(s.ball.flight),'Pass interception fixture'));check(a.onFire,'Interception is not a direct steal');
      setup();fire();s.travel(a);check(a.onFire&&a.fireRemaining===15000,'Travel preserves active timer');
      setup();fire();s.giveBall(a);rng(0,()=>{s.tryShove(b);s.updateShove(b,0.09);});
      check(a.onFire,'Shove turnover is not a direct steal');
      setup();fire();window.pokeJamShotChance=()=>1;s.startShot(a);s.releaseShot(a);
      b.x=s.ball.x=a.x;b.y=s.ball.y=a.y;s.ball.z=100;b.z=45;b.blocking=true;b.blockAttempted=false;
      rng(0,()=>s.checkBlocks());check(b.stats.blocks===1&&a.onFire,'Blocked shot preserves active fire');
      setup();fire();s.restartMatch();check(s.players.every(p=>!p.onFire&&p.fireRemaining===0),'Rematch resets fire');
      fire();s.finishMatch();check(s.players.every(p=>!p.onFire&&p.fireRemaining===0),'Results clear fire');
      setup();fire();s.shotClock=4.7;s.updateHud();s.updateBall(0);
      check(document.querySelector('#shot-clock-value').textContent==='4.7','Mini timer shows tenths in final seconds');
      check(document.querySelector('#shot-clock').classList.contains('urgent'),'Timer warns in final seconds');
      check(!s.children.list.some(c=>c.type==='Text'&&c.text==='SHOT CLOCK'),'No floating arena shot-clock label');
      check(s.presentation.hud[0].name.text.includes('15s'),'Fire seconds appear on owner portrait');s.isPaused=true;
      delete window.pokeJamShotChance;
    }""")
    for width,height in [(1280,900),(390,844)]:
        page.set_viewport_size({"width":width,"height":height});page.wait_for_timeout(150)
        assert page.evaluate("""() => {
          const timer=document.querySelector('#shot-clock').getBoundingClientRect(),board=document.querySelector('.match-scoreboard').getBoundingClientRect();
          return timer.width<110&&timer.left>=board.left&&timer.right<=board.right&&timer.top>=board.top&&timer.bottom<=board.bottom&&document.documentElement.scrollWidth<=innerWidth;
        }"""), "Mini timer must remain contained by scoreboard"
        page.screenshot(path=f"/tmp/pokejam-fire-timer-{width}.png",full_page=True)
    assert not errors,errors
    browser.close()
    print("PASS: fifteen-second fire, five-second extensions, live/pause/inbound timing, 30/60/120 fps expiry, direct/opposing extinguish rules, misses/blocks/interceptions/shoves/travel preservation, reset/results cleanup and scoreboard-contained mini timer.")
