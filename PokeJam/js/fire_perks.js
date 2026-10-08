(function () {
  const SPOT = 32;
  const FIRE_DURATION = 15000;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const gap = (a, b) => Math.hypot(a.x-b.x,a.y-b.y);
  const unit = (x,y) => { const n=Math.hypot(x,y)||1;return {x:x/n,y:y/n}; };
  const TYPES = {
    water: {name:"Hydro Pump",kind:"projectile",cooldown:6000,range:330,push:5*SPOT,color:0x52ccff},
    electric: {name:"Discharge",kind:"radial",cooldown:6000,range:100,status:"paralysis",color:0xffdf42},
    normal: {name:"Take Down",kind:"shove",push:4*SPOT,color:0xffe9ad},
    fire: {name:"Flame Burst",kind:"projectile",cooldown:7000,range:300,status:"burn",chance:0.85,patches:true,color:0xff633b},
    grass: {name:"Razor Blade",kind:"projectile",cooldown:4000,range:290,push:4*SPOT,volley:true,color:0x72e07e},
    ice: {name:"Powder Snow",kind:"cone",cooldown:6000,range:145,status:"freeze",chance:0.4,chill:true,color:0xabefff},
    fighting: {name:"Mach Punch",kind:"cone",cooldown:5000,range:80,status:"stun",color:0xff9b81},
    poison: {name:"Toxic",kind:"radial",cooldown:7000,range:SPOT,status:"poison",color:0xe49cfa},
    ground: {name:"Bulldoze",kind:"radial",cooldown:6000,range:145,status:"stun",groundOnly:true,color:0xe8bd68},
    flying: {name:"Tailwind",kind:"passive",passive:"tailwind"},
    psychic: {name:"Hypnosis",kind:"projectile",cooldown:7000,range:300,status:"sleep",widen:true,color:0xff9ddd},
    bug: {name:"Bug Buzz",kind:"radial",cooldown:6000,range:130,status:"stun",color:0xc2ed64},
    rock: {name:"Rock Polish",kind:"passive",passive:"rockPolish"},
    ghost: {name:"Shadow Ball",kind:"finish",cooldown:8000,finish:"jumper",type:"ghost",color:0xb494ff},
    dragon: {name:"Dragon Rush",kind:"finish",cooldown:8000,finish:"dunk",type:"dragon",color:0x88aaff},
    dark: {name:"Sucker Punch",kind:"passive",passive:"suckerPunch"},
    steel: {name:"Iron Defense",kind:"passive",passive:"ironDefense"},
    fairy: {name:"Unlimited Passing",kind:"passive",passive:"unlimitedPassing"},
  };
  const SPECIALS = {
    charizard: {active:{name:"Flamethrower",kind:"cone",cooldown:4000,range:145,status:"burn",color:0xff633b},passives:["wingLift"]},
    pikachu: {active:TYPES.electric,passives:["quickAttack"]},
    lucario: {active:{...TYPES.fighting,name:"Force Palm"},passives:["focusEnergy"]},
    snorlax: {active:{...TYPES.normal,name:"Body Slam"},passives:["thickFat"]},
    mewtwo: {active:{name:"Psybeam",kind:"projectile",cooldown:5000,range:290,status:"confusion",color:0xff9ddd},passives:[]},
  };
  const STATUSES = {
    paralysis:{duration:4000,move:0.3,label:"PARALYZED",color:0xffdf42},
    burn:{duration:3000,move:0.85,label:"BURN",color:0xff8259},
    freeze:{duration:7000,hard:true,label:"FROZEN",color:0xabefff},
    sleep:{duration:6000,hard:true,label:"ASLEEP",color:0xe4baff},
    confusion:{duration:5000,label:"CONFUSED",color:0xff9ddd},
    poison:{duration:15000,move:0.85,label:"POISON",color:0xe49cfa},
    stun:{duration:3000,hard:true,label:"STUN",color:0xffe9ad},
    chill:{duration:2000,move:0.7,label:"CHILL",color:0xabefff},
  };

  class FirePerks {
    constructor(scene) {
      this.scene=scene;this.casts=[];this.projectiles=[];this.patches=[];
      this.fx=scene.add.graphics().setDepth(1700);
      this.floorFx=scene.add.graphics().setDepth(11);
      this.createIceSheet();
      this.ui=new Map(scene.players.map(p=>[p,{
        ice:scene.add.sprite(0,0,"status-ice",0).setVisible(false),
        label:scene.add.text(0,0,"",{fontFamily:"Arial, sans-serif",fontSize:"11px",fontStyle:"bold",
          color:"#ffffff",stroke:"#07100e",strokeThickness:4}).setOrigin(0.5,1).setDepth(1701),
      }]));
      for(const p of scene.players){p.statuses=new Map();p.statusImmunity=new Map();p.fireSession=null;p.fireRemaining=0;}
    }

    createIceSheet() {
      const s=this.scene;if(s.textures.exists("status-ice"))return;
      const tex=s.textures.createCanvas("status-ice",480,96),g=tex.context;
      for(let f=0;f<6;f++){
        g.save();g.translate(f*80,0);
        const poly=(points,fill)=>{g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fillStyle=fill;g.fill();};
        poly([[8,86],[3,26],[20,8],[62,5],[76,27],[69,88]],"rgba(120,216,255,0.22)");
        poly([[3,26],[20,8],[27,76],[8,86]],"rgba(202,247,255,0.30)");
        poly([[62,5],[76,27],[69,88],[55,79]],"rgba(112,212,255,0.24)");
        poly([[20,8],[62,5],[76,27],[25,23]],"rgba(232,253,255,0.38)");
        g.strokeStyle="rgba(222,251,255,0.85)";g.lineWidth=2;g.beginPath();
        g.moveTo(8,86);g.lineTo(3,26);g.lineTo(20,8);g.lineTo(62,5);g.lineTo(76,27);g.lineTo(69,88);g.closePath();g.stroke();
        g.strokeStyle="rgba(255,255,255,0.65)";g.beginPath();g.moveTo(13,30);g.lineTo(17,64);g.stroke();
        if(f>0){g.beginPath();g.moveTo(42,88);g.lineTo(34,63);g.lineTo(47,47);g.lineTo(40,26-f*3);g.stroke();}
        if(f>2){g.beginPath();g.moveTo(34,63);g.lineTo(18,51);g.moveTo(47,47);g.lineTo(64,37);g.stroke();}
        g.fillStyle="rgba(255,255,255,0.7)";g.fillRect(58-f*3,16+f*5,3,3);
        g.restore();tex.add(f,0,f*80,0,80,96);
      }
      tex.refresh();
    }

    config(p) {
      const special=SPECIALS[p.record.slug];
      const moves=p.record.types.map(t=>TYPES[t]).filter(Boolean);
      return {active:special?.active||moves.find(move=>move.kind!=="passive")||moves[0],passives:[...(special?.passives||[]),
        ...p.record.types.map(t=>TYPES[t]?.passive).filter(Boolean)]};
    }
    has(p,perk){return Boolean(p?.onFire&&this.config(p).passives.includes(perk));}
    status(p,kind){const v=p.statuses?.get(kind);return v&&v.expiresAt>this.scene.matchTime?v:null;}
    locked(p){return ["freeze","sleep","stun"].some(k=>this.status(p,k))
      || (this.status(p,"paralysis")?.freezeUntil||0)>this.scene.matchTime;}
    casting(p){return this.casts.some(c=>c.player===p);}
    canAct(p){return !this.locked(p)&&!this.casting(p);}
    moveScale(p){
      if(this.locked(p))return 0;
      let scale=1;for(const k of ["burn","poison","paralysis","chill"])if(this.status(p,k))scale=Math.min(scale,STATUSES[k].move);
      if(this.has(p,"tailwind")||this.has(p,"rockPolish"))scale*=1.25;
      if(this.has(p,"quickAttack"))scale*=1.15;
      if(this.casting(p))scale*=0.3;
      return scale;
    }
    chargeScale(p){return this.status(p,"poison")?0:(this.status(p,"burn")?0.75:1)*(this.has(p,"focusEnergy")?1.15:1);}
    defenseScale(p){return this.status(p,"burn")?0.65:1;}
    dunkBonus(p,base){return this.has(p,"wingLift")?Math.min(40,base*0.2):0;}
    takeDown(p){return p.onFire&&this.config(p).active?.kind==="shove";}
    canAffect(source,target){return source&&target&&source.team!==target.team&&!target.ultimate
      &&!(this.scene.ultimate?.shooter===target&&this.scene.ultimate.stage!=="impact");}

    apply(source,target,kind) {
      const s=this.scene,def=STATUSES[kind];
      if(!def||!this.canAffect(source,target)||s.isPaused||s.gameOver||s.ball.state==="dead")return false;
      if((target.statusImmunity?.get(kind)||0)>s.matchTime)return false;
      if(def.hard&&this.status(target,kind))return false;
      const duration=kind==="burn"&&this.has(target,"thickFat")?def.duration/2:def.duration;
      target.statuses.set(kind,{kind,source,expiresAt:s.matchTime+duration,
        taps:0,needed:kind==="freeze"?Phaser.Math.Between(10,14):18,lastKey:null,lastTap:-Infinity,nextMash:s.matchTime+200,nextPulse:s.matchTime+800});
      if(def.hard){
        const held=s.ball.holder===target;
        if((target.dunking||target.ultimate)&&target.stats.shots>0)target.stats.shots--;
        this.casts=this.casts.filter(c=>c.player!==target);
        s.cancelAction(target);target.z=0;target.vz=0;target.blocking=false;
        target.callHeld=false;target.calling=false;target.jockeying=false;
        if(held)s.giveBall(target);
      }
      return true;
    }
    remove(p,kind){p.statuses.delete(kind);if(STATUSES[kind]?.hard)p.statusImmunity.set(kind,this.scene.matchTime+1000);}
    mash(p,key) {
      const effect=this.status(p,"freeze")||this.status(p,"sleep");if(!effect)return this.locked(p);
      const now=this.scene.matchTime;
      if(key!==effect.lastKey&&now-effect.lastTap>=60){effect.lastKey=key;effect.lastTap=now;effect.taps++;
        if(effect.taps>=effect.needed)this.remove(p,effect.kind);}
      return true;
    }
    ignite(p){const active=this.config(p).active;p.onFire=true;p.fireRemaining=FIRE_DURATION;
      p.fireSession={nextCastAt:this.scene.matchTime+(active?.cooldown||0)};}
    extinguish(p){p.onFire=false;p.fireRemaining=0;p.makeStreak=0;p.fireSession=null;this.casts=this.casts.filter(c=>c.player!==p);}
    label(p){
      const effects=[...(p.statuses?.values()||[])].filter(v=>v.expiresAt>this.scene.matchTime);
      if(effects.length){const order=["freeze","sleep","stun","paralysis","poison","burn","confusion","chill"];
        effects.sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind));const v=effects[0];
        return `${STATUSES[v.kind].label} ${Math.ceil((v.expiresAt-this.scene.matchTime)/1000)}${effects.length>1?` +${effects.length-1}`:""}`;}
      if(p.onFire){const a=this.config(p).active;return a?.kind==="passive"||a?.kind==="shove"?a.name
        :`${a?.name||"FIRE"} ${Math.max(0,Math.ceil(((p.fireSession?.nextCastAt||0)-this.scene.matchTime)/1000))}`;}
      return "";
    }

    cast(p) {
      const s=this.scene,perk=this.config(p).active;
      if(!p.onFire||!perk||["passive","shove"].includes(perk.kind)||!this.canAct(p)||p.z>0||p.shotLocked
        ||s.matchTime<p.disabledUntil||s.isPaused||s.gameOver||s.ball.state==="dead"||s.clock<=0
        ||s.matchTime<(p.fireSession?.nextCastAt??Infinity))return false;
      if((perk.ballRequired||perk.kind==="finish")&&(s.ball.holder!==p||s.shotClock<=0))return false;
      if(perk.kind==="finish"){
        const profile={...PokeJamFinishes.profileFor({...p.record,slug:"",types:[perk.type]}),name:perk.name,
          kind:perk.finish,signature:false,styleValue:0,perk:true};
        if(!s.startUltimate(p,perk.finish==="dunk",profile))return false;
        p.fireSession.nextCastAt=s.matchTime+perk.cooldown;return true;
      }
      const opponents=s.players.filter(t=>t.team!==p.team).sort((a,b)=>gap(p,a)-gap(p,b));
      const angle=(2-p.facing)*Math.PI/4;
      const dir=perk.name==="Flamethrower"?{x:Math.cos(angle),y:Math.sin(angle)}
        :opponents[0]?unit(opponents[0].x-p.x,opponents[0].y-p.y):{x:Math.cos(angle),y:Math.sin(angle)};
      p.facing=(2-Math.round(Math.atan2(dir.y,dir.x)/(Math.PI/4))+8)%8;
      p.fireSession.nextCastAt=s.matchTime+perk.cooldown;
      s.showAction(p,"perkCharge","Charge",180);
      this.casts.push({player:p,perk,source:{x:p.x,y:p.y},dir,elapsed:0,emitted:false,hits:new Set()});
      s.flash(perk.name.toUpperCase(),700);s.audio?.play("pass");return true;
    }

    hit(c,target) {
      if(c.hits.has(target)||!this.canAffect(c.player,target)||target.z>45)return;
      c.hits.add(target);
      if(c.perk.chill)this.apply(c.player,target,"chill");
      if(c.perk.status&&Math.random()<(c.perk.chance??1))this.apply(c.player,target,c.perk.status);
      if(c.perk.push)this.push(c.player,target,c.dir,c.perk.push);
    }
    push(source,target,dir,amount) {
      if(!this.canAffect(source,target))return;
      target.knockback={from:{x:target.x,y:target.y},to:{x:clamp(target.x+dir.x*amount,64,896),y:clamp(target.y+dir.y*amount,98,484)},elapsed:0};
      if(this.scene.ball.holder===target){this.scene.cancelAction(target);this.scene.setLooseBall(target.x,target.y,dir.x*140,dir.y*140,85);}
      target.disabledUntil=Math.max(target.disabledUntil,this.scene.matchTime+180);
    }
    emit(c) {
      const s=this.scene;s.showAction(c.player,"perk","Attack",380);
      if(c.perk.kind==="projectile")for(const angle of c.perk.volley?[-0.13,0,0.13]:[0]){
        const dir={x:c.dir.x*Math.cos(angle)-c.dir.y*Math.sin(angle),y:c.dir.x*Math.sin(angle)+c.dir.y*Math.cos(angle)};
        this.projectiles.push({...c,dir,x:c.source.x,y:c.source.y,traveled:0,done:false});
      }
    }
    splash(projectile) {
      if(!projectile.perk.patches)return;
      for(let i=0;i<4;i++){
        const a=i*Math.PI/2,point={x:clamp(projectile.x+Math.cos(a)*22,48,912),y:clamp(projectile.y+Math.sin(a)*22,82,500)};
        this.patches.push({...point,player:projectile.player,expiresAt:this.scene.matchTime+3000,hits:new Set()});
      }
    }

    update(dt) {
      const s=this.scene,now=s.matchTime;
      for(const p of s.players){
        for(const [kind,v] of p.statuses){
          if(now>=v.expiresAt){this.remove(p,kind);continue;}
          if(kind==="paralysis"&&now>=v.nextPulse){v.nextPulse=now+800;if(Math.random()<0.3)v.freezeUntil=now+500;}
        }
        const mash=this.status(p,"freeze")||this.status(p,"sleep");
        if(mash&&s.humanIndex(p)<0&&now>=mash.nextMash){mash.nextMash=now+200;this.mash(p,mash.lastKey==="J"?"I":"J");}
        if(p.onFire&&!p.fireSession)this.ignite(p);
        if(p.onFire&&!s.isPaused&&!s.gameOver&&s.ball.state!=="dead"&&s.clock>0){
          p.fireRemaining=Math.max(0,p.fireRemaining-dt*1000);
          if(p.fireRemaining<0.001)this.extinguish(p);
        }
        if(!p.onFire&&p.fireSession)this.extinguish(p);
        if(s.ball.state!=="dead")this.cast(p);
      }
      for(const c of this.casts){
        if(this.locked(c.player))continue;
        c.elapsed+=dt;
        if(c.elapsed>=0.18&&!c.emitted){c.emitted=true;this.emit(c);}
        if(c.emitted&&["cone","radial"].includes(c.perk.kind))for(const target of s.players){
          if(c.perk.groundOnly&&target.z>0)continue;
          const dir=unit(target.x-c.source.x,target.y-c.source.y);
          if(gap(c.source,target)<=c.perk.range+18&&(c.perk.kind==="radial"||dir.x*c.dir.x+dir.y*c.dir.y>=Math.cos(55*Math.PI/180)))this.hit(c,target);
        }
      }
      this.casts=this.casts.filter(c=>c.elapsed<0.65&&c.player.onFire&&!this.locked(c.player));
      for(const p of this.projectiles){
        const travel=480*dt;p.traveled+=travel;p.x+=p.dir.x*travel;p.y+=p.dir.y*travel;
        const radius=p.perk.widen?10+p.traveled*0.16:14;
        for(const t of s.players)if(gap(p,t)<=radius+18&&!p.hits.has(t)&&this.canAffect(p.player,t)&&t.z<=45){
          this.hit(p,t);if(p.perk.patches){this.splash(p);p.done=true;break;}
        }
        if(p.traveled>=p.perk.range){if(!p.done)this.splash(p);p.done=true;}
      }
      this.projectiles=this.projectiles.filter(p=>!p.done);
      this.patches=this.patches.filter(p=>p.expiresAt>now);
      for(const patch of this.patches)for(const target of s.players)if(gap(patch,target)<28&&!patch.hits.has(target)&&this.canAffect(patch.player,target)&&target.z<=0){
        patch.hits.add(target);if(Math.random()<0.85)this.apply(patch.player,target,"burn");
      }
      this.render();
    }

    intercept(flight) {
      const s=this.scene;if(flight.uninterceptable||!flight.passer)return false;
      flight.interceptionTried||=new Set();
      for(const p of s.players){
        if(p.team===flight.passer.team||!this.canAct(p)||p.shotLocked||s.matchTime<p.disabledUntil||flight.interceptionTried.has(p))continue;
        if(gap(p,s.ball)>26||Math.abs(p.z+38-s.ball.z)>35)continue;
        flight.interceptionTried.add(p);
        const chance=clamp(0.45+(p.record.attributes.steal-flight.passer.record.attributes.passing)/250,0.2,0.7)*this.defenseScale(p);
        if(Math.random()>=chance)continue;
        s.recordMiss(flight.passer);s.giveBall(p);p.stats.steals++;s.addUltimateCharge(p,15);
        s.awardStyle(s.styleLedger.award(s.nextEventId(),p,"STEAL",20));s.present("steal",p);s.flash("INTERCEPTED");return true;
      }
      return false;
    }
    stealGuard(handler,defender){
      if(handler.team===defender.team)return false;
      if(this.has(handler,"rockPolish"))return true;
      if(this.has(handler,"suckerPunch")&&Math.random()<0.9){this.apply(handler,defender,"stun");this.scene.flash("SUCKER PUNCH");return true;}
      return false;
    }

    render() {
      const s=this.scene,g=this.fx.clear(),floor=this.floorFx.clear(),project=PokeJamArena.project,now=s.matchTime;
      for(const p of s.players){
        const point=project(p.x,p.y,p.z),ui=this.ui.get(p),ice=this.status(p,"freeze"),sleep=this.status(p,"sleep");
        const hard=ice||sleep,bodyY=point.y-13;
        ui.ice.setVisible(Boolean(ice)).setPosition(point.x,bodyY).setDepth(Math.round(point.y)+0.6)
          .setDisplaySize(p.visual?.iceWidth??84,96).setFrame(ice?Math.min(5,Math.floor(ice.taps/ice.needed*5)+(s.reducedEffects?0:Math.floor(now/180)%2)):0);
        let label=this.label(p);
        if(hard&&s.humanIndex(p)>=0)label=`MASH ${s.humanIndex(p)===1?"K + L":"J + I"}  ${hard.needed-hard.taps}`;
        ui.label.setText(label).setFontSize(11).setVisible(Boolean(label));
        if(ui.label.width>160)ui.label.setFontSize(10);
        ui.label.setPosition(clamp(point.x,ui.label.width/2+6,954-ui.label.width/2),
          Math.max(125,bodyY-51+(s.reducedEffects?0:Math.sin(now/180)*3)));
        if(sleep){g.lineStyle(2,0xe4baff,0.7).strokeEllipse(point.x,bodyY-42,32,13);
          for(let i=0;i<3;i++){const y=bodyY-48-i*10-(s.reducedEffects?0:(now/60)%8);g.lineStyle(2,0xffffff,0.8).strokePoints([{x:point.x+12+i*8,y},{x:point.x+19+i*8,y},{x:point.x+12+i*8,y:y+5},{x:point.x+19+i*8,y:y+5}],false);}}
        if(this.status(p,"stun")||this.status(p,"confusion"))for(let i=0;i<3;i++){
          const a=(s.reducedEffects?0:now/300)+i*Math.PI*2/3,x=point.x+Math.cos(a)*24,y=bodyY-35+Math.sin(a)*7;
          g.fillStyle(this.status(p,"confusion")?0xff9ddd:0xffe9ad,0.9).fillTriangle(x-4,y+2,x+4,y+2,x,y-5);}
        if(this.status(p,"burn"))for(let i=0;i<4;i++){
          const t=(s.reducedEffects?i/4:(now/700+i/4)%1),x=point.x-18+i*12,y=bodyY+20-t*40;
          g.fillStyle(0xff633b,(1-t)*0.6).fillTriangle(x-3,y+4,x+3,y+4,x,y-6);}
        if(this.status(p,"poison")){g.lineStyle(2,0xe49cfa,0.7).strokeEllipse(point.x,bodyY+26,34,10);}
        if(this.status(p,"paralysis")){g.lineStyle(2,0xffdf42,0.9).strokePoints([{x:point.x-21,y:bodyY-14},{x:point.x-15,y:bodyY-6},{x:point.x-22,y:bodyY+1}],false);}
        if(p.dunking&&this.has(p,"wingLift"))for(const side of [-1,1])g.lineStyle(2,0xffd166,0.7).strokePoints([
          {x:point.x,y:bodyY},{x:point.x+side*38,y:bodyY-24},{x:point.x+side*29,y:bodyY+8},{x:point.x+side*9,y:bodyY+12}],false);
      }
      for(const c of this.casts){
        const point=project(c.source.x,c.source.y,30);
        g.lineStyle(c.emitted?3:1,c.perk.color,c.emitted?0.65:0.35);
        if(c.perk.kind==="radial"){
          const ring=Array.from({length:33},(_,i)=>project(c.source.x+Math.cos(i*Math.PI/16)*c.perk.range,c.source.y+Math.sin(i*Math.PI/16)*c.perk.range));
          floor.lineStyle(c.emitted?3:1,c.perk.color,c.emitted?0.65:0.35).strokePoints(ring,true);
          if(c.emitted&&!s.reducedEffects)for(let i=0;i<6;i++){
            const a=i*Math.PI/3,p=project(c.source.x+Math.cos(a)*c.perk.range*0.6,c.source.y+Math.sin(a)*c.perk.range*0.6,22);
            g.lineStyle(2,c.perk.color,0.75).strokePoints([{x:point.x,y:point.y},{x:p.x-4,y:p.y+3},{x:p.x+2,y:p.y-5}],false);
          }
        }
        if(c.perk.kind==="cone"){
          const angle=Math.atan2(c.dir.y,c.dir.x),points=[point];
          for(let i=0;i<=12;i++){const a=angle-55*Math.PI/180+i*110*Math.PI/180/12;points.push(project(c.source.x+Math.cos(a)*c.perk.range,c.source.y+Math.sin(a)*c.perk.range,30));}
          g.fillStyle(c.perk.color,c.emitted?0.17:0.06).fillPoints(points,true).strokePoints(points,true);
          if(c.emitted&&!s.reducedEffects)for(let i=0;i<7;i++){const a=angle-0.65+i*0.22,t=(now/300+i/7)%1;
            const p=project(c.source.x+Math.cos(a)*c.perk.range*t,c.source.y+Math.sin(a)*c.perk.range*t,25);
            g.fillStyle(c.perk.color,(1-t)*0.7).fillTriangle(p.x-5,p.y+4,p.x+5,p.y+4,p.x,p.y-10);}
        }
      }
      for(const p of this.projectiles){
        const point=project(p.x,p.y,35),r=p.perk.widen?10+p.traveled*0.16:14;
        g.fillStyle(p.perk.color,0.6).fillEllipse(point.x,point.y,r*2,r);
        g.lineStyle(2,0xffffff,0.8).strokeEllipse(point.x,point.y,r*2,r);
        const tail=project(p.x-p.dir.x*30,p.y-p.dir.y*30,35);g.lineStyle(3,p.perk.color,0.5).lineBetween(point.x,point.y,tail.x,tail.y);
      }
      for(const p of this.patches){const point=project(p.x,p.y),t=s.reducedEffects?0:Math.sin(now/100+p.x);
        floor.fillStyle(0xff633b,0.35).fillEllipse(point.x,point.y,30,13);
        g.fillStyle(0xffb64f,0.7).fillTriangle(point.x-7,point.y,point.x+7,point.y,point.x+t*3,point.y-20);}
    }

    clear(sessions=false) {
      this.casts=[];this.projectiles=[];this.patches=[];this.fx.clear();this.floorFx.clear();
      for(const p of this.scene.players){p.statuses?.clear();p.statusImmunity?.clear();if(sessions)this.extinguish(p);
        const ui=this.ui.get(p);ui.ice.setVisible(false);ui.label.setVisible(false);}
    }
  }
  window.PokeJamFirePerks=FirePerks;
  window.PokeJamPerkManifest={types:TYPES,specials:SPECIALS,statuses:STATUSES,spot:SPOT};
}());
