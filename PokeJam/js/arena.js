(function () {
  const C = { ink: 0x14272b, jade: 0x17584d, mint: 0x38bd9f, red: 0xdd5263,
    gold: 0xf4cf70, white: 0xe8eee7, wood: 0xd6ae76, line: 0xfff3d5 };
  const ARC_RX = 250, ARC_RY = 177;

  function isOutsideArc(point, hoop) {
    const inward = Math.max(0, (point.x - hoop.x) * -hoop.side);
    return (inward / ARC_RX) ** 2 + ((point.y - hoop.y) / ARC_RY) ** 2 > 1 + 1e-9;
  }

  function project(x, y, z = 0) {
    const t = (y - 82) / 418;
    const scale = 0.76 + t * 0.24;
    return { x: 480 + (x - 480) * scale, y: 180 + t * 296 - z * 0.78, scale };
  }

  function polygon(g, points, color, alpha = 1) {
    g.fillStyle(color, alpha).fillPoints(points, true);
  }

  class IndigoArena {
    constructor(scene, hoops, stage = window.PokeJamStages.stages[0]) {
      const previous = new Set(scene.children.list);
      this.scene = scene;
      this.stage = stage;
      this.colors = { ...C, ...stage.palette };
      this.cheerUntil = 0;
      this.lastCrowdFrame = -1;
      this.hoops = hoops.map((hoop) => ({ hoop, back: scene.add.graphics(), front: scene.add.graphics(), hitAt: -1000 }));
      this.drawArchitecture();
      this.drawFloor();
      this.crowd = scene.add.graphics().setDepth(5);
      this.official = scene.add.graphics().setDepth(8);
      this.stageMotion = scene.add.graphics().setDepth(4);
      this.officialUntil = 0;
      this.officialTeam = "player";
      this.hoops.forEach((item) => this.drawHoop(item, 0));
      this.update(0);
      this.objects = scene.children.list.filter(object => !previous.has(object));
    }

    destroy() {
      for (const object of this.objects) object.destroy();
      this.objects = [];
    }

    drawArchitecture() {
      const C = this.colors, s = this.scene, g = s.add.graphics().setDepth(0);
      g.fillStyle(C.ink).fillRect(0, 0, 960, 540);
      this.hasBackdrop = s.textures.exists(this.stage.texture);
      if (this.hasBackdrop) this.backdrop = s.add.image(0, 0, this.stage.texture).setOrigin(0).setDisplaySize(960, 392).setDepth(1);
      g.fillStyle(0x293e40).fillRect(0, 0, 960, 180);
      for (let i = 0; i < 12; i += 1) {
        const x = i * 88 - 4;
        g.fillStyle(0x415653).fillRect(x, 0, 6, 146);
        g.fillStyle(0x0d2025).fillRect(x + 7, 6, 76, 26);
        g.lineStyle(2, 0x76857a).lineBetween(x + 8, 4, x + 80, 4);
      }
      for (let row = 0; row < 3; row += 1) {
        const y = 66 + row * 28;
        g.fillStyle(row === 1 ? 0x953847 : 0x34494c).fillRect(18, y, 924, 24);
        for (let x = 28; x < 940; x += 19) {
          g.fillStyle(row === 1 ? 0xc05460 : 0x60705e).fillRect(x, y + 7, 13, 15);
        }
        g.fillStyle(0x111f24).fillRect(18, y + 23, 924, 5);
      }
      for (const x of [120, 300, 654, 832]) {
        polygon(g, [{ x, y: 30 }, { x: x + 26, y: 30 }, { x: x + 26, y: 57 }, { x: x + 13, y: 65 }, { x, y: 57 }], C.gold);
        g.fillStyle(C.jade).fillRect(x + 6, 35, 14, 17);
        g.fillStyle(C.white).fillRect(x + 11, 38, 4, 10);
      }
      g.fillStyle(C.jade).fillRect(0, 151, 960, 29);
      g.fillStyle(C.mint).fillRect(0, 151, 960, 3);
      for (const x of [46, 804]) {
        g.fillStyle(0x0c171b).fillRect(x, 129, 110, 50);
        g.lineStyle(4, 0x81988b).strokeRect(x, 129, 110, 50);
      }
      for (let i = 0; i < 5; i += 1) {
        const x = 380 + i * 42;
        g.fillStyle(0xf4f5dd).fillRect(x, 9, 29, 6);
        g.fillStyle(0x7d927c).fillRect(x, 15, 29, 3);
      }
      const sign = s.add.graphics().setDepth(6);
      polygon(sign, [{x:784,y:120},{x:810,y:111},{x:948,y:111},{x:937,y:157},{x:800,y:163}], 0x07100e);
      sign.lineStyle(2, 0x8ccccc).strokePoints([{x:784,y:120},{x:810,y:111},{x:948,y:111},{x:937,y:157},{x:800,y:163}],true);
      polygon(sign, [{x:804,y:120},{x:817,y:114},{x:943,y:114},{x:938,y:121}], 0xc4edf0);
      polygon(sign, [{x:804,y:156},{x:935,y:151},{x:930,y:159},{x:807,y:162}], C.gold);
      polygon(sign, [{x:790,y:131},{x:800,y:119},{x:810,y:132},{x:800,y:151}], 0x3cb5c7);
      polygon(sign, [{x:797,y:130},{x:800,y:124},{x:804,y:131},{x:800,y:141}], 0xdbf6ee);
      this.stageSign = s.add.text(940, 119, this.stage.title, { fontFamily: "Arial Black, Impact, sans-serif", fontStyle: "bold italic", fontSize: "23px",
        color: "#dffaff", stroke: "#124c66", strokeThickness: 3 }).setOrigin(1,0).setDepth(6);
      const caption = s.add.text(911,144,this.stage.caption,{fontFamily:"Arial, sans-serif",fontStyle:"bold",fontSize:"10px",color:"#f4cf70"})
        .setOrigin(1,0).setDepth(6);
      sign.fillStyle(C.gold,1);
      for (const x of [919,927,935]) sign.fillTriangle(x,144,x+2,149,x-2,149);
      const doorCenter = this.hasBackdrop ? this.stage.doorCenter : 859, signY = this.hasBackdrop ? this.stage.signY : 105;
      sign.setScale(0.8).setPosition(doorCenter - 866 * 0.8, signY - 137 * 0.8);
      this.stageSign.setScale(0.8).setPosition(doorCenter + 74 * 0.8, signY - 18 * 0.8);
      // Move the existing caption with the plaque so it clears the doorway lintel.
      caption.setScale(0.8).setPosition(doorCenter + 45 * 0.8, signY + 7 * 0.8);
      this.stageSignBounds = { x: doorCenter - 82 * 0.8, y: signY - 26 * 0.8, width: 164 * 0.8, height: 52 * 0.8 };
      for (const [x, text] of [[245, `${this.stage.region.toUpperCase()} / EXHIBITION`], [715, "POKEJAM  /  2v2"]]) {
        s.add.text(x, 164, text, { fontFamily: "monospace", fontSize: "11px", color: "#e8eee7" })
          .setOrigin(0.5).setDepth(6);
      }
      const table = s.add.graphics().setDepth(7);
      table.fillStyle(0x101e23).fillRect(392, 145, 174, 22);
      table.fillStyle(C.gold).fillRect(398, 151, 162, 2);
      for (const x of [425, 479, 533]) {
        table.fillStyle(0x9cb3a2).fillRect(x - 10, 137, 19, 12);
        table.fillStyle(0x263d43).fillRect(x - 7, 139, 13, 7);
      }
    }

    floorPath(g, points, color = C.line, width = 2, alpha = 1) {
      g.lineStyle(width, color, alpha).strokePoints(points.map((p) => project(p.x, p.y)), false);
    }

    ellipse(g, x, y, rx, ry, start = 0, end = Math.PI * 2, color = C.line, width = 2) {
      this.floorPath(g, Array.from({ length: 65 }, (_, i) => ({ x: x + Math.cos(start + (end - start) * i / 64) * rx,
        y: y + Math.sin(start + (end - start) * i / 64) * ry })), color, width);
    }

    drawFloor() {
      const C = this.colors;
      const g = this.scene.add.graphics().setDepth(10);
      const quad = (left, top, right, bottom) => [project(left, top), project(right, top), project(right, bottom), project(left, bottom)];
      polygon(g, quad(26, 72, 934, 519), C.jade);
      polygon(g, quad(48, 82, 912, 500), C.wood);
      // Staggered planks share the same projection as players and scoring anchors.
      for (let y = 82, row = 0; y < 500; y += 19, row += 1) {
        for (let x = 48 - (row % 2) * 70; x < 912; x += 140) {
          const l = Math.max(48, x), r = Math.min(912, x + 140);
          polygon(g, quad(l, y, r, Math.min(500, y + 19)), [0xdab786, 0xd5ae7c, 0xd1a674][(row + Math.floor(x / 140) + 12) % 3]);
          this.floorPath(g, [{ x: l, y }, { x: r, y }], 0x9b774a, 0.7, 0.25);
          this.floorPath(g, [{ x: l, y }, { x: l, y: Math.min(500, y + 19) }], 0x9b774a, 0.7, 0.25);
        }
      }
      polygon(g, quad(48, 210, 206, 364), C.jade, 0.96);
      polygon(g, quad(754, 210, 912, 364), C.jade, 0.96);
      this.floorPath(g, [{ x: 48, y: 82 }, { x: 912, y: 82 }, { x: 912, y: 500 }, { x: 48, y: 500 }, { x: 48, y: 82 }], C.line, 3);
      this.floorPath(g, [{ x: 480, y: 82 }, { x: 480, y: 500 }]);
      for (const [l, r] of [[48, 206], [754, 912]]) {
        this.floorPath(g, [{ x: l, y: 210 }, { x: r, y: 210 }, { x: r, y: 364 }, { x: l, y: 364 }]);
      }
      this.ellipse(g, 206, 287, 60, 77, -Math.PI / 2, Math.PI / 2);
      this.ellipse(g, 754, 287, 60, 77, Math.PI / 2, Math.PI * 1.5);
      this.ellipse(g, 86, 286, ARC_RX, ARC_RY, -Math.PI / 2, Math.PI / 2);
      this.ellipse(g, 874, 286, ARC_RX, ARC_RY, Math.PI / 2, Math.PI * 1.5);
      this.ellipse(g, 480, 286, 68, 68);
      this.ellipse(g, 480, 286, 48, 48, 0, Math.PI * 2, C.jade, 4);
      const mid = project(480, 286);
      g.fillStyle(C.jade).fillCircle(mid.x, mid.y, 15);
      g.fillStyle(C.line).fillCircle(mid.x, mid.y, 7);
      this.scene.add.text(480, 366, this.stage.title, { fontFamily: "Arial Black, sans-serif", fontStyle: "bold italic", fontSize: "28px",
        color: `#${C.jade.toString(16).padStart(6, "0")}` }).setOrigin(0.5).setDepth(11);
      for (const x of [110, 850]) {
        this.scene.add.text(x, 511, "POKEJAM", { fontFamily: "monospace", fontSize: "12px", color: "#e8eee7" })
          .setOrigin(0.5).setDepth(11);
      }
      g.fillStyle(0x102b29).fillRect(0, 532, 960, 8);
    }

    drawHoop(item, time) {
      const C = this.colors;
      const { hoop, back: b, front: f } = item;
      const ground = project(hoop.x, hoop.y), rim = project(hoop.x - hoop.side * 6, hoop.y, 112);
      const boardX = rim.x + hoop.side * 23;
      const hit = Math.max(0, 1 - (time - item.hitAt) / 450);
      const swing = Math.sin((time - item.hitAt) / 40) * hit * 3;
      b.clear().setDepth(Math.round(ground.y) - 8);
      f.clear().setDepth(Math.round(ground.y) + 5);
      b.lineStyle(8, 0x0c2327).lineBetween(boardX + hoop.side * 19, ground.y + 4, boardX + hoop.side * 19, rim.y - 45);
      b.lineStyle(6, 0x607677).lineBetween(boardX + hoop.side * 19, rim.y - 45, boardX, rim.y - 45);
      polygon(b, [{ x: boardX - 7, y: rim.y - 43 }, { x: boardX + 9, y: rim.y - 48 },
        { x: boardX + 9, y: rim.y + 13 }, { x: boardX - 7, y: rim.y + 18 }], 0xc7e8dd, 0.9);
      b.lineStyle(3, C.white).strokeRect(boardX - 9, rim.y - 46, 19, 63);
      b.lineStyle(2, C.red).strokeRect(boardX - 6, rim.y - 21, 12, 25);
      b.lineStyle(4, 0xea663d).strokeEllipse(rim.x, rim.y + swing, 39, 10);
      f.lineStyle(1.5, C.white, 0.95);
      for (let i = 0; i < 6; i += 1) {
        const dx = -17 + i * 6.8;
        f.lineBetween(rim.x + dx, rim.y + 4 + swing, rim.x + dx * 0.55 + swing, rim.y + 28);
      }
      f.strokeEllipse(rim.x + swing, rim.y + 17, 25, 7);
      f.strokeEllipse(rim.x + swing, rim.y + 27, 21, 6);
      f.lineStyle(4, 0xff8250).beginPath().arc(rim.x, rim.y + swing, 19, 0, Math.PI).strokePath();
      item.rim = rim;
    }

    reset() {
      this.cheerUntil = 0;
      this.officialUntil = 0;
      this.lastCrowdFrame = -1;
      for (const item of this.hoops) item.hitAt = -1000;
      this.update(this.scene.matchTime);
    }

    react(type, team, hoop) {
      const now = this.scene.matchTime;
      this.cheerUntil = now + (type === "ultimate" || type === "win" ? 2000 : 1000);
      this.officialUntil = now + 900;
      this.officialTeam = team;
      if (hoop) this.hoops.find((item) => item.hoop.side === hoop.side).hitAt = now;
    }

    update(time) {
      const C = this.colors;
      const frame = Math.floor(time / 140);
      if (frame !== this.lastCrowdFrame) {
        this.lastCrowdFrame = frame;
        const g = this.crowd.clear(), cheering = time < this.cheerUntil;
        const colors = [0xe2b971, 0xc86470, 0x56b2a3, 0xd8e3cb, 0x7496c5, 0x986abd];
        for (let row = 0; row < 3; row += 1) {
          for (let i = 0; i < 45; i += 1) {
            const x = 40 + i * 20 + row * 3, y = this.hasBackdrop ? this.stage.crowdRows[row] : 72 + row * 28;
            if ((x > 46 && x < 155 || x > 804 && x < 914) && row === 2) continue;
            const lift = cheering ? (frame + i + row) % 3 * 2 : (frame + i * 3) % 17 === 0 ? 1 : 0;
            g.fillStyle(0x172a30).fillRect(x - 4, y - 6 - lift, 9, 4);
            g.fillStyle([0xe4af88, 0xae785e, 0xf2cead][(i + row) % 3]).fillRect(x - 3, y - 4 - lift, 7, 6);
            g.fillStyle(colors[(i * 7 + row) % colors.length]).fillRect(x - 5, y + 2 - lift, 11, 9);
            if (i % 6 === 0) g.fillStyle(colors[(i + 1) % colors.length]).fillRect(x - 5, y - 7 - lift, 12, 3);
            if (i % 6 === 2) g.fillStyle(0x213437).fillRect(x - 5, y - 3 - lift, 2, 11);
            if (i % 6 === 3) g.fillStyle(0xf4cf70).fillRect(x - 1, y + 3 - lift, 2, 7);
            if (cheering && i % 15 === 0) {
              g.lineStyle(1, 0xe8eee7).lineBetween(x + 8, y + 8, x + 8, y - 17 - lift);
              g.fillStyle(colors[(i + row) % colors.length]).fillTriangle(x + 8, y - 17 - lift, x + 19, y - 12 - lift, x + 8, y - 8 - lift);
            }
            if (cheering && (i + row) % 2 === 0) {
              g.fillRect(x - 7, y - 2 - lift, 2, 9); g.fillRect(x + 6, y - 4 - lift, 2, 10);
            }
          }
        }
      }
      const r = this.official.clear(), x = 590, y = 165;
      r.fillStyle(0xedbd91).fillRect(x - 3, y - 15, 7, 6);
      r.fillStyle(C.white).fillRect(x - 5, y - 9, 11, 10);
      r.fillStyle(C.ink).fillRect(x - 4, y + 1, 3, 7).fillRect(x + 2, y + 1, 3, 7);
      for (let dx = -4; dx < 5; dx += 4) r.fillRect(x + dx, y - 9, 2, 10);
      if (time < this.officialUntil) {
        const side = this.officialTeam === "player" ? 1 : -1;
        r.fillStyle(C.white).fillRect(x + side * 7 - 3, y - 12, 10, 3);
      }
      this.hoops.forEach((item) => this.drawHoop(item, time));
      const m = this.stageMotion.clear();
      if (!this.scene.reducedEffects && this.stage.motion === "pennants") {
        for (const x of [130, 390, 650]) {
          const wave = Math.sin(time / 230 + x) * 3;
          m.lineStyle(1, C.gold, 0.65).strokePoints([{x,y:40},{x:x+12+wave,y:58},{x:x+4,y:75}], false);
        }
      } else if (this.stage.motion === "displays") {
        for (const x of [108, 330, 632, 810]) {
          m.fillStyle(C.mint, 0.4).fillRect(x, 139, 34, 2);
          const at = this.scene.reducedEffects ? 0 : Math.floor(time / 110) % 7;
          for (let j = 0; j < 7; j++) m.fillStyle(j === at ? C.white : C.mint, 0.8).fillRect(x+j*5,140,3,2);
        }
      }
    }
  }

  window.PokeJamArena = { project, isOutsideArc, IndigoArena };
}());
