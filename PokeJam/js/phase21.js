(function () {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const Timing = {
    target: 0.52, window: 0.045, duration: 1040 / 980,
    grade(error, window = this.window) { return Math.abs(error) <= window ? "GREEN" : `${Math.abs(error) > 0.25 ? "VERY " : ""}${error < 0 ? "EARLY" : "LATE"}`; },
    bonus(error) { return 0.2 * (1 - clamp(Math.abs(error) / 0.25, 0, 1))
      - 0.12 * clamp((Math.abs(error) - 0.25) / 0.3, 0, 1); },
  };

  function typedAura(rear, front, profile, x, y, rx, ry, phase, reduced, compact = false) {
    const top = compact ? 14 : -Infinity;
    const motion = reduced ? 0 : phase;
    if (profile.type === "fire") {
      for (let i = 0; i < (reduced ? 7 : 11); i++) {
        const a = Math.PI + i * Math.PI / (reduced ? 6 : 10);
        const bx = x + Math.cos(a) * rx, by = y + Math.sin(a) * ry;
        const lift = 12 + (Math.sin(motion * 1.4 + i * 2) + 1) * 8;
        const tip = Math.max(top, by - lift), sway = Math.sin(motion + i) * 4;
        rear.fillStyle(0xf04425, 0.8).fillTriangle(bx - 9, by + 18, bx + 9, by + 18, bx + sway, tip);
        rear.fillStyle(0xffa52f, 0.9).fillTriangle(bx - 5, by + 15, bx + 5, by + 15, bx + sway, tip + 7);
        rear.fillStyle(0xfff0a0, 0.9).fillTriangle(bx - 2, by + 12, bx + 2, by + 12, bx + sway, tip + 13);
      }
      for (const side of [-1, 1]) {
        const bx = x + side * (rx - 3);
        front.fillStyle(0xffa52f, 0.85).fillTriangle(bx - 3, y + 15, bx + 3, y + 15, bx + Math.sin(motion) * 2, y + 2);
      }
      if (!reduced) for (let i = 0; i < 7; i++) {
        const t = (motion / 12 + i / 7) % 1;
        front.fillStyle(i % 2 ? 0xffef9e : 0xffa52f, (1 - t) * 0.9)
          .fillRect(x + Math.sin(i * 4 + motion * 0.3) * (rx + 4), Math.max(top, y + 18 - t * (ry + 40)), 2, 3);
      }
    } else if (profile.type === "electric") {
      const bolts = Array.from({length: 25}, (_, i) => {
        const a = i * Math.PI / 12, zig = i % 2 ? 6 + Math.sin(motion * 1.8 + i) * 3 : -1;
        return { x: x + Math.cos(a) * (rx + zig), y: Math.max(top, y + Math.sin(a) * (ry + zig)) };
      });
      rear.lineStyle(reduced ? 3 : 5, 0xffb72d, 0.55).strokePoints(bolts, true);
      rear.lineStyle(1.8, 0xfff5a4, 0.95).strokePoints(bolts, true);
      for (const side of [-1, 1]) {
        const bx = x + side * (rx - 2), offset = Math.sin(motion * 2 + side) * 4;
        const branch = [{x:bx,y:y+14},{x:bx+side*8,y:y+offset},{x:bx+side*2,y:y-3},
          {x:bx+side*12,y:Math.max(top,y-18+offset)}];
        front.lineStyle(4, 0xffd738, 0.65).strokePoints(branch, false);
        front.lineStyle(1.4, 0xfffbe0, 1).strokePoints(branch, false);
      }
    } else {
      rear.lineStyle(4, profile.color, 0.55).strokeEllipse(x, y, rx * 2, ry * 2);
      rear.lineStyle(1.5, profile.accent, 0.85).strokeEllipse(x, y, rx * 2 + 8, ry * 2 + 8);
      for (let i = 0; i < 6; i++) {
        const a = motion * 0.2 + i * Math.PI / 3;
        const bx = x + Math.cos(a) * rx, by = Math.max(top, y + Math.sin(a) * ry);
        front.lineStyle(2, profile.accent, 0.9).lineBetween(bx, by + 4, bx + Math.sin(a) * 4, Math.max(top, by - 9));
      }
    }
  }

  class MatchPresentation {
    constructor(scene) {
      this.scene = scene;
      this.meterMode = "gauge";
      this.dimmer = scene.add.rectangle(480, 270, 960, 540, 0x02090d, 1).setAlpha(0).setDepth(50);
      this.passFx = scene.add.graphics();
      this.contactFx = scene.add.graphics().setDepth(1300);
      this.passTrail = [];
      this.passFlight = null;
      this.spin = 0;
      this.hudFrameCache = new Map();
      this.aura = new Map(scene.players.map(p => [p, { rear: scene.add.graphics(), front: scene.add.graphics() }]));
      this.hud = scene.players.map((p, i) => {
        const x = [72, 207, 753, 888][i];
        const text = (y, size, color) => scene.add.text(x, y, "", { fontFamily: "monospace", fontSize: `${size}px`,
          fontStyle: "bold", color, stroke: "#07100e", strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(2003);
        return { x, ring: scene.add.graphics().setDepth(2002),
          auraRear: scene.add.graphics().setDepth(2002.1), auraFront: scene.add.graphics().setDepth(2002.9),
          portrait: scene.add.sprite(x, 36, p.slug).setDisplaySize(48, 48).setDepth(2003),
          control: text(0, 10, "#e8eee7"), charge: text(46, 22, "#e8eee7").setX(x + 20),
          name: text(73, 11, "#e8eee7"), effect: text(104, 9, "#f4cf70") };
      });
      this.slots = [0, 1].map(i => {
        const root = document.createElement("div"); root.className = "shot-slot";
        const name = document.createElement("span"); name.className = "shot-name";
        const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 128;
        canvas.getContext("2d").scale(2, 2);
        canvas.setAttribute("aria-label", `Player ${i + 1} shot timing`);
        const grade = document.createElement("b"); grade.className = "shot-grade";
        root.append(name, canvas, grade); document.querySelector("#shot-meters").append(root);
        return { root, name, canvas, grade };
      });
    }

    hudFrames(key, data, direction) {
      const cacheKey = `${key}:${direction}`;
      if (this.hudFrameCache.has(cacheKey)) return this.hudFrameCache.get(cacheKey);
      const texture = this.scene.textures.get(key), count = data.durations.length;
      const canvas = document.createElement("canvas"); canvas.width=data.width; canvas.height=data.height;
      const ctx = canvas.getContext("2d", {willReadFrequently:true});
      let left=data.width, top=data.height, right=-1, bottom=-1;
      // A shared crop for the whole action removes sheet padding without frame-size jitter.
      for(let i=0;i<count;i++) {
        const frame=texture.get(direction*count+i);
        ctx.clearRect(0,0,data.width,data.height);
        ctx.drawImage(texture.getSourceImage(),frame.cutX,frame.cutY,data.width,data.height,0,0,data.width,data.height);
        const pixels=ctx.getImageData(0,0,data.width,data.height).data;
        for(let y=0;y<data.height;y++) for(let x=0;x<data.width;x++) if(pixels[(y*data.width+x)*4+3]>8) {
          left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
        }
      }
      if(right<left){left=top=0;right=data.width-1;bottom=data.height-1;}
      const width=right-left+1,height=bottom-top+1;
      const frames=Array.from({length:count},(_,i)=>{
        const source=texture.get(direction*count+i),name=`hud-${direction}-${i}`;
        if(!texture.has(name))texture.add(name,source.sourceIndex,source.cutX+left,source.cutY+top,width,height);
        return name;
      });
      const record={frames,width,height};this.hudFrameCache.set(cacheKey,record);return record;
    }

    playerHud() {
      const s = this.scene;
      s.players.forEach((p, i) => {
        const h = this.hud[i], ready = p.ultimateCharge >= 100, human = s.humanIndex(p);
        const color = ready ? 0xf4cf70 : p.team === "player" ? 0x38bd9f : 0xdd5263;
        const profile = PokeJamFinishes.profileFor(p.record), phase = s.matchTime / 220;
        const actions = s.animator.manifest[p.slug]?.actions || {};
        let action = s.reducedEffects ? "Idle" : p.ultimate || ready ? "Charge" : p.moving || p.hasBall ? "Walk" : "Idle";
        const native = p.visual?.animation;
        if (native && !s.reducedEffects) {
          if (p.visualProgress != null && p.visualAction) action = p.visualAction;
          else if (!ready && !p.moving && !p.hasBall) action = native.actions.idle;
        }
        if (!actions[action]) action = "Idle";
        const data = actions[action], texture = `${p.slug}-${action}`;
        if (data && s.textures.exists(texture)) {
          const total = data.durations.reduce((sum, ms) => sum + ms, 0);
          let at = s.reducedEffects ? 0 : s.matchTime % total, frame = 0;
          while (frame < data.durations.length - 1 && at >= data.durations[frame]) at -= data.durations[frame++];
          if (native && action === p.visualAction && p.visualProgress != null && !s.reducedEffects)
            frame = Number(p.sprite.frame.name) % data.durations.length;
          const rows = Math.floor(s.textures.get(texture).getSourceImage().height / data.height);
          const direction = Math.min(rows - 1, p.team === "player" ? 2 : 6);
          const cropped = this.hudFrames(texture,data,direction);
          h.portrait.setTexture(texture, cropped.frames[frame]);
          const scale = Math.min(64/cropped.width,(ready?54:50)/cropped.height);
          h.portrait.setDisplaySize(cropped.width*scale,cropped.height*scale);
        } else h.portrait.setTexture(p.slug).setDisplaySize(48, 48);
        h.portrait.setY(36 + (s.reducedEffects ? 0 : Math.sin(phase + i) * (ready ? 2 : 1)));
        h.charge.setText(`${Math.floor(p.ultimateCharge)}%`).setColor(ready ? "#f4cf70" : "#edf1e8");
        h.name.setText(p.onFire ? `${p.record.name} ${Math.ceil(p.fireRemaining / 1000)}s` : p.record.name)
          .setFontSize(11).setColor(p.onFire ? "#ffb16b" : "#edf1e8");
        if (h.name.width > 128) h.name.setFontSize(10);
        h.effect.setText(s.firePerks?.label(p) || "").setFontSize(9);
        if (h.effect.width > 128) h.effect.setFontSize(8).setText((s.firePerks?.label(p) || "").split(" / ")[0]);
        h.control.setText(ready ? "READY" : human >= 0 ? `P${human + 1}` : p.team === "player" ? "COM" : "CPU");
        const g = h.ring.clear();
        const points = [{x:h.x-43,y:17},{x:h.x-26,y:9},{x:h.x+36,y:9},{x:h.x+42,y:56},{x:h.x+25,y:70},{x:h.x-36,y:70}];
        g.fillStyle(0x07100e, 0.85).fillPoints(points, true);
        g.lineStyle(2, color, 0.9).strokePoints(points, true);
        g.lineStyle(1, 0xdcece2, 0.8).lineBetween(h.x-27,11,h.x+31,11).lineBetween(h.x-35,65,h.x+19,65);
        g.fillStyle(profile.color, 0.35).fillTriangle(h.x-40,19,h.x-26,12,h.x-35,50);
        for (let j=0; j<8; j++) g.fillStyle(j < p.ultimateCharge/12.5 ? color : 0x42564e,1)
          .fillRect(h.x-26+j*7,68,5,3);
        h.auraRear.clear(); h.auraFront.clear();
        if (ready || p.ultimate?.stage === "windup") typedAura(h.auraRear, h.auraFront, profile,
          h.x, 38, 30, 19, s.matchTime / 160, s.reducedEffects, true);
        g.fillStyle(0x102320, 0.9).fillRect(h.x - 25, 89, 50, 4);
        g.fillStyle(color, 1).fillRect(h.x - 25, 89, p.stamina / 2, 4);
        if (human >= 0) g.fillStyle(0xe8eee7, 1).fillTriangle(h.x - 4, 99, h.x + 4, 99, h.x, 94);
        if (p.hasBall) g.fillStyle(0xf47c32, 1).fillCircle(h.x - 25, 61, 4);
      });
    }

    meters() {
      const s = this.scene;
      document.querySelector("#shot-meters").classList.toggle("solo", !s.coop);
      this.slots.forEach((slot, i) => {
        slot.root.hidden = i === 1 && !s.coop;
        const p = s.controlledPlayer(i), attempt = p?.shotAttempt;
        const active = attempt?.kind === "jumper" && (!attempt.released || s.matchTime < attempt.displayUntil);
        const elapsed = active ? (attempt.released ? attempt.releaseAt : s.matchTime) - attempt.startedAt : 0;
        const progress = active ? clamp(elapsed / 1000 / Timing.duration, 0, 1) : 0;
        slot.name.textContent = `P${i + 1} ${p?.record.name || ""}`;
        slot.grade.textContent = active && attempt.released ? attempt.grade : active ? "SHOOTING" : "";
        slot.grade.dataset.green = String(active && attempt.grade === "GREEN");
        slot.root.classList.toggle("shot-active", Boolean(active));
        slot.canvas.setAttribute("aria-valuetext", active ? slot.grade.textContent : "Inactive");
        const g = slot.canvas.getContext("2d"); g.clearRect(0, 0, 400, 64);
        const target = attempt?.target ?? Timing.target, window = attempt?.window ?? Timing.window;
        const start = (target - window) / Timing.duration;
        const end = (target + window) / Timing.duration;
        g.globalAlpha = active ? 1 : 0.75; g.lineWidth = 9; g.lineCap = "butt";
        const color = active && attempt.grade === "GREEN" ? "#69edaa" : "#f4cf70";
        const pulse = s.reducedEffects ? 0 : Math.sin(s.matchTime / 80) * 0.5 + 0.5;
        g.save();
        if (this.meterMode !== "gauge") g.translate(30, 0);
        if (this.meterMode === "gauge") {
          const path = points => { g.beginPath(); points.forEach(([x,y],j)=>j?g.lineTo(x,y):g.moveTo(x,y)); g.closePath(); };
          const shape = (points, fill, stroke) => { path(points); g.fillStyle=fill; g.fill();
            if(stroke){g.strokeStyle=stroke;g.lineWidth=1;g.stroke();} };
          const housing = [[8.5,29.5],[20.5,17.5],[379.5,17.5],[391.5,29.5],[391.5,38.5],[379.5,50.5],[20.5,50.5],[8.5,38.5]];
          const track = [[30.5,23.5],[369.5,23.5],[377.5,31.5],[377.5,36.5],[369.5,44.5],[30.5,44.5],[22.5,36.5],[22.5,31.5]];
          g.lineJoin="miter";
          shape(housing,"#182b34","#d1dce0");
          shape([[21,19],[379,19],[385,25],[15,25]],"#536c79");
          shape([[15,43],[385,43],[379,49],[21,49]],"#09141d");
          shape(track,"#091923");
          g.save(); path(track); g.clip();
          const fill=g.createLinearGradient(0,24,0,44);
          fill.addColorStop(0,"#fff0b2"); fill.addColorStop(0.35,"#efc259"); fill.addColorStop(1,"#b87820");
          g.fillStyle=fill; g.fillRect(23,24,progress*354,20);
          g.fillStyle="#39bb8c"; g.fillRect(23+start*354,24,(end-start)*354,20);
          g.fillStyle="#9ff7ca"; g.fillRect(23+start*354,24,(end-start)*354,3);
          for(let j=1;j<10;j++){g.fillStyle="#0a1e28";g.fillRect(23+j*35.4,28,1,12);}
          if(active&&!s.reducedEffects){
            g.globalAlpha=0.15;g.fillStyle="#ffffff";
            const shift=(s.matchTime/30)%24;
            for(let x=23+shift;x<23+progress*354;x+=24)g.fillRect(x,25,6,18);
          }
          g.restore();
          path(track);g.strokeStyle="#76919d";g.lineWidth=1;g.stroke();
          for(const x of [15,385]) {
            shape([[x-3,30],[x,27],[x+3,30],[x+3,38],[x,41],[x-3,38]],"#b8cbd3","#07121a");
            g.fillStyle="#3d766d";g.fillRect(x-1,31,2,6);
          }
          const cursor=23+progress*354;
          g.fillStyle="#07121a";g.fillRect(cursor-2,22,4,24);
          g.fillStyle=color;g.fillRect(cursor-1,23,2,22);
          shape([[cursor-4,10],[cursor+4,10],[cursor+4,13],[cursor,17],[cursor-4,13]],color,"#07121a");
        } else if (this.meterMode === "bar") {
          g.strokeStyle = "#aac8bd"; g.lineWidth = 2; g.strokeRect(18, 26, 304, 20);
          g.fillStyle = "#263d43"; g.fillRect(20, 28, 300, 16);
          g.fillStyle = "#38bd9f"; g.fillRect(20, 28, progress * 300, 16);
          g.fillStyle = "#69edaa"; g.fillRect(20 + start * 300, 24, (end - start) * 300, 24);
          for (let j = 1; j < 15; j++) { g.fillStyle = "#102320"; g.fillRect(20 + j * 20, 28, 2, 16); }
          g.fillStyle = color; g.fillRect(20 + progress * 300 - 2, 20, 4, 32);
          g.beginPath(); g.moveTo(14 + progress * 300, 13); g.lineTo(26 + progress * 300, 13);
          g.lineTo(20 + progress * 300, 19); g.fill();
        } else {
          const angle = t => Math.PI * (1.14 + t * 0.72);
          const arc = (a, b, c) => { g.strokeStyle = c; g.beginPath(); g.ellipse(170, 86, 150, 66, 0, angle(a), angle(b)); g.stroke(); };
          g.lineWidth = 13; arc(0, 1, "#aac8bd");
          g.lineWidth = 9; arc(0, 1, "#263d43"); arc(0, progress, "#38bd9f"); arc(start, end, "#69edaa");
          const a = angle(progress); g.strokeStyle = color; g.lineWidth = 4; g.beginPath();
          g.moveTo(170 + Math.cos(a) * 140, 86 + Math.sin(a) * 56);
          g.lineTo(170 + Math.cos(a) * 160, 86 + Math.sin(a) * 76); g.stroke();
        }
        if (active && !s.reducedEffects) {
          g.globalAlpha = 0.45 + pulse * 0.4; g.fillStyle = color;
          for (let j = 0; j < 3; j++) g.fillRect(152 + j * 16, 4, 9, 2 + pulse * 2);
        }
        if (active && attempt.released && attempt.grade === "GREEN" && !s.reducedEffects) {
          const burst = clamp((s.matchTime - attempt.releaseAt) / 850, 0, 1);
          g.globalAlpha = 1 - burst; g.fillStyle = "#69edaa";
          for (const side of [-1, 1]) for (let j = 0; j < 3; j++) g.fillRect(170 + side * (24 + burst * 90 + j * 10), 9 + j * 8, 5, 3);
        }
        g.restore(); g.globalAlpha = 1;
      });
    }

    readiness(p) {
      const s = this.scene, { rear, front } = this.aura.get(p);
      const point = PokeJamArena.project(p.x, p.y, p.z), ground = PokeJamArena.project(p.x, p.y);
      rear.clear().setDepth(Math.round(ground.y) - 1);
      front.clear().setDepth(Math.round(ground.y) + 0.4);
      const charging = p.ultimate?.stage === "windup";
      if (p.ultimateCharge < 100 && !charging) return;
      const profile = PokeJamFinishes.profileFor(p.record), x = point.x, y = point.y - 12;
      const rx = (p.visual?.auraRadius ?? 23) + (charging ? 8 * p.ultimate.progress : 0);
      typedAura(rear, front, profile, x, y, rx, 26, s.matchTime / 160, s.reducedEffects);
    }

    update(dt = 0) {
      const s = this.scene, u = s.ultimate;
      const t = u?.stage === "windup" ? u.progress : 1;
      this.dimmer.setAlpha(u?.stage === "windup" ? (s.reducedEffects ? 0.22 : 0.43 * Math.min(1, t / 0.15, (1 - t) / 0.23)) : 0);
      for (const p of s.players) this.readiness(p);
      this.contactFx.clear();
      for (const p of s.players) if (p.shove?.hit && p.shove.target) {
        const hit = PokeJamArena.project(p.shove.target.x, p.shove.target.y, 30);
        const t = clamp((p.shove.elapsed - 0.085) / 0.195, 0, 1);
        this.contactFx.lineStyle(2, 0xfff3d5, (1 - t) * 0.7).strokeEllipse(hit.x, hit.y, 12 + t * 18, 8 + t * 12);
      }
      this.meters();
      this.playerHud();
      this.passFx.clear();
      const flight = ["pass", "alley"].includes(s.ball.state) && s.ball.flight;
      if (!flight) { this.passTrail = []; this.passFlight = null; return; }
      if (this.passFlight !== flight) { this.passTrail = []; this.passFlight = flight; }
      const p = PokeJamArena.project(s.ball.x, s.ball.y, s.ball.z);
      if (dt > 0) this.passTrail.push({ ...p, at: s.matchTime });
      this.passTrail = this.passTrail.filter(p => s.matchTime - p.at < 110).slice(-6);
      const trail = s.reducedEffects ? this.passTrail.slice(-2) : this.passTrail;
      this.passFx.setDepth(s.ball.sprite.depth - 0.2);
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i];
        this.passFx.lineStyle(1 + i / 3, 0xe4f2e9, i / trail.length * 0.42).lineBetween(a.x, a.y, b.x, b.y);
      }
      if (!s.reducedEffects && trail.length > 1) {
        const first = trail[0], dx = p.x - first.x, dy = p.y - first.y, length = Math.hypot(dx, dy) || 1;
        for (const side of [-1, 1]) this.passFx.lineStyle(1, 0xc8e6e0, 0.45)
          .strokePoints([{x:p.x-dx*0.7-dy/length*side*9,y:p.y-dy*0.7+dx/length*side*9},
            {x:p.x-dx*0.35-dy/length*side*12,y:p.y-dy*0.35+dx/length*side*12},
            {x:p.x-dy/length*side*9,y:p.y+dx/length*side*9}], false);
      }
    }

    clear() {
      this.passTrail = []; this.passFlight = null; this.passFx.clear(); this.dimmer.setAlpha(0);
      this.contactFx.clear();
      for (const {rear, front} of this.aura.values()) { rear.clear(); front.clear(); }
      for (const h of this.hud) { h.auraRear.clear(); h.auraFront.clear(); }
    }
  }
  window.PokeJamTiming = Timing;
  window.PokeJamPresentation = MatchPresentation;
}());
