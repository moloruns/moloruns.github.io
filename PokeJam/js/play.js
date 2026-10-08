(function () {
  const WIDTH = 960;
  const HEIGHT = 540;
  const FLOOR_TOP = 82;
  const FLOOR_BOTTOM = 500;
  const COURT_LEFT = 48;
  const COURT_RIGHT = 912;
  const LEFT_HOOP = { x: 86, y: 286, rimY: 154, side: -1 };
  const RIGHT_HOOP = { x: 874, y: 286, rimY: 154, side: 1 };
  const TEAM_PLAYER = "player";
  const TEAM_CPU = "cpu";
  const GRAVITY = 980;
  const PUMP_WINDOW = 150;
  const FIRE_STREAK = 3;
  const QUARTER_SECONDS = 120;
  const ULTIMATE_BLOCK_MULTIPLIER = 0.35;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (start, end, t) => start + (end - start) * t;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const norm = (x, y) => {
    const mag = Math.hypot(x, y) || 1;
    return { x: x / mag, y: y / mag };
  };

  function passingLaneGap(point, from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const t = clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return distance(point, { x: from.x + t * dx, y: from.y + t * dy });
  }

  function playablePoint(x, y) {
    return {
      x: clamp(x, COURT_LEFT + 18, COURT_RIGHT - 18),
      y: clamp(y, FLOOR_TOP + 20, FLOOR_BOTTOM - 18),
    };
  }

  function speedFor(record) {
    return 120 + record.attributes.speed * 0.9;
  }

  function shotChance(context) {
    if (typeof window.pokeJamShotChance === "function") {
      return window.pokeJamShotChance(context);
    }

    const attr = context.kind === "dunk"
      ? context.shooter.attributes.dunk
      : context.kind === "layup" ? context.shooter.attributes.layup : context.shooter.attributes.shooting;
    const rating = attr / 100;
    const timing = context.kind === "jumper" && !context.ultimate
      ? window.PokeJamTiming.bonus(context.releaseQuality)
      : (1 - Math.min(1, Math.abs(context.releaseQuality))) * 0.18;
    const effectiveDistance = context.ultimate ? Math.min(context.distanceToHoop, 160) : context.distanceToHoop;
    const distancePenalty = clamp(effectiveDistance / 650, 0, 0.56);
    const contestPenalty = clamp(context.contest / 100, 0, 0.34);
    const base = context.kind === "dunk" ? 0.72 : context.kind === "layup" ? 0.54 : 0.34;
    return clamp(base + rating * 0.35 + timing - distancePenalty - contestPenalty
      + (context.ultimate ? 0.18 : 0), context.ultimate ? 0.35 : 0.07, context.ultimate ? 0.97 : 0.94);
  }

  class MatchScene extends Phaser.Scene {
    constructor() {
      super("MatchScene");
      this.players = [];
      this.score = { player: 0, cpu: 0 };
      this.clock = QUARTER_SECONDS;
      this.shotClock = 24;
      this.shotClockRimTeam = null;
      this.quarter = 1;
      this.isPaused = false;
      this.gameOver = false;
      this.matchTime = 0;
      this.coop = false;
      this.manualControl = false;
      this.pendingInbound = null;
      this.ultimate = null;
      this.finishEvents = [];
      this.styleLedger = new window.PokeJamStyleLedger();
      this.eventSerial = 0;
      this.stylePopups = [];
      this.reducedEffects = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.possessionTeam = TEAM_PLAYER;
      this.inputs = [{}, {}];
      this.actionNeedsRelease = new Set();
      this.previewEnd = false;
      this.ball = {
        state: "held",
        holder: null,
        x: WIDTH / 2,
        y: HEIGHT / 2,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        sprite: null,
        shadow: null,
        flight: null,
      };
    }

    preload() {
      this.load.json("pokemonData", "data/pokemon.json");
      for (const stage of window.PokeJamStages.stages) this.load.image(stage.texture, stage.backdrop);
      for (const { slug } of window.PokeJamRoster.players) {
        this.load.image(slug, `assets/pokemon/${slug}.png`);
      }
      for (const [slug, record] of Object.entries(window.PokeJamAnimationManifest.players || {})) {
        for (const [action, data] of Object.entries(record.actions)) {
          this.load.spritesheet(`${slug}-${action}`, data.path, { frameWidth: data.width, frameHeight: data.height });
        }
      }
    }

    create() {
      this.records = this.cache.json.get("pokemonData").pokemon;
      this.recordsBySlug = Object.fromEntries(this.records.map((record) => [record.slug, record]));

      this.drawCourt();
      this.createHud();
      this.createControls();
      this.createTeams();
      this.animator = new window.PokeJamAnimator(this, window.PokeJamAnimationManifest);
      this.createBall();
      this.firePerks = new window.PokeJamFirePerks(this);
      this.presentation = new window.PokeJamPresentation(this);
      this.ultimateEffect = this.add.graphics().setDepth(1400);
      this.createUltimateMeters();
      this.giveBall(this.players[0]);
      this.soloPlayer = this.players[0];
      this.audio = new window.PokeJamAudio(this);
      this.createSettings();
      const mode = document.querySelector("#match-mode");
      mode.addEventListener("change", () => {
        this.coop = mode.value === "coop";
        this.restartMatch();
        document.querySelector("#switch-mon").disabled = this.coop;
        mode.blur();
      });
      document.querySelector("#pause-match").addEventListener("click", () => this.togglePause());
      document.querySelector("#restart-match").addEventListener("click", () => this.restartMatch());
      document.querySelector("#switch-mon").addEventListener("click", () => this.switchControlledPlayer());
      this.ultimateButton = document.querySelector("#ultimate-finish");
      this.ultimateButton.addEventListener("click", () => this.onUltimateDown(0));
      window.addEventListener("blur", () => {
        if (!this.isPaused && !this.gameOver) this.togglePause();
      });
      this.updateBall(0);
      for (const player of this.players) this.syncPlayerSprites(player);
      this.updateHud();
      this.matchSetup = new window.PokeJamMatchSetup(this);
      const query = new URLSearchParams(location.search);
      if ((!query.has("test") || query.get("setup") === "1") && query.get("help") !== "1") this.matchSetup.open(true);
    }

    drawCourt() {
      this.stage = this.stage || window.PokeJamStages.stages.find(stage => stage.id === window.PokeJamStages.defaultStage);
      this.arena = new window.PokeJamArena.IndigoArena(this, [LEFT_HOOP, RIGHT_HOOP], this.stage);
    }

    setStage(id) {
      const stage = window.PokeJamStages.stages.find(stage => stage.id === id);
      if (!stage) return false;
      this.arena.destroy();
      this.stage = stage;
      this.drawCourt();
      document.querySelector(".game-shell h1").textContent = stage.shortName || stage.name;
      document.querySelector(".game-shell .league-label").textContent = `${stage.region.toUpperCase()} / EXHIBITION`;
      document.querySelector(".game-frame").setAttribute("aria-label", stage.name);
      return true;
    }

    createHud() {
      this.hudBg = this.add.rectangle(WIDTH / 2, 38, 620, 64, 0x10131d, 0.96)
        .setStrokeStyle(2, 0x536077)
        .setDepth(2000);
      this.scoreText = this.add.text(WIDTH / 2, 12, "", {
        fontFamily: "monospace",
        fontSize: "24px",
        color: "#f7f7fb",
        stroke: "#000000",
        strokeThickness: 4,
      }).setOrigin(0.5, 0).setDepth(2001);
      this.possessionText = this.add.text(WIDTH / 2, 46, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#ffd166",
        stroke: "#000000",
        strokeThickness: 3,
      }).setOrigin(0.5, 0).setDepth(2001);
      this.messageText = this.add.text(WIDTH / 2, 82, "", {
        fontFamily: "monospace",
        fontSize: "22px",
        color: "#ffd166",
        stroke: "#000000",
        strokeThickness: 5,
      }).setOrigin(0.5, 0).setDepth(2001);
      this.fireText = this.add.text(WIDTH / 2, HEIGHT - 18, "", {
        fontFamily: "monospace", fontSize: "16px", fontStyle: "bold",
        color: "#ffd166", stroke: "#000000", strokeThickness: 4,
      }).setOrigin(0.5).setDepth(2001);
      this.pauseOverlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x05070c, 0.56)
        .setDepth(2500)
        .setVisible(false);
      this.pauseText = this.add.text(WIDTH / 2, HEIGHT / 2, "PAUSED", {
        fontFamily: "monospace",
        fontSize: "52px",
        color: "#ffd166",
        stroke: "#000000",
        strokeThickness: 7,
      }).setOrigin(0.5).setDepth(2501).setVisible(false);
      this.updateHud();
      this.hudBg.setVisible(false);
      this.scoreText.setVisible(false);
      this.possessionText.setVisible(false);
      this.fireText.setVisible(false);
      this.messageText.setPosition(WIDTH / 2, 144).setFontSize(18);
    }

    createControls() {
      this.keys = this.input.keyboard.addKeys({
        up: "W",
        left: "A",
        down: "S",
        right: "D",
        arrowUp: "UP",
        arrowLeft: "LEFT",
        arrowDown: "DOWN",
        arrowRight: "RIGHT",
        turbo: "SHIFT",
        action: "J",
        pass: "I",
        pause: "ESC",
        switchPlayer: "Q",
        p2Action: "K",
        p2Pass: "L",
        p2Turbo: "ENTER",
        ultimate: "E",
        p2Ultimate: "O",
      });
      for (const [index, action, pass] of [[0, "J", "I"], [1, "K", "L"]]) {
        this.input.keyboard.on(`keydown-${action}`, (event) => {
          if (!event.repeat) this.onActionDown(index);
        });
        this.input.keyboard.on(`keyup-${action}`, () => this.onActionUp(index));
        this.input.keyboard.on(`keydown-${pass}`, (event) => {
          if (!event.repeat) this.onPassDown(index);
        });
        this.input.keyboard.on(`keyup-${pass}`, () => this.onPassUp(index));
      }
      this.input.keyboard.on("keydown-ESC", (event) => {
        if (event.repeat) return;
        if (this.setupActive) return;
        const dialog = document.querySelector("dialog[open]");
        if (dialog) dialog.close();
        else this.togglePause();
      });
      this.input.keyboard.on("keydown-Q", (event) => { if (!event.repeat) this.switchControlledPlayer(); });
      this.input.keyboard.on("keydown-E", (event) => { if (!event.repeat) this.onUltimateDown(0); });
      this.input.keyboard.on("keydown-O", (event) => { if (!event.repeat) this.onUltimateDown(1); });
      this.input.keyboard.on("keydown", (event) => {
        if (!event.repeat && (event.code === "Digit0" || event.code === "Numpad0")) this.previewFinalSecond();
      });
    }

    createTeams() {
      const spawns = [{ x: 250, y: 244 }, { x: 264, y: 360 }, { x: 704, y: 242 }, { x: 712, y: 360 }];
      const starters = window.PokeJamRoster.defaultLineup.map((slug, index) => ({
        slug, team: index < 2 ? TEAM_PLAYER : TEAM_CPU, ...spawns[index],
      }));

      for (const starter of starters) {
        const record = this.recordsBySlug[starter.slug];
        const visual = window.PokeJamRoster.players.find((p) => p.slug === starter.slug).visual;
        const shadow = this.add.ellipse(starter.x, starter.y + 28, 50, 14, 0x000000, 0.32).setDepth(starter.y - 1);
        const sprite = this.add.sprite(starter.x, starter.y, starter.slug).setOrigin(0.5, 1);
        sprite.setScale(visual.staticScale);
        const name = this.add.text(starter.x, starter.y + 30, record.name, {
          fontFamily: "monospace",
          fontSize: "12px",
          color: starter.team === TEAM_PLAYER ? "#5ec8ff" : "#ff4d5a",
          stroke: "#000000",
          strokeThickness: 3,
        }).setOrigin(0.5, 0).setDepth(1600);
        const staminaBg = this.add.rectangle(starter.x, starter.y + 48, 54, 6, 0x05070c, 1)
          .setOrigin(0.5)
          .setDepth(1600);
        const staminaBar = this.add.rectangle(starter.x - 27, starter.y + 48, 54, 6, 0x64d878, 1)
          .setOrigin(0, 0.5)
          .setDepth(1601);
        const callout = this.add.text(starter.x, starter.y - 92, "!", {
          fontFamily: "monospace", fontSize: "32px", fontStyle: "bold",
          color: "#ffffff", backgroundColor: "#ff4d5a", padding: { x: 7, y: 0 },
          stroke: "#000000", strokeThickness: 2,
        }).setOrigin(0.5, 1).setDepth(1602).setVisible(false);
        const marker = this.add.text(starter.x, starter.y + 65, "", {
          fontFamily: "monospace", fontSize: "11px", color: "#ffd166",
          stroke: "#000000", strokeThickness: 3,
        }).setOrigin(0.5).setDepth(1602);
        const fireEffect = this.add.graphics();

        this.players.push({
          ...starter,
          record,
          visual,
          sprite,
          shadow,
          name,
          staminaBg,
          staminaBar,
          callout,
          marker,
          fireEffect,
          readyEffect: this.add.graphics(),
          facing: starter.team === TEAM_PLAYER ? 2 : 6,
          wasReady: false,
          z: 0,
          vz: 0,
          stamina: 100,
          hasBall: false,
          shooting: false,
          shotLocked: false,
          jockeying: false,
          dunking: false,
          dunk: null,
          alleyPrep: null,
          calling: false,
          blocking: false,
          passCharge: null,
          shootHeld: false,
          shotStartedAt: 0,
          nextActionAt: 0,
          nextShotAt: 0,
          nextCallAt: 0,
          pendingShot: null,
          fakeUntil: 0,
          makeStreak: 0,
          onFire: false,
          ultimateCharge: 0,
          ultimate: null,
          aiTarget: null,
          offBallPlan: null,
          disabledUntil: 0,
          stats: { points: 0, shots: 0, makes: 0, steals: 0, dunks: 0, blocks: 0, assists: 0 },
        });
      }
    }

    createBall() {
      this.ball.shadow = this.add.ellipse(this.ball.x, this.ball.y, 24, 8, 0x000000, 0.35).setDepth(1200);
      this.ball.sprite = this.add.circle(this.ball.x, this.ball.y, 10, 0xf47c32)
        .setStrokeStyle(2, 0x2d170b)
        .setDepth(1300);
      this.ball.seams = this.add.graphics();
    }

    setLineup(slugs) {
      const entries = slugs.map((slug) => window.PokeJamRoster.players.find((p) => p.slug === slug));
      if (slugs.length !== 4 || new Set(slugs).size !== 4 || entries.some((p) => !p)) return false;
      // Keep court-slot objects alive: aura, status and HUD effects retain their owners.
      this.players.forEach((player, index) => {
        const entry = entries[index];
        player.slug = entry.slug;
        player.record = this.recordsBySlug[entry.slug];
        player.visual = entry.visual;
        player.team = index < 2 ? TEAM_PLAYER : TEAM_CPU;
        player.sprite.anims.stop();
        player.sprite.setTexture(entry.slug).setFlipX(false);
        player.name.setText(player.record.name);
        player.shadow.setSize((entry.visual.auraRadius || 23) * 2, 14);
        player.visualAction = null;
        player.wasReady = false;
      });
      this.createUltimateMeters();
      this.restartMatch();
      return true;
    }

    releaseHeight(player) {
      return player.z + (player.visual?.ball?.release ?? 42);
    }

    showAction(player, cue, action, duration) {
      player.actionCue = cue;
      player.actionVisual = action;
      player.actionVisualStartedAt = this.matchTime;
      player.actionVisualDuration = duration;
      player.actionVisualUntil = this.matchTime + duration;
    }

    createUltimateMeters() {
      const root = document.querySelector("#ultimate-meters");
      root.replaceChildren();
      for (const player of this.players) {
        const label = document.createElement("label");
        label.className = `ultimate-meter ${player.team}`;
        const name = document.createElement("span");
        name.className = "player-name";
        name.textContent = player.record.name;
        const status = document.createElement("span");
        status.className = "ultimate-status";
        const portrait = document.createElement("img");
        portrait.className = "player-portrait";
        portrait.src = `assets/pokemon/${player.slug}.png`;
        portrait.alt = "";
        const turbo = document.createElement("progress");
        turbo.className = "turbo-meter"; turbo.max = 100; turbo.value = player.stamina;
        turbo.setAttribute("aria-label", `${player.record.name} turbo stamina`);
        const meter = document.createElement("progress");
        meter.id = `ultimate-${player.slug}`;
        meter.max = 100;
        meter.value = 0;
        meter.setAttribute("aria-label", `${player.record.name} ultimate charge`);
        label.htmlFor = meter.id;
        label.append(portrait, name, status, meter, turbo);
        root.append(label);
        player.chargeUi = { label, status, meter, turbo };
      }
    }

    addUltimateCharge(player, amount) {
      player.ultimateCharge = clamp(player.ultimateCharge + amount * (this.firePerks?.chargeScale(player) ?? 1), 0, 100);
    }

    createSettings() {
      const selects = [...document.querySelectorAll("#lineup-form select")];
      for (const [index, select] of selects.entries()) {
        select.replaceChildren(...window.PokeJamRoster.players.map((entry) => {
          const option = document.createElement("option");
          option.value = entry.slug;
          option.textContent = `${entry.name} / ${entry.region}`;
          return option;
        }));
        select.value = this.players[index].slug;
      }
      const validate = () => {
        const slugs = selects.map((select) => select.value);
        const duplicate = new Set(slugs).size !== 4;
        document.querySelector("#lineup-form button[type=submit]").disabled = duplicate;
        document.querySelector("#lineup-error").hidden = !duplicate;
        for (const select of selects) {
          const record = this.recordsBySlug[select.value];
          const profile = window.PokeJamFinishes.profileFor(record);
          const perks = this.firePerks.config({ record });
          const preview = document.querySelector(`#${select.id}-preview`);
          const image = preview.querySelector("img");
          if (image) image.src = `assets/pokemon/${record.slug}.png`;
          preview.querySelector(".lineup-rating").textContent = `${record.types.join(" / ")}  |  Overall ${record.stars.overall.toFixed(1)} / 5`;
          preview.querySelector(".lineup-finish").textContent = profile.name;
          const passives = perks.passives.map((name) => name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()));
          const moves = [...new Set([perks.active?.name, ...passives].filter(Boolean))];
          preview.querySelector(".lineup-perks").textContent = moves.join(" + ");
        }
      };
      const open = (dialog) => {
        this.dialogWasPaused = this.isPaused;
        if (!this.isPaused && !this.gameOver) this.togglePause();
        dialog.showModal();
      };
      for (const dialog of document.querySelectorAll(".arena-dialog")) {
        dialog.querySelector(".close-dialog").addEventListener("click", () => dialog.close());
        dialog.addEventListener("close", () => {
          if (!this.dialogWasPaused && this.isPaused && !this.gameOver) this.togglePause();
        });
      }
      document.querySelector("#open-settings").addEventListener("click", () => open(document.querySelector("#arena-settings")));
      document.querySelector("#how-to-play").addEventListener("click", () => open(document.querySelector("#controls-dialog")));
      document.querySelector("#choose-lineup").addEventListener("click", () => {
        this.matchSetup.open();
      });
      for (const channel of ["sfx", "crowd", "announcer"]) {
        document.querySelector(`#${channel}-volume`).addEventListener("input", (event) => {
          this.audio.volumes[channel] = Number(event.target.value);
          if (channel === "announcer" && this.audio.volumes[channel] === 0) window.speechSynthesis?.cancel();
        });
      }
      const mute = document.querySelector("#audio-toggle");
      mute.addEventListener("click", () => {
        this.audio.muted = !this.audio.muted;
        mute.setAttribute("aria-pressed", String(this.audio.muted));
        mute.setAttribute("aria-label", this.audio.muted ? "Unmute audio" : "Mute audio");
        mute.title = this.audio.muted ? "Unmute audio" : "Mute audio";
        if (this.audio.muted) this.audio.stop();
        this.audio.update();
      });
      const reduced = document.querySelector("#reduced-effects");
      reduced.checked = this.reducedEffects;
      reduced.addEventListener("change", () => { this.reducedEffects = reduced.checked; });
      for (const radio of document.querySelectorAll('[name="meter-mode"]')) {
        radio.addEventListener("change", () => { this.presentation.meterMode = radio.value; this.presentation.meters(); });
      }
      const spoken = document.querySelector("#spoken-callouts");
      spoken.disabled = !window.speechSynthesis;
      spoken.addEventListener("change", () => {
        this.audio.speech = spoken.checked;
        if (!spoken.checked) window.speechSynthesis?.cancel();
      });
      document.querySelector("#rematch").addEventListener("click", () => this.restartMatch());
      document.querySelector("#results-lineup").addEventListener("click", () => document.querySelector("#choose-lineup").click());
      document.querySelector("#lineup-form").addEventListener("submit", (event) => {
        event.preventDefault();
        if (new Set(selects.map((select) => select.value)).size !== 4) return;
        this.matchSetup.showStages();
      });
      if (new URLSearchParams(window.location.search).get("help") === "1") open(document.querySelector("#controls-dialog"));
      for (const [index, select] of selects.entries()) select.addEventListener("change", () => {
        if (index < 2) {
          const used = new Set(selects.slice(0, 2).map((item) => item.value));
          for (const cpu of selects.slice(2)) {
            if (used.has(cpu.value)) cpu.value = window.PokeJamRoster.players.find((p) => !used.has(p.slug)).slug;
            used.add(cpu.value);
          }
        }
        validate();
      });
      validate();
    }

    present(type, player, hoop = null, detail = "") {
      this.arena.react(type, player?.team || this.possessionTeam, hoop);
      this.audio?.play(type);
      this.audio?.call(type, detail);
    }

    awardStyle(event) {
      if (!event) return;
      const player = this.players.find((p) => p.slug === event.player);
      const point = window.PokeJamArena.project(player.x, player.y, player.z);
      const text = this.add.text(point.x, Math.max(183, point.y - 66), `+${event.value} ${event.category}`, {
        fontFamily: "monospace", fontSize: "12px", fontStyle: "bold", color: "#f4cf70",
        stroke: "#14272b", strokeThickness: 3,
      }).setOrigin(0.5).setDepth(1800);
      const stack = this.stylePopups.filter((popup) => popup.player === player.slug).length;
      text.y -= stack * 17;
      this.stylePopups.push({ text, at: this.matchTime, y: text.y, player: player.slug });
      if (this.stylePopups.length > 8) this.stylePopups.shift().text.destroy();
    }

    updateStylePopups() {
      this.stylePopups = this.stylePopups.filter((popup) => {
        const elapsed = this.matchTime - popup.at;
        if (elapsed > 1050) { popup.text.destroy(); return false; }
        popup.text.setY(popup.y - (this.reducedEffects ? 0 : elapsed / 70));
        popup.text.setAlpha(Math.min(1, (1050 - elapsed) / 250));
        return true;
      });
    }

    nextEventId() { return `play-${++this.eventSerial}`; }

    showResults() {
      document.querySelector("#result-title").textContent = this.resultTitle;
      document.querySelector("#result-summary").textContent = `${this.score.player} - ${this.score.cpu} / STYLE ${this.styleLedger.totals.player} - ${this.styleLedger.totals.cpu}${this.previewEnd ? " / PREVIEW" : ""}`;
      const body = document.querySelector("#result-rows");
      body.replaceChildren();
      for (const player of this.players) {
        const row = document.createElement("tr"), stats = player.stats;
        row.dataset.team = player.team;
        const values = [player.record.name, stats.points, `${stats.makes}/${stats.shots}`,
          stats.shots ? `${Math.round(stats.makes / stats.shots * 100)}%` : "0%", stats.assists || 0,
          stats.dunks, stats.steals, stats.blocks, this.styleLedger.players[player.slug] || 0];
        for (const value of values) { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); }
        body.append(row);
      }
      document.querySelector("#match-results").hidden = false;
      document.querySelector("#result-title").focus({ preventScroll: true });
      document.querySelector("#match-results").scrollIntoView({ behavior: this.reducedEffects ? "instant" : "smooth", block: "nearest" });
    }

    update(time, delta) {
      this.audio?.update();
      this.animator?.pause(this.isPaused || this.gameOver || this.setupActive);
      if (this.isPaused || this.gameOver || this.setupActive) return;
      const dt = Math.min(delta / 1000, 0.033);
      this.matchTime += dt * 1000;
      if (this.pendingInbound) {
        if (this.matchTime >= this.pendingInbound.at) {
          this.resetPlayers();
          if (!this.coop) this.manualControl = false;
          this.giveBall(this.pendingInbound.player);
          this.pendingInbound = null;
        }
      } else {
        this.clock = Math.max(0, this.clock - dt);
      }
      if (this.clock <= 0) {
        for (const player of this.players) if (player.shotAttempt && !player.shotAttempt.released) {
          const held = this.ball.holder === player;
          this.cancelAction(player);
          this.recordMiss(player);
          if (held) { this.ball.holder = null; this.ball.state = "dead"; }
        }
      }
      this.updateShotClock(dt);
      this.firePerks.update(dt);
      this.readMovement();
      this.updateCalls();
      this.updatePlayers(this.matchTime, dt);
      this.updateUltimate(dt);
      this.updateBall(dt);
      this.checkBlocks();
      this.renderUltimate();
      this.pickupLooseBall();
      this.checkOutOfBounds();
      this.updateHud();
      this.arena.update(this.matchTime);
      this.updateStylePopups();
      this.firePerks.render();
      if (this.matchTime >= this.messageUntil) this.messageText.setText("");
      if (this.clock <= 0 && !["shot", "dunk"].includes(this.ball.state) && !this.players.some((p) => p.shooting)) {
        this.endQuarter();
      }
    }

    readMovement() {
      for (let index = 0; index < 2; index += 1) {
        const arrows = index === 1 || !this.coop;
        const wasd = index === 0;
        const left = (wasd && this.keys.left.isDown) || (arrows && this.keys.arrowLeft.isDown);
        const right = (wasd && this.keys.right.isDown) || (arrows && this.keys.arrowRight.isDown);
        const up = (wasd && this.keys.up.isDown) || (arrows && this.keys.arrowUp.isDown);
        const down = (wasd && this.keys.down.isDown) || (arrows && this.keys.arrowDown.isDown);
        const dir = norm(Number(right) - Number(left), Number(down) - Number(up));
        Object.assign(this.inputs[index], { moveX: dir.x, moveY: dir.y,
          turbo: (index === 0 ? this.keys.turbo : this.keys.p2Turbo).isDown });
      }
    }

    updateShotClock(dt) {
      if (this.isPaused || this.gameOver || this.pendingInbound || this.ball.state === "dead" || this.clock <= 0 || this.shotClockRimTeam) return;
      this.shotClock = Math.max(0, this.shotClock - dt);
      if (this.shotClock > 0 || (this.ball.state === "shot" && this.ball.flight)) return;
      const offender = this.ball.holder;
      for (const player of this.players) {
        if (player === offender) {
          if ((player.dunking || player.ultimate) && player.stats.shots > 0) player.stats.shots -= 1;
          this.recordMiss(player);
          const index = this.humanIndex(player);
          if (index >= 0 && (player.shootHeld || player.pendingShot || this.keys[index === 0 ? "action" : "p2Action"].isDown)) this.actionNeedsRelease.add(index);
        }
        this.cancelAction(player);
      }
      this.inbound(this.possessionTeam === TEAM_PLAYER ? TEAM_CPU : TEAM_PLAYER, "SHOT CLOCK VIOLATION", 650);
      this.audio?.play("miss");
      this.audio?.call("shotclock");
    }

    updatePlayers(time, dt) {
      for (const player of this.players) {
        player.moving = false;
        player.turboing = false;
        this.updateShotIntent(player);
        const index = this.humanIndex(player);
        if (index >= 0) {
          if (!player.shotLocked && !player.dunking && !player.alleyPrep) {
            const input = this.inputs[index];
            this.movePlayer(player, input.moveX, input.moveY, input.turbo, dt);
          }
        } else {
          this.updateCpuMovement(player, time, dt);
        }
        this.updateJump(player, dt);
        this.updateShove(player, dt);
        this.updateKnockback(player, dt);
        this.updateDunkMotion(player, dt);
        this.updateAlleyMotion(player, dt);
      }
      this.resolvePlayerContact();
      for (const player of this.players) this.syncPlayerSprites(player);
      this.sortSprites();
    }

    resolvePlayerContact() {
      for (let i = 0; i < this.players.length; i += 1) {
        const a = this.players[i];
        for (const b of this.players.slice(i + 1)) {
          if (a.team === b.team || a.z > 25 || b.z > 25 || a.shotLocked || b.shotLocked) continue;
          const gap = distance(a, b);
          if (gap >= 42) continue;
          const dir = gap > 0 ? norm(a.x - b.x, a.y - b.y) : { x: 1, y: 0 };
          const share = a.jockeying ? 0.2 : b.jockeying ? 0.8 : 0.5;
          const overlap = 42 - gap;
          Object.assign(a, playablePoint(a.x + dir.x * overlap * share, a.y + dir.y * overlap * share));
          Object.assign(b, playablePoint(b.x - dir.x * overlap * (1 - share), b.y - dir.y * overlap * (1 - share)));
        }
      }
    }

    controlledPlayer(index = 0) {
      if (index === 1 && !this.coop) return null;
      if (this.coop) return this.players[index];
      return this.soloPlayer || this.players[0];
    }

    switchControlledPlayer() {
      if (this.coop || this.isPaused || this.gameOver || this.ball.state === "dead") return;
      const previous = this.controlledPlayer();
      if (previous.shotAttempt && !previous.shotAttempt.released) return;
      // Releasing a key after switching must not fire the old player's shot.
      if (previous.pendingShot) {
        previous.pendingShot = null;
        previous.shotLocked = false;
      }
      if (previous.shootHeld && previous.hasBall) this.releaseShot(previous);
      previous.passCharge = null;
      previous.callHeld = false;
      previous.jockeying = false;
      this.soloPlayer = this.teammate(previous);
      this.manualControl = true;
      this.flash(this.soloPlayer.record.name.toUpperCase(), 500);
      for (const player of this.players) this.syncPlayerSprites(player);
    }

    humanIndex(player) {
      if (player.team !== TEAM_PLAYER) return -1;
      if (this.coop) return this.players.indexOf(player);
      return player === this.controlledPlayer() ? 0 : -1;
    }

    teammate(player) {
      return this.players.find((other) => other.team === player.team && other !== player);
    }

    dunkRange(player) {
      const base = 72 + player.record.attributes.dunk * 1.45;
      return base + (this.firePerks?.dunkBonus(player, base) || 0);
    }

    offenseHoop(team) {
      return team === TEAM_PLAYER ? RIGHT_HOOP : LEFT_HOOP;
    }

    offBallTarget(player, holder, time) {
      const hoop = this.offenseHoop(player.team);
      const defenders = this.players.filter((other) => other.team !== player.team);
      const clearance = (point) => Math.min(...defenders.map((defender) => distance(defender, point)));
      const plan = player.offBallPlan;
      const crowded = plan && (clearance(plan.target) < 85 || distance(holder, plan.target) < 110);
      if (plan && plan.holder === holder && time < plan.until
        && (time < plan.recheckAt || (!crowded && distance(holder, plan.anchor) < 120))) return plan.target;

      const points = [
        { x: hoop.x - hoop.side * 250, y: 158 },
        { x: hoop.x - hoop.side * 250, y: 420 },
        { x: hoop.x - hoop.side * 110, y: 125 },
        { x: hoop.x - hoop.side * 110, y: 452 },
        { x: hoop.x - hoop.side * 355, y: 200 },
        { x: hoop.x - hoop.side * 355, y: 385 },
        { x: holder.x + hoop.side * 130, y: holder.y - 145 },
        { x: holder.x + hoop.side * 130, y: holder.y + 145 },
      ].map((point) => ({ ...playablePoint(point.x, point.y), role: "space" }));
      const cut = { x: hoop.x - hoop.side * 65, y: hoop.y + (holder.y < hoop.y ? 55 : -55), role: "cut" };
      if (distance(holder, hoop) < 360 && player.record.attributes.dunk >= 40
        && clearance(cut) > 110 && distance(holder, cut) > 130 && Math.random() < 0.22) points.push(cut);

      // Prefer separation from guards and an unobstructed passing lane; hold targets to avoid jitter.
      const score = (point) => {
        const lane = Math.min(...defenders.map((defender) => passingLaneGap(defender, holder, point)));
        const gap = distance(holder, point);
        return Math.min(clearance(point), 220) * 0.85 + Math.min(lane, 100) * 0.55
          + Math.min(gap, 220) * 0.25 - Math.max(0, 140 - gap) * 1.5
          - distance(player, point) * 0.06 + (point.role === "cut" ? 55 : 0);
      };
      const target = points.reduce((best, point) => score(point) > score(best) ? point : best);
      player.offBallPlan = { target, holder, anchor: { x: holder.x, y: holder.y },
        until: time + Phaser.Math.Between(1600, 2400), recheckAt: time + 600 };
      return target;
    }

    updateCpuMovement(player, time, dt) {
      if (this.ball.state === "dead" || !this.firePerks.canAct(player) || time < player.disabledUntil || time < player.fakeUntil || player.shotLocked || player.dunking || player.alleyPrep) return;

      let target;
      if (player.hasBall) {
        if (player.ultimateCharge >= 100 && !this.ultimate && time > player.nextShotAt && this.clock > 0) {
          this.startUltimate(player);
          return;
        }
        const hoop = this.offenseHoop(player.team);
        // Temporary varied targets until the developer supplies the AI hook.
        if (typeof window.pokeJamCpuTarget === "function") {
          target = window.pokeJamCpuTarget({ player, scene: this, time, dt });
        }
        target ||= player.aiTarget;
        if (!target) target = { x: hoop.x - hoop.side * 170, y: hoop.y };
        const partner = this.teammate(player);
        if (this.humanIndex(partner) >= 0 && partner.callHeld && time - partner.callStartedAt >= 180) {
          const nearRim = distance(partner, hoop) <= this.dunkRange(partner) + 35;
          if ((nearRim && partner.z > 28) || !nearRim) {
            this.passBall(player, partner, nearRim);
            return;
          }
        }
        if (this.clock > 0 && time > player.nextShotAt && distance(player, target) < 34) {
          player.nextShotAt = time + 1800;
          const guarded = this.contestFor(player) > 55;
          if (guarded && partner && distance(player, partner) > 100 && Math.random() < 0.5) {
            this.passBall(player, partner, false);
          } else if (distance(player, hoop) <= this.dunkRange(player)) {
            this.startDunk(player);
          } else {
            this.startShot(player, false);
            const error = Phaser.Math.Between(-160, 160) * (1.1 - player.record.attributes.shooting / 200);
            player.cpuReleaseAt = time + 520 + error;
          }
        }
      } else if (this.ball.holder) {
        if (this.ball.holder.team === player.team) {
          const hoop = this.offenseHoop(player.team);
          const settingUp = this.ball.holder.passCharge?.to === player;
          target = settingUp
            ? { x: hoop.x - hoop.side * 42, y: hoop.y + 12 }
            : this.offBallTarget(player, this.ball.holder, time);
        } else {
          const handler = this.ball.holder;
          const partner = this.teammate(player);
          const guarding = distance(player, handler) <= distance(partner, handler);
          const opponent = guarding ? handler : this.teammate(handler);
          const hoop = this.offenseHoop(handler.team);
          const dir = norm(hoop.x - opponent.x, hoop.y - opponent.y);
          target = { x: opponent.x + dir.x * 48, y: opponent.y + dir.y * 48 };
          if (guarding && (handler.shooting || handler.dunking || handler.pendingShot || time < handler.fakeUntil)
            && distance(player, handler) < 125) {
            this.tryBlock(player);
          } else if (guarding && distance(player, handler) < 65 && time > (player.nextStealAt || 0)) {
            player.nextStealAt = time + 1600;
            if (player.record.attributes.power > handler.record.attributes.power + 10 && Math.random() < 0.15) {
              if (!this.tryShove(player)) this.trySteal(player, handler);
            } else this.trySteal(player, handler);
          }
        }
      } else {
        const flight = this.ball.flight;
        if (flight?.shooter && flight.shooter.team !== player.team && flight.elapsed < 0.28 && distance(player, flight.shooter) < 120) {
          this.tryBlock(player);
        }
        target = this.ball.state === "pass" && flight.to === player ? { x: player.x, y: player.y }
          : flight?.hoop ? { x: flight.hoop.x - flight.hoop.side * 60, y: flight.hoop.y + (player.slug === "snorlax" ? 35 : -35) }
          : { x: this.ball.x, y: this.ball.y };
      }
      if (distance(player, target) < 8) return;
      const dir = norm(target.x - player.x, target.y - player.y);
      this.movePlayer(player, dir.x, dir.y, false, dt);
    }

    movePlayer(player, x, y, turbo, dt) {
      if (this.matchTime < player.disabledUntil || this.ball.state === "dead" || this.firePerks.locked(player)) return;
      if (this.firePerks.status(player, "confusion")) { x = -x; y = -y; }
      if (Math.abs(x) + Math.abs(y) < 0.05) {
        player.stamina = clamp(player.stamina + 28 * dt, 0, 100);
        return;
      }
      const canTurbo = turbo && player.stamina > 4;
      player.moving = true;
      player.turboing = canTurbo;
      player.facing = (2 - Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8;
      const guarded = player.hasBall && this.players.some((other) => other.team !== player.team
        && other.jockeying && distance(other, player) < 85);
      const pace = speedFor(player.record) * (canTurbo ? 1.34 : 1) * (player.jockeying ? 0.82 : 1) * (guarded ? 0.7 : 1) * this.firePerks.moveScale(player);
      player.stamina = clamp(player.stamina + (canTurbo && !player.onFire ? -34 : 18) * dt, 0, 100);
      const next = playablePoint(player.x + x * pace * dt, player.y + y * pace * dt);
      player.visualPace = dt > 0 ? distance(player, next) / dt : 0;
      player.x = next.x;
      player.y = next.y;
    }

    updateJump(player, dt) {
      if (player.dunking || player.alleyPrep || player.ultimate) return;
      if (player.cpuReleaseAt && this.matchTime >= player.cpuReleaseAt && this.firePerks.canAct(player)) {
        player.cpuReleaseAt = 0;
        this.releaseShot(player);
      }
      if (player.z <= 0 && player.vz <= 0) return;
      if (player.blocking && player.blockDirection && player.vz > 0) {
        const next = playablePoint(player.x + player.blockDirection.x * 100 * dt,
          player.y + player.blockDirection.y * 100 * dt);
        player.x = next.x;
        player.y = next.y;
      }
      player.z += player.vz * dt;
      player.vz -= GRAVITY * dt;
      if (player.z <= 0) {
        player.z = 0;
        player.vz = 0;
        if (player.hasBall && player.shootHeld) {
          this.travel(player);
        } else if (player.hasBall && player.shotAttempt && !player.shotAttempt.released) {
          this.travel(player);
        }
        player.shooting = false;
        player.shotLocked = false;
        player.blocking = false;
        if (player.awaitingFinish && player.hasBall) {
          player.awaitingFinish = false;
          this.dropBall(player);
          this.flash("MISSED OOP");
        }
      }
    }

    updateDunkMotion(player, dt) {
      if (!player.dunking || !player.dunk) return;
      const dunk = player.dunk;
      dunk.elapsed += dt;
      const t = Math.min(1, dunk.elapsed / dunk.duration);
      player.x = lerp(dunk.from.x, dunk.target.x, Math.min(1, t / 0.7));
      player.y = lerp(dunk.from.y, dunk.target.y, Math.min(1, t / 0.7));
      player.z = lerp(dunk.from.z, 0, t) + Math.sin(t * Math.PI) * 120;
      if (!dunk.finished && t >= 0.72 && player.hasBall) {
        dunk.finished = true;
        this.finishDunk(player, dunk);
      }
      if (t >= 1) {
        player.dunking = false;
        player.dunk = null;
        player.shotLocked = false;
        player.z = 0;
        player.vz = 0;
      }
    }

    syncPlayerSprites(player) {
      const point = window.PokeJamArena.project(player.x, player.y, player.z);
      const ground = window.PokeJamArena.project(player.x, player.y);
      player.sprite.setPosition(point.x, point.y);
      this.animator?.sync(player, point);
      if (this.matchTime < player.reachUntil) player.sprite.setTint(0xffd166);
      else if (player.blocking) player.sprite.setTint(0x5ec8ff);
      else if (player.onFire) player.sprite.setTint(0xffd166);
      else player.sprite.clearTint();
      player.shadow.setPosition(ground.x, ground.y + 5);
      player.shadow.setScale(ground.scale * (1 - Math.min(player.z / 260, 0.45)), ground.scale);
      const body = this.animator?.bodyMetrics.get(player.slug)?.target ?? 60;
      const labelY = Math.min(504, ground.y + Math.max(10, body * ground.scale * 0.4));
      player.name.setPosition(ground.x, labelY).setColor(player.team === TEAM_PLAYER ? "#9df4d9" : "#ffa7ac");
      player.staminaBg.setPosition(ground.x, labelY + 16);
      player.staminaBar.setPosition(ground.x - 27, labelY + 16);
      player.staminaBar.width = 54 * (player.stamina / 100);
      player.callout.setPosition(point.x, Math.max(181, point.y - 44)).setVisible(player.calling);
      const index = this.humanIndex(player);
      player.name.setVisible(index >= 0);
      player.staminaBg.setVisible(false);
      player.staminaBar.setVisible(false);
      player.marker.setPosition(ground.x - player.name.width / 2 - 15, labelY + 5).setText(index >= 0 ? `P${index + 1}` : "");
      const ring = player.readyEffect.clear().setDepth(Math.round(ground.y) - 3);
      if (player.turboing && player.moving && !this.reducedEffects && player.z === 0) {
        const angle = (2 - player.facing) * Math.PI / 4;
        for (let i = 0; i < 3; i += 1) {
          const offset = 16 + i * 11 + (this.matchTime / 70 % 4);
          const dust = window.PokeJamArena.project(player.x - Math.cos(angle) * offset,
            player.y - Math.sin(angle) * offset);
          ring.fillStyle(0xfff3d5, 0.45 - i * 0.1).fillRect(dust.x - 3, dust.y + 4, 6 - i, 3);
        }
      }
      if (player.ultimateCharge >= 100 || index >= 0) {
        const ready = player.ultimateCharge >= 100;
        ring.lineStyle(ready ? 3 : 2, ready ? window.PokeJamFinishes.profileFor(player.record).color
          : player.team === TEAM_PLAYER ? 0x38bd9f : 0xdd5263, 0.85);
        ring.strokeEllipse(ground.x, ground.y + 6, ready ? 60 : 48, 17);
        if (ready) {
          ring.fillStyle(0xf4cf70).fillTriangle(ground.x + 32, ground.y, ground.x + 38, ground.y + 6, ground.x + 32, ground.y + 12);
        }
      }
      this.drawFireEffect(player);
    }

    drawFireEffect(player) {
      const g = player.fireEffect;
      const point = window.PokeJamArena.project(player.x, player.y, player.z);
      g.clear().setPosition(point.x, point.y - 13).setDepth(Math.round(window.PokeJamArena.project(player.x, player.y).y) - 1);
      if (!player.onFire) return;
      for (let i = 0; i < (this.reducedEffects ? 3 : 7); i += 1) {
        const x = (i - 3) * 10;
        const height = 22 + (1 + Math.sin(this.matchTime / 90 + i * 2)) * 13;
        g.fillStyle(0xff4d32, 0.85);
        g.fillTriangle(x - 9, 6, x + 9, 6, x + Math.sin(this.matchTime / 130 + i) * 5, -height);
        g.fillStyle(0xffd166, 0.95);
        g.fillTriangle(x - 4, 6, x + 4, 6, x, -height * 0.6);
      }
    }

    sortSprites() {
      const labels = [];
      for (const player of this.players) {
        const depth = Math.round(window.PokeJamArena.project(player.x, player.y).y);
        player.shadow.setDepth(depth - 2);
        player.sprite.setDepth(depth);
        player.name.setDepth(1600);
        player.staminaBg.setDepth(1600);
        player.staminaBar.setDepth(1601);
        if (player.name.visible) {
          const nearby = labels.find((other) => Math.abs(other.x - player.name.x) < 95 && Math.abs(other.y - player.name.y) < 32);
          if (nearby) {
            player.name.y = Math.min(505, player.name.y + 32);
            player.marker.y = player.name.y + 15;
          }
          labels.push({ x: player.name.x, y: player.name.y });
        }
      }
    }

    onActionDown(index = 0) {
      const actor = this.controlledPlayer(index);
      if (!this.isPaused && !this.gameOver && actor && this.firePerks.mash(actor, "J")) return;
      if (this.isPaused || this.gameOver || this.ball.state === "dead" || this.clock <= 0
        || this.actionNeedsRelease.has(index) || document.querySelector("dialog[open]")) return;
      const controlled = this.controlledPlayer(index);
      if (!controlled) return;
      if (!this.firePerks.canAct(controlled)) return;
      if (this.ball.holder === controlled) {
        if (this.shotClock <= 0) return;
        if (controlled.awaitingFinish) {
          this.startDunk(controlled, true);
        } else {
          this.beginShotIntent(controlled, index);
        }
      } else if (this.isOpponentShooting(controlled)) {
        this.tryBlock(controlled);
      } else if (this.ball.holder && this.ball.holder.team !== controlled.team) {
        this.trySteal(controlled, this.ball.holder);
      } else if (this.ball.state === "alley" && this.ball.flight.to === controlled) {
        controlled.finishQueued = true;
      } else if (this.ball.state === "loose" && controlled.z === 0) {
        controlled.vz = 400;
      }
    }

    onUltimateDown(index = 0) {
      if (this.isPaused || this.gameOver || this.clock <= 0 || this.shotClock <= 0) return;
      const player = this.controlledPlayer(index);
      if (!player) return;
      const forceDunk = (index === 0 ? this.keys.turbo : this.keys.p2Turbo).isDown;
      this.startUltimate(player, forceDunk);
    }

    startUltimate(player, forceDunk = false, perkProfile = null) {
      if (this.isPaused || this.gameOver || this.ultimate || this.clock <= 0 || this.shotClock <= 0
        || !this.firePerks.canAct(player) || this.ball.holder !== player || (!perkProfile && player.ultimateCharge < 100) || player.shotLocked
        || player.z > 0 || this.matchTime < player.disabledUntil) return false;
      const profile = perkProfile || window.PokeJamFinishes.profileFor(player.record, forceDunk);
      const hoop = this.offenseHoop(player.team);
      const source = { x: player.x, y: player.y };
      this.ultimate = {
        shooter: player, profile, hoop, source, stage: "windup", elapsed: 0,
        duration: 0.65, progress: 0, trail: [], resolved: false,
        points: this.pointsFrom(source, player.team),
      };
      if (!perkProfile) player.ultimateCharge = 0;
      player.ultimate = this.ultimate;
      player.pendingShot = null;
      player.passCharge = null;
      player.shootHeld = false;
      player.shotAttempt = null;
      player.shooting = true;
      player.shotLocked = true;
      player.vz = 0;
      player.stats.shots += 1;
      player.facing = hoop.side > 0 ? 2 : 6;
      this.ball.state = "ultimate";
      this.flash(profile.name.toUpperCase(), 2100);
      this.present("ultimate", player, null, `${player.record.name}: ${profile.name}!`);
      return true;
    }

    updateUltimate(dt) {
      const ultimate = this.ultimate;
      if (!ultimate) return;
      ultimate.elapsed += dt;
      ultimate.progress = Math.min(1, ultimate.elapsed / ultimate.duration);
      const player = ultimate.shooter;
      const t = ultimate.progress;
      if (ultimate.stage === "windup") {
        player.z = ultimate.profile.kind === "jumper" ? Math.sin(t * Math.PI / 2) * 86 : Math.sin(t * Math.PI) * 18;
        if (t >= 1) {
          if (ultimate.profile.kind === "dunk") {
            ultimate.stage = "drive";
            ultimate.elapsed = 0;
            ultimate.duration = clamp(distance(ultimate.source, ultimate.hoop) / 1050, 0.55, 1.1);
          } else this.launchUltimateFlight(ultimate);
        }
      } else if (ultimate.stage === "drive") {
        const travel = Math.min(1, t / 0.78);
        player.x = lerp(ultimate.source.x, ultimate.hoop.x - ultimate.hoop.side * 6, travel);
        player.y = lerp(ultimate.source.y, ultimate.hoop.y, travel);
        player.z = Math.sin(t * Math.PI) * 155;
        if (ultimate.profile.effect === "wheel") player.sprite.setRotation(t * Math.PI * 6);
        if (t >= 0.78) this.launchUltimateFlight(ultimate);
      } else if (ultimate.stage === "impact" && t >= 1) {
        this.ultimate = null;
        this.ultimateEffect.clear();
      }
      this.syncPlayerSprites(player);
      this.sortSprites();
    }

    launchUltimateFlight(ultimate) {
      const { shooter, profile, hoop } = ultimate;
      ultimate.stage = "flight";
      ultimate.elapsed = 0;
      ultimate.duration = profile.kind === "dunk" ? 0.24 : 1.1 + distance(ultimate.source, hoop) / 2000;
      shooter.ultimate = null;
      shooter.sprite.setRotation(0);
      shooter.vz = profile.kind === "dunk" ? -150 : 80;
      this.showAction(shooter, "ultimate", "Attack", 450);
      shooter.hasBall = false;
      const chance = profile.perk ? 1 : this.chanceFor(shooter, profile.kind, 0, distance(ultimate.source, hoop), true);
      this.ball.holder = null;
      this.ball.state = "shot";
      const from = { x: shooter.x, y: shooter.y, z: this.releaseHeight(shooter) };
      const to = { x: hoop.x - hoop.side * 6, y: hoop.y,
        z: hoop.y - hoop.rimY - (profile.kind === "dunk" ? 48 : 20) };
      // Energy projectiles need a lower arc than ordinary basketball shots.
      const arc = Math.min(110, Math.max(0, Math.min(from.y - from.z, to.y - to.z) - 135));
      this.ball.flight = {
        from, to,
        elapsed: 0, duration: ultimate.duration, arc: profile.kind === "dunk" ? 8 : arc,
        made: profile.perk || Math.random() < chance,
        points: ultimate.points, kind: profile.kind, shooter, hoop, ultimate,
        id: this.nextEventId(), period: this.quarter,
        assist: this.assistFor(shooter), fakeBite: this.matchTime < shooter.fakeBiteUntil,
      };
    }

    renderUltimate() {
      this.presentation?.update(0);
      const ultimate = this.ultimate;
      if (!ultimate) return;
      const projectedHoop = window.PokeJamArena.project(ultimate.hoop.x, ultimate.hoop.y);
      const rim = window.PokeJamArena.project(ultimate.hoop.x - ultimate.hoop.side * 6, ultimate.hoop.y, 112);
      const display = this.ballDisplayPosition();
      const position = ultimate.stage === "impact" ? rim : window.PokeJamArena.project(display.x, display.y, display.z);
      const last = ultimate.trail[ultimate.trail.length - 1];
      if (ultimate.stage !== "impact" && (!last || distance(last, position) > 8)) {
        ultimate.trail.push(position);
        if (ultimate.trail.length > 16) ultimate.trail.shift();
      }
      window.PokeJamFinishes.render(this.ultimateEffect, {
        ...ultimate, source: window.PokeJamArena.project(ultimate.source.x, ultimate.source.y),
        hoop: { ...ultimate.hoop, x: projectedHoop.x, y: projectedHoop.y, rimY: rim.y },
        position, time: this.reducedEffects ? 0 : this.matchTime,
      });
    }

    recordUltimateResult(ultimate, made, reason) {
      if (ultimate.resolved) return;
      ultimate.resolved = true;
      this.finishEvents.push({
        player: ultimate.shooter.slug, team: ultimate.shooter.team, name: ultimate.profile.name,
        type: ultimate.profile.type, kind: ultimate.profile.kind, signature: ultimate.profile.signature,
        made, reason, points: made ? ultimate.points : 0,
        styleValue: made ? ultimate.profile.styleValue : 0, time: this.matchTime,
      });
    }

    cancelUltimate(reason = "interrupted") {
      if (!this.ultimate) return;
      if (reason !== "reset") this.recordUltimateResult(this.ultimate, false, reason);
      const player = this.ultimate.shooter;
      player.ultimate = null;
      player.sprite.setRotation(0);
      this.ultimate = null;
      this.ultimateEffect.clear();
      this.presentation?.dimmer.setAlpha(0);
    }

    onActionUp(index = 0) {
      this.actionNeedsRelease.delete(index);
      const controlled = this.controlledPlayer(index);
      if (this.gameOver) return;
      if (this.isPaused) {
        if (controlled?.shotAttempt && !controlled.shotAttempt.released && controlled.hasBall) {
          controlled.pausedRelease = this.matchTime - controlled.shotAttempt.startedAt;
        }
        return;
      }
      if (controlled && !this.firePerks.canAct(controlled)) { controlled.pendingShot = null; controlled.shootHeld = false; return; }
      if (controlled?.pendingShot && controlled.hasBall) {
        const elapsed = this.matchTime - controlled.pendingShot.startedAt;
        if (elapsed < PUMP_WINDOW && !controlled.pendingShot.turbo) {
          this.pumpFake(controlled);
        } else {
          this.commitShotIntent(controlled);
          if (controlled.shootHeld) this.releaseShot(controlled);
        }
        return;
      }
      if (controlled && this.ball.holder === controlled && controlled.shootHeld) {
        this.releaseShot(controlled);
      }
    }

    beginShotIntent(player, index) {
      if (!this.firePerks.canAct(player)) return;
      if (player.shotLocked || player.z > 0 || this.matchTime < player.fakeUntil) return;
      player.passCharge = null;
      player.pendingShot = { startedAt: this.matchTime,
        turbo: (index === 0 ? this.keys.turbo : this.keys.p2Turbo).isDown };
      player.shotLocked = true;
      if (player.pendingShot.turbo) this.commitShotIntent(player);
    }

    updateShotIntent(player) {
      if (player.pendingShot && this.matchTime - player.pendingShot.startedAt >= PUMP_WINDOW) {
        this.commitShotIntent(player);
      }
    }

    commitShotIntent(player) {
      if (!player.pendingShot) return;
      player.pendingShot = null;
      player.shotLocked = false;
      if (!player.hasBall || this.clock <= 0 || this.shotClock <= 0) return;
      if (distance(player, this.offenseHoop(player.team)) <= this.dunkRange(player)) this.startDunk(player);
      else this.startShot(player);
    }

    pumpFake(player) {
      player.pendingShot = null;
      player.shotLocked = false;
      player.fakeUntil = this.matchTime + 220;
      player.z = 0;
      player.vz = 0;
      player.shooting = false;
      player.shootHeld = false;
      if (this.players.some((defender) => defender.team !== player.team && defender.blocking && distance(defender, player) < 125)) {
        player.fakeBiteUntil = this.matchTime + 5000;
      }
      this.flash("PUMP FAKE", 500);
    }

    onPassDown(index = 0) {
      const actor = this.controlledPlayer(index);
      if (!this.isPaused && !this.gameOver && actor && this.firePerks.mash(actor, "I")) return;
      if (this.isPaused || this.gameOver || this.ball.state === "dead") return;
      const controlled = this.controlledPlayer(index);
      if (!controlled) return;
      if (!this.firePerks.canAct(controlled)) return;
      if (this.possessionTeam !== controlled.team && (index === 0 ? this.keys.turbo : this.keys.p2Turbo).isDown) {
        this.tryShove(controlled);
        return;
      }
      if (this.ball.holder === controlled) {
        if (!controlled.shotLocked) {
          controlled.passCharge = { to: this.teammate(controlled), startedAt: this.matchTime };
        }
      } else if (this.ball.holder?.team !== controlled.team && this.possessionTeam !== controlled.team) {
        controlled.jockeying = true;
      } else {
        controlled.callHeld = true;
        controlled.callStartedAt = this.matchTime;
      }
    }

    onPassUp(index = 0) {
      const controlled = this.controlledPlayer(index);
      if (!controlled) return;
      controlled.jockeying = false;
      controlled.callHeld = false;
      if (!this.firePerks.canAct(controlled)) { controlled.passCharge = null; return; }
      if (this.isPaused || this.gameOver) return;
      if (controlled.passCharge && controlled.hasBall) {
        const to = controlled.passCharge.to;
        controlled.passCharge = null;
        const alley = to.z > 28 && (to.alleyPrep || to.calling)
          && distance(to, this.offenseHoop(controlled.team)) < this.dunkRange(to) + 45;
        this.passBall(controlled, to, alley);
      }
    }

    updateCalls() {
      for (const player of this.players) {
        if (!this.firePerks.canAct(player)) { player.calling = false; continue; }
        const holder = this.ball.holder;
        const offense = holder && holder !== player && holder.team === player.team;
        const human = this.humanIndex(player) >= 0;
        const nearRim = distance(player, this.offenseHoop(player.team)) <= this.dunkRange(player) + 35;
        player.calling = Boolean(offense && (human ? player.callHeld : nearRim));
        const charged = offense && holder.passCharge?.to === player
          && this.matchTime - holder.passCharge.startedAt >= 180;
        if (charged && nearRim && (!human || player.callHeld) && !player.alleyPrep
          && !player.dunking && player.z === 0 && this.matchTime >= player.nextCallAt) {
          this.prepareAlley(player);
        }
        if (human && player.callHeld && nearRim && offense && !player.alleyPrep
          && player.z === 0 && this.matchTime >= player.nextCallAt) {
          this.prepareAlley(player);
        }
      }
    }

    prepareAlley(player) {
      const hoop = this.offenseHoop(player.team);
      player.alleyPrep = { elapsed: 0, duration: 1.3,
        from: { x: player.x, y: player.y }, target: { x: hoop.x - hoop.side * 35, y: hoop.y } };
      player.shotLocked = true;
      player.vz = 0;
    }

    updateAlleyMotion(player, dt) {
      if (!player.alleyPrep) return;
      const prep = player.alleyPrep;
      prep.elapsed += dt;
      const t = Math.min(1, prep.elapsed / prep.duration);
      player.x = lerp(prep.from.x, prep.target.x, Math.min(1, t * 2));
      player.y = lerp(prep.from.y, prep.target.y, Math.min(1, t * 2));
      player.z = Math.sin(t * Math.PI) * 155;
      if (t >= 1) {
        player.alleyPrep = null;
        player.shotLocked = false;
        player.nextCallAt = this.matchTime + 180;
        player.z = 0;
        if (player.awaitingFinish && player.hasBall) {
          player.awaitingFinish = false;
          this.dropBall(player);
          this.flash("MISSED OOP");
        }
      }
    }

    startShot(player, held = true) {
      if (!this.firePerks.canAct(player)) return;
      if (player.z > 0 || player.shotLocked) return;
      player.passCharge = null;
      player.shooting = true;
      player.shotLocked = true;
      player.vz = 520;
      player.shootHeld = held;
      player.shotStartedAt = this.matchTime;
      player.shotAttempt = { id: this.nextEventId(), startedAt: this.matchTime, target: window.PokeJamTiming.target,
        window: window.PokeJamTiming.window, kind: distance(player, this.offenseHoop(player.team)) < 145 ? "layup" : "jumper",
        released: false, displayUntil: 0 };
      player.facing = this.offenseHoop(player.team).side > 0 ? 2 : 6;
    }

    releaseShot(player, elapsed = this.matchTime - player.shotStartedAt) {
      if (!this.firePerks.canAct(player) || this.ball.holder !== player || player.shotAttempt?.released || this.clock <= 0 || this.shotClock <= 0) return;
      const quality = elapsed / 1000 - (player.shotAttempt?.target ?? 0.52);
      if (player.shotAttempt) Object.assign(player.shotAttempt, { released: true, releaseAt: player.shotStartedAt + elapsed,
        grade: window.PokeJamTiming.grade(quality, player.shotAttempt.window), displayUntil: this.matchTime + 850 });
      const hoop = this.offenseHoop(player.team);
      const kind = distance(player, hoop) < 145 ? "layup" : "jumper";
      player.shootHeld = false;
      this.shoot(player, kind, quality);
    }

    startDunk(player, alley = false) {
      if (!this.firePerks.canAct(player)) return;
      if (this.ball.holder !== player || player.dunking || (!alley && player.shotLocked)) return;
      const hoop = this.offenseHoop(player.team);
      if (distance(player, hoop) > this.dunkRange(player) + (alley ? 45 : 0)) return;
      player.passCharge = null;
      player.awaitingFinish = false;
      player.finishQueued = false;
      player.alleyPrep = null;
      player.shooting = false;
      player.shootHeld = false;
      player.shotAttempt = null;
      player.dunking = true;
      player.alleyFinish = alley;
      player.facing = hoop.side > 0 ? 2 : 6;
      player.shotLocked = true;
      player.vz = 0;
      player.dunk = { from: { x: player.x, y: player.y, z: player.z },
        target: { x: hoop.x - hoop.side * 6, y: hoop.y }, hoop,
        points: this.pointsFrom(player, player.team),
        distance: distance(player, hoop), elapsed: 0, duration: alley ? 0.48 : 0.9, finished: false };
      this.ball.state = "dunk";
      player.stats.shots += 1;
      this.flash(alley ? "ALLEY-OOP" : "TO THE RIM");
    }

    finishDunk(player, dunk) {
      const chance = this.chanceFor(player, "dunk", 0, dunk.distance);
      if (Math.random() < chance) {
        this.launchBall(player, dunk.hoop, true, dunk.points ?? this.pointsFrom(dunk.from || player, player.team), "dunk");
      } else {
        this.recordMiss(player);
        this.dropBall(player, dunk.hoop);
        this.shotClockRimTeam = player.team;
        this.flash("RIMMED OUT");
        this.audio?.play("miss");
      }
    }

    shoot(player, kind, releaseQuality) {
      if (this.ball.holder !== player) return;
      const hoop = this.offenseHoop(player.team);
      const chance = this.chanceFor(player, kind, releaseQuality, distance(player, hoop));
      const made = Math.random() < chance;
      const points = this.pointsFrom(player, player.team);
      player.stats.shots += 1;
      this.launchBall(player, hoop, made, points, kind);
    }

    pointsFrom(point, team) {
      return window.PokeJamArena.isOutsideArc(point, this.offenseHoop(team)) ? 3 : 2;
    }

    chanceFor(player, kind, releaseQuality, distanceToHoop, ultimate = false) {
      const chance = shotChance({
        shooter: player.record,
        kind,
        releaseQuality,
        distanceToHoop,
        contest: this.contestFor(player),
        onFire: player.onFire,
        ultimate,
      });
      return player.onFire ? clamp(chance + 0.12, 0, 0.98) : chance;
    }

    recordBucket(scorer) {
      this.addUltimateCharge(scorer, 35);
      for (const opponent of this.players.filter((player) => player.team !== scorer.team)) this.firePerks.extinguish(opponent);
      scorer.makeStreak += 1;
      if (scorer.onFire) scorer.fireRemaining += 5000;
      else if (scorer.makeStreak >= FIRE_STREAK) {
        scorer.onFire = true;
        scorer.stamina = 100;
        this.flash(`${scorer.record.name.toUpperCase()} IS ON FIRE!`, 1700);
        this.present("fire", scorer);
        this.firePerks.ignite(scorer);
      }
    }

    recordMiss(player) {
      player.makeStreak = 0;
      player.fakeBiteUntil = 0;
    }

    travel(player) {
      if (!player.shotAttempt || player.shotAttempt.released || this.ball.holder !== player) return;
      const index = this.humanIndex(player);
      if (index >= 0) this.actionNeedsRelease.add(index);
      this.cancelAction(player);
      this.recordMiss(player);
      this.inbound(player.team === TEAM_PLAYER ? TEAM_CPU : TEAM_PLAYER, "TRAVEL / UP AND DOWN");
      this.presentation.clear();
      this.audio?.play("miss");
    }

    shoveProtected(target) {
      return target.z > 0 || target.dunking || target.alleyPrep || target.ultimate
        || (this.ultimate?.shooter === target && this.ultimate.stage !== "impact")
        || this.matchTime < (target.shoveImmuneUntil || 0);
    }

    tryShove(player) {
      if (this.isPaused || this.gameOver || this.ball.state === "dead" || player.hasBall || player.z > 0
        || !this.firePerks.canAct(player) || player.shotLocked || this.matchTime < player.disabledUntil || this.matchTime < player.nextActionAt
        || player.stamina < 20 || this.possessionTeam === player.team) return false;
      const angle = (2 - player.facing) * Math.PI / 4, aim = {x:Math.cos(angle),y:Math.sin(angle)};
      const targets = this.players.filter(p => p.team !== player.team && !this.shoveProtected(p))
        .filter(p => { const dir = norm(p.x-player.x,p.y-player.y); return distance(player,p) <= 88 && dir.x*aim.x+dir.y*aim.y >= 0.15; })
        .sort((a,b) => distance(player,a)-distance(player,b));
      const target = targets[0];
      // Close, front-facing contact gets mild aim assistance, not a lunge or teleport.
      player.shove = { target, elapsed: 0, duration: 0.28, impacted: false,
        aim: target ? norm(target.x-player.x,target.y-player.y) : aim };
      player.stamina -= 20;
      player.nextActionAt = this.matchTime + 900;
      player.shotLocked = true;
      player.jockeying = false;
      player.passCharge = null;
      this.showAction(player, "shove", "Attack", 360);
      return true;
    }

    updateShove(player, dt) {
      const shove = player.shove;
      if (!shove) return;
      shove.elapsed += dt;
      if (!shove.impacted && shove.elapsed >= 0.085) {
        shove.impacted = true;
        const target = shove.target, dir = target ? norm(target.x-player.x,target.y-player.y) : shove.aim;
        const reachable = target && !this.shoveProtected(target) && distance(player,target) <= 88
          && dir.x*shove.aim.x+dir.y*shove.aim.y >= 0.15;
        const strength = this.firePerks.defenseScale(player);
        const chance = target ? clamp(0.72 + (player.record.attributes.power-target.record.attributes.power)/240,0.45,0.9) * strength : 0;
        if (reachable && Math.random() < chance) {
          shove.hit = true;
          const hadBall = this.ball.holder === target;
          this.cancelAction(target);
          target.disabledUntil = this.matchTime + 260 * strength;
          target.shoveImmuneUntil = this.matchTime + 1100;
          const push = (this.firePerks.takeDown(player) ? 128 : 48) * strength;
          target.knockback = { from:{x:target.x,y:target.y}, to:playablePoint(target.x+dir.x*push,target.y+dir.y*push),elapsed:0 };
          if (hadBall) {
            this.recordMiss(target);
            this.setLooseBall(target.x+dir.x*18,target.y+dir.y*18,dir.x*140,dir.y*140,85);
          }
          const stunChance = clamp(0.18 + (player.record.attributes.power - target.record.attributes.power) / 400, 0.1, 0.35) * strength;
          if (Math.random() < stunChance) this.firePerks.apply(player, target, "stun");
          this.present("shove", player);
          this.flash("SHOVE", 450);
        } else this.flash("SHOVE MISSED", 400);
      }
      if (shove.elapsed >= shove.duration) { player.shove = null; player.shotLocked = false; }
    }

    updateKnockback(player, dt) {
      if (!player.knockback) return;
      const k = player.knockback;
      k.elapsed += dt;
      const t = Math.min(1, k.elapsed / 0.16);
      player.x = lerp(k.from.x,k.to.x,t); player.y = lerp(k.from.y,k.to.y,t);
      if (t === 1) player.knockback = null;
    }

    contestFor(shooter) {
      const defenders = this.players.filter((player) => player.team !== shooter.team);
      const closest = Math.min(...defenders.map((player) => distance(player, shooter)));
      return clamp(105 - closest, 0, 100);
    }

    launchBall(player, hoop, made, points, kind) {
      player.hasBall = false;
      this.ball.holder = null;
      this.ball.state = "shot";
      this.ball.flight = {
        from: { x: player.x, y: player.y, z: this.releaseHeight(player) },
        to: { x: hoop.x - hoop.side * 6, y: hoop.y, z: hoop.y - hoop.rimY - (kind === "dunk" ? 48 : 20) },
        elapsed: 0,
        duration: kind === "dunk" ? 0.18 : kind === "layup" ? 0.48 : 0.78,
        arc: kind === "dunk" ? 8 : kind === "layup" ? 94 : 176,
        made,
        points,
        kind,
        shooter: player,
        hoop,
        alley: kind === "dunk" && player.alleyFinish,
        id: this.nextEventId(), period: this.quarter,
        assist: this.assistFor(player), fakeBite: this.matchTime < player.fakeBiteUntil,
      };
      this.flash(kind === "dunk" ? "MONSTER DUNK" : kind.toUpperCase());
    }

    passBall(from, to, alley = false) {
      if (!to || this.ball.holder !== from || from.shotLocked) return;
      from.passCharge = null;
      from.hasBall = false;
      this.showAction(from, "pass", "Shoot", 350);
      from.facing = (2 - Math.round(Math.atan2(to.y - from.y, to.x - from.x) / (Math.PI / 4)) + 8) % 8;
      this.audio?.play("pass");
      this.ball.holder = null;
      this.ball.state = alley ? "alley" : "pass";
      this.ball.flight = {
        from: { x: from.x, y: from.y, z: this.releaseHeight(from) },
        to,
        elapsed: 0,
        duration: alley ? 0.28 : 0.36,
        arc: alley ? 95 : 32,
        passer: from,
        uninterceptable: this.firePerks.has(from, "unlimitedPassing"),
      };
      this.flash(alley ? "LOB" : "PASS");
    }

    trySteal(defender, handler) {
      if (defender.team === handler.team || !this.firePerks.canAct(defender) || this.ball.holder !== handler || handler.ultimate || this.matchTime < defender.nextActionAt
        || this.matchTime < defender.disabledUntil || defender.shotLocked
        || defender.z > 0 || handler.shooting || handler.dunking) return;
      defender.nextActionAt = this.matchTime + 600;
      const gap = distance(defender, handler);
      defender.reachUntil = this.matchTime + 220;
      this.showAction(defender, "steal", "Attack", 220);
      if (gap > 100) { this.flash("OUT OF REACH", 400); return; }
      if (this.firePerks.stealGuard(handler, defender)) return;
      const steal = defender.record.attributes.steal;
      const handle = handler.record.attributes.ball_handling;
      const jockeyBoost = defender.jockeying ? 0.18 : 0;
      const proximity = gap < 60 ? 0.12 : 0;
      const strength = this.firePerks.defenseScale(defender);
      const chance = clamp(0.38 + jockeyBoost + proximity + (steal - handle) / 250, 0.2, 0.85) * strength;
      defender.disabledUntil = this.matchTime + 150;
      if (Math.random() < chance) {
        this.firePerks.extinguish(handler);
        defender.stats.steals += 1;
        this.awardStyle(this.styleLedger.award(this.nextEventId(), defender, "STEAL", 20));
        this.present("steal", defender);
        this.addUltimateCharge(defender, 15);
        handler.disabledUntil = this.matchTime + 480 * strength;
        this.cancelAction(handler);
        const toward = norm(defender.x - handler.x, defender.y - handler.y);
        this.setLooseBall(lerp(handler.x, defender.x, 0.55), lerp(handler.y, defender.y, 0.55),
          toward.x * 85, toward.y * 85, 95);
        this.ball.recoveryPlayer = defender;
        this.ball.recoveryUntil = this.matchTime + 450;
        this.flash("STEAL");
      } else {
        this.flash("REACH");
      }
    }

    isOpponentShooting(defender) {
      return this.players.some((player) => player.team !== defender.team && (player.shooting || player.dunking))
        || (this.ball.state === "shot" && this.ball.flight?.shooter.team !== defender.team)
        || (this.ball.state === "alley" && this.ball.flight?.to.team !== defender.team);
    }

    tryBlock(defender) {
      if (!this.firePerks.canAct(defender)) return;
      if (this.matchTime < defender.nextActionAt || this.matchTime < defender.disabledUntil
        || defender.z > 0 || defender.shotLocked) return;
      defender.nextActionAt = this.matchTime + 850;
      defender.blocking = true;
      defender.blockAttempted = false;
      defender.shotLocked = true;
      defender.vz = 430 + defender.record.attributes.block * 1.25;
      const shooter = this.ball.holder || this.ball.flight?.shooter || this.ball.flight?.to;
      if (shooter && shooter.team !== defender.team) {
        const toward = norm(shooter.x - defender.x, shooter.y - defender.y);
        defender.blockDirection = toward;
        defender.facing = (2 - Math.round(Math.atan2(toward.y, toward.x) / (Math.PI / 4)) + 8) % 8;
        if (this.matchTime < shooter.fakeUntil) shooter.fakeBiteUntil = this.matchTime + 5000;
      }
      this.flash("BLOCK ATTEMPT", 450);
    }

    checkBlocks() {
      const attacker = this.ball.holder || this.ball.flight?.shooter || (this.ball.state === "alley" && this.ball.flight.to);
      if (!attacker || !["held", "dunk", "shot", "alley", "ultimate"].includes(this.ball.state)) return;
      if (this.ball.state === "alley" && this.ball.flight?.uninterceptable) return;
      if ((attacker.dunking || this.ball.flight?.kind === "dunk") && this.firePerks.has(attacker, "ironDefense")) return;
      if (this.ball.flight?.ultimate?.profile.perk) return;
      if (this.ultimate?.shooter === attacker && this.ultimate.profile.perk) return;
      if (this.ball.holder && !attacker.shooting && !attacker.dunking && !attacker.awaitingFinish) return;
      const special = Boolean(attacker.ultimate || this.ball.flight?.ultimate);
      for (const defender of this.players) {
        if (!defender.blocking || defender.blockAttempted || defender.team === attacker.team || defender.z < 25
          || !this.firePerks.canAct(defender)) continue;
        const horizontal = distance(defender, this.ball);
        const vertical = Math.abs(defender.z + 55 - this.ball.z);
        if (horizontal > (special ? 60 : 83) || vertical > (special ? 48 : 70)) continue;
        defender.blockAttempted = true;
        const attack = attacker.record.attributes.dunk;
        const chance = clamp(0.55 + (defender.record.attributes.block - attack) / 220, 0.25, 0.9)
          * (special ? ULTIMATE_BLOCK_MULTIPLIER : 1) * this.firePerks.defenseScale(defender);
        if (Math.random() >= chance) continue;
        const x = this.ball.x;
        const y = this.ball.y;
        const z = this.ball.z;
        defender.stats.blocks += 1;
        this.awardStyle(this.styleLedger.award(this.nextEventId(), defender, "BLOCK", 25));
        this.present("block", defender);
        this.addUltimateCharge(defender, 20);
        this.recordMiss(attacker);
        if (this.ultimate?.shooter === attacker) this.cancelUltimate("blocked");
        this.cancelAction(attacker);
        this.showAction(attacker, "hurt", "Hurt", 260);
        this.setLooseBall(x, y, defender.team === TEAM_PLAYER ? 220 : -220,
          Phaser.Math.Between(-100, 100), 140);
        this.ball.z = z;
        this.flash("BLOCKED!");
        break;
      }
    }

    cancelAction(player) {
      if (this.ultimate?.shooter === player) this.cancelUltimate();
      player.actionVisualUntil = 0;
      player.actionCue = null;
      player.hasBall = false;
      player.shooting = false;
      player.shootHeld = false;
      player.pendingShot = null;
      player.shotAttempt = null;
      player.pausedRelease = null;
      player.shove = null;
      player.cpuReleaseAt = 0;
      player.dunking = false;
      player.dunk = null;
      player.alleyPrep = null;
      player.passCharge = null;
      player.awaitingFinish = false;
      player.finishQueued = false;
      player.fakeBiteUntil = 0;
      player.assistFrom = null;
      player.shotLocked = player.z > 0;
      if (player.z > 0) player.vz = Math.min(player.vz, -40);
    }

    dropBall(player, hoop = null) {
      const point = hoop || player;
      const z = player.z + 42;
      this.cancelAction(player);
      this.setLooseBall(point.x - (hoop ? hoop.side * 25 : 0), point.y, hoop ? -hoop.side * 160 : 80,
        Phaser.Math.Between(-80, 80), 80);
      this.ball.z = z;
    }

    ballDisplayPosition() {
      const flight = this.ball.flight;
      // The legacy dunk release ends below the rim; align art without changing block physics.
      if (this.ball.state === "shot" && flight?.kind === "dunk") {
        const t = Math.min(1, flight.elapsed / flight.duration);
        return { ...this.ball, z: this.ball.z + (112 - flight.to.z) * t };
      }
      return this.ball;
    }

    updateBall(dt) {
      if (this.ball.holder) {
        const anchor = this.ball.holder.visual?.ball || {};
        this.ball.x = this.ball.holder.x + (this.ball.holder.team === TEAM_PLAYER ? 1 : -1) * (anchor.side ?? 16);
        this.ball.y = this.ball.holder.y;
        const dribble = this.ball.holder.pendingShot || this.matchTime < this.ball.holder.fakeUntil ? (anchor.gather ?? 58)
          : this.ball.holder.z === 0 && !this.ball.holder.shotLocked
          ? Math.abs(Math.sin(this.matchTime / 115)) * (anchor.dribble ?? 30) : (anchor.carry ?? 42);
        this.ball.z = this.ball.holder.z + dribble + 8;
      } else if (this.ball.flight) {
        this.updateFlight(dt);
      } else if (this.ball.state === "loose") {
        this.ball.x += this.ball.vx * dt;
        this.ball.y += this.ball.vy * dt;
        this.ball.z += this.ball.vz * dt;
        this.ball.vx *= 0.986;
        this.ball.vy *= 0.986;
        this.ball.vz -= GRAVITY * dt;
        if (this.ball.z <= 0) {
          this.ball.z = 0;
          this.ball.vz = Math.abs(this.ball.vz) * 0.48;
          if (this.ball.vz < 80) this.ball.vz = 0;
        }
      }

      const drop = this.ball.state === "dead" && this.ball.scoreDrop;
      const dropping = drop && this.matchTime - drop.at < 260;
      const display = dropping ? { x: drop.x, y: drop.y, z: drop.z - (this.matchTime - drop.at) / 260 * 38 } : this.ballDisplayPosition();
      const point = window.PokeJamArena.project(display.x, display.y, display.z);
      const ground = window.PokeJamArena.project(display.x, display.y);
      const visible = this.ball.state !== "dead" || Boolean(dropping);
      this.ball.sprite.setPosition(point.x, point.y).setScale(point.scale).setVisible(visible);
      const owner = this.ball.holder || this.ball.flight?.shooter;
      this.ball.sprite.setFillStyle(owner?.onFire ? 0xffd166 : 0xf47c32);
      this.ball.shadow.setPosition(ground.x, ground.y + 5).setVisible(visible);
      this.ball.shadow.setScale(Math.max(0.4, 1 - display.z / 420), point.scale);
      this.ball.sprite.setDepth(Math.round(ground.y) + 2);
      this.ball.shadow.setDepth(Math.round(ground.y) - 2);
      if (dt > 0) this.presentation.spin += dt * (["pass", "alley"].includes(this.ball.state) ? 26 : this.ball.state === "shot" ? -10 : 5);
      const seams = this.ball.seams.clear().setPosition(point.x, point.y).setRotation(this.presentation.spin)
        .setDepth(this.ball.sprite.depth + 0.1).setVisible(visible);
      seams.lineStyle(1.3, 0x613d23).strokeCircle(0, 0, 8 * point.scale);
      seams.lineBetween(-8 * point.scale, 0, 8 * point.scale, 0);
      seams.lineBetween(0, -8 * point.scale, 0, 8 * point.scale);
      if (["pass", "alley"].includes(this.ball.state)) seams.strokeEllipse(0, 0, 14 * point.scale, (5 + Math.abs(Math.sin(this.presentation.spin)) * 7) * point.scale);
      this.presentation.update(dt);
      if (this.ball.holder && !this.ball.holder.shotLocked && this.matchTime > (this.nextBounceSound || 0)) {
        this.audio?.play("bounce"); this.nextBounceSound = this.matchTime + 360;
      }
    }

    updateFlight(dt) {
      const flight = this.ball.flight;
      flight.elapsed += dt;
      const t = Math.min(1, flight.elapsed / flight.duration);
      const to = flight.to.sprite
        ? { x: flight.to.x, y: flight.to.y, z: this.releaseHeight(flight.to) }
        : flight.to;
      this.ball.x = lerp(flight.from.x, to.x, t);
      this.ball.y = lerp(flight.from.y, to.y, t);
      this.ball.z = lerp(flight.from.z, to.z, t) + Math.sin(t * Math.PI) * flight.arc;
      if (["pass", "alley"].includes(this.ball.state) && this.firePerks.intercept(flight)) return;
      if (t < 1) return;

      if (this.ball.state === "shot") {
        this.resolveShot(flight);
      } else if (this.ball.state === "alley") {
        const receiver = flight.to;
        if (receiver.z < 25 || distance(receiver, this.offenseHoop(receiver.team)) > this.dunkRange(receiver) + 45) {
          this.setLooseBall(this.ball.x, this.ball.y, 60, 40, 70);
          this.flash("MISSED OOP");
          return;
        }
        const queued = receiver.finishQueued;
        const humanReceiver = this.humanIndex(receiver) >= 0;
        this.giveBall(receiver, true, flight.passer);
        if (!humanReceiver || queued) {
          this.startDunk(receiver, true);
        } else {
          receiver.awaitingFinish = true;
          this.flash("OOP CATCH");
        }
      } else {
        this.giveBall(flight.to, false, flight.passer);
      }
    }

    resolveShot(flight) {
      if (flight.resolved) return;
      flight.resolved = true;
      this.ball.flight = null;
      flight.shooter.shotLocked = flight.shooter.z > 0;
      flight.shooter.shooting = false;
      if (flight.ultimate) {
        this.recordUltimateResult(flight.ultimate, flight.made, flight.made ? "scored" : "miss");
        Object.assign(flight.ultimate, { stage: "impact", elapsed: 0, duration: 0.6, progress: 0, trail: [] });
      }
      if (flight.made) {
        flight.shooter.stats.makes += 1;
        flight.shooter.stats.points += flight.points;
        this.score[flight.shooter.team] += flight.points;
        if (flight.kind === "dunk") {
          flight.shooter.stats.dunks += 1;
          if (!this.reducedEffects) this.ball.sprite.setScale(1.2);
        }
        this.flash(flight.ultimate ? `${flight.ultimate.profile.name.toUpperCase()} +${flight.points}`
          : flight.kind === "dunk" ? `SLAM DUNK +${flight.points}` : `${flight.points} POINTS`, 1300);
        this.recordBucket(flight.shooter);
        if (flight.assist) flight.assist.stats.assists = (flight.assist.stats.assists || 0) + 1;
        for (const reward of this.styleLedger.finish(flight.id || this.nextEventId(), flight, this.clock, this.quarter)) this.awardStyle(reward);
        this.present(flight.alley ? "alley" : flight.ultimate ? "ultimate" : flight.kind === "dunk" ? "dunk" : "make", flight.shooter, flight.hoop);
        if (this.clock <= 0) this.audio?.call("buzzer");
        this.showAction(flight.shooter, "celebrate", "Pose", 450);
        this.resetAfterScore(flight.shooter.team, flight.hoop);
      } else {
        this.recordMiss(flight.shooter);
        const away = norm(flight.shooter.x - flight.hoop.x, flight.shooter.y - flight.hoop.y);
        this.setLooseBall(
          flight.hoop.x + Phaser.Math.Between(-16, 16),
          flight.hoop.y + Phaser.Math.Between(-18, 18),
          away.x * 180 + Phaser.Math.Between(-70, 70),
          away.y * 180 + Phaser.Math.Between(-70, 70),
          230,
        );
        this.ball.z = flight.hoop.y - flight.hoop.rimY - 20;
        this.shotClockRimTeam = flight.shooter.team;
        this.flash("MISS");
        this.audio?.play("miss");
      }
    }

    setLooseBall(x, y, vx, vy, vz) {
      this.ball.state = "loose";
      this.ball.holder = null;
      this.ball.flight = null;
      this.ball.x = x;
      this.ball.y = y;
      this.ball.z = 18;
      this.ball.vx = vx;
      this.ball.vy = vy;
      this.ball.vz = vz;
      this.ball.recoveryPlayer = null;
      this.ball.recoveryUntil = 0;
    }

    pickupLooseBall() {
      if (this.ball.state !== "loose") return;
      let best = null;
      let bestGap = Infinity;
      for (const player of this.players) {
        if (!this.firePerks.canAct(player) || this.matchTime < player.disabledUntil || player.dunking || player.shooting || player.shove) continue;
        if (this.matchTime < this.ball.recoveryUntil && player !== this.ball.recoveryPlayer) continue;
        const reachHeight = player.z + 42 + player.record.attributes.rebound * 0.35;
        if (this.ball.z > reachHeight || (player.z === 0 && this.ball.z > 50)) continue;
        const gap = distance(player, this.ball) - player.record.attributes.rebound * 0.08;
        if (gap < bestGap) {
          best = player;
          bestGap = gap;
        }
      }
      if (best && bestGap < 38) {
        this.giveBall(best);
        this.flash(this.ball.recoveryPlayer ? "RECOVERED" : "REBOUND");
      }
    }

    checkOutOfBounds() {
      if (this.ball.state !== "loose") return;
      if (
        this.ball.x < COURT_LEFT - 22 ||
        this.ball.x > COURT_RIGHT + 22 ||
        this.ball.y < FLOOR_TOP ||
        this.ball.y > FLOOR_BOTTOM
      ) {
        const team = this.possessionTeam === TEAM_PLAYER ? TEAM_CPU : TEAM_PLAYER;
        this.inbound(team, "OUT OF BOUNDS");
      }
    }

    resetAfterScore(scoringTeam, hoop = this.offenseHoop(scoringTeam)) {
      const inboundTeam = scoringTeam === TEAM_PLAYER ? TEAM_CPU : TEAM_PLAYER;
      this.inbound(inboundTeam, "", 650);
      this.ball.scoreDrop = { x: hoop.x - hoop.side * 6, y: hoop.y, z: 112, at: this.matchTime };
    }

    inbound(team, message, delay = 350) {
      this.firePerks?.clear();
      if (this.ultimate && this.ultimate.stage !== "impact") this.cancelUltimate();
      const inbounder = this.players.find((player) => player.team === team);
      this.pendingInbound = { player: inbounder, at: this.matchTime + delay };
      this.possessionTeam = team;
      this.shotClock = 24;
      this.shotClockRimTeam = null;
      for (const player of this.players) {
        player.hasBall = false;
        player.passCharge = null;
        player.shootHeld = false;
        player.shotAttempt = null;
        player.pausedRelease = null;
        player.shove = null;
        player.knockback = null;
        player.callHeld = false;
        player.calling = false;
        player.jockeying = false;
      }
      if (message) this.flash(message);
      this.ball.state = "dead";
      this.ball.holder = null;
      this.ball.flight = null;
      this.ball.scoreDrop = null;
      this.presentation?.clear();
    }

    resetPlayers() {
      const positions = [{ x: 250, y: 244 }, { x: 264, y: 360 }, { x: 704, y: 242 }, { x: 712, y: 360 }];
      for (const [index, player] of this.players.entries()) {
        Object.assign(player, positions[index]);
        player.z = 0;
        player.vz = 0;
        player.shotLocked = false;
        player.shooting = false;
        player.dunking = false;
        player.dunk = null;
        player.alleyPrep = null;
        player.awaitingFinish = false;
        player.finishQueued = false;
        player.blocking = false;
        player.cpuReleaseAt = 0;
        player.disabledUntil = 0;
        player.shootHeld = false;
        player.passCharge = null;
        player.callHeld = false;
        player.calling = false;
        player.jockeying = false;
        player.reachUntil = 0;
        player.pendingShot = null;
        player.fakeUntil = 0;
        player.shotAttempt = null;
        player.pausedRelease = null;
        player.shove = null;
        player.knockback = null;
        player.shoveImmuneUntil = 0;
        player.ultimate = null;
        player.offBallPlan = null;
        player.assistFrom = null;
        player.fakeBiteUntil = 0;
        player.alleyFinish = false;
        player.actionVisualUntil = 0;
        player.actionCue = null;
        player.actionVisualStartedAt = 0;
        player.actionVisualDuration = 0;
        player.visualCue = null;
        player.visualPace = 0;
        player.visualWasAirborne = false;
        player.visualLandedAt = null;
        player.visualOffset = { x: 0, y: 0 };
        player.moving = false;
        player.facing = player.team === TEAM_PLAYER ? 2 : 6;
        player.sprite.setRotation(0);
      }
    }

    assistFor(player) {
      return player.assistFrom && this.matchTime - player.assistFrom.at < 5000 ? player.assistFrom.player : null;
    }

    giveBall(player, aerial = false, passer = null) {
      if (!player) return;
      if (this.shotClockRimTeam === player.team) this.shotClock = 14;
      else if (this.possessionTeam !== player.team || this.shotClockRimTeam) this.shotClock = 24;
      this.shotClockRimTeam = null;
      for (const other of this.players) {
        other.hasBall = false;
      }
      player.hasBall = true;
      player.assistFrom = passer ? { player: passer, at: this.matchTime } : null;
      player.fakeBiteUntil = 0;
      this.showAction(player, "catch", "Charge", 180);
      this.audio?.play("catch");
      player.offBallPlan = null;
      player.shotLocked = aerial || player.z > 0;
      player.shooting = false;
      player.shootHeld = false;
      player.shotAttempt = null;
      player.passCharge = null;
      player.finishQueued = false;
      player.nextShotAt = this.matchTime + 1000;
      const hoop = this.offenseHoop(player.team);
      const driving = Math.random() < 0.55;
      player.aiTarget = { x: hoop.x - hoop.side * (driving ? 50 : Phaser.Math.Between(170, 260)),
        y: hoop.y + Phaser.Math.Between(-95, 95) };
      if (!this.coop && player.team === TEAM_PLAYER) {
        const previous = this.controlledPlayer();
        if (previous !== player) {
          previous.pendingShot = null;
          previous.shootHeld = false;
          previous.passCharge = null;
          previous.callHeld = false;
          previous.jockeying = false;
          if (!previous.shotAttempt && !previous.dunking && !previous.ultimate && previous.z === 0) previous.shotLocked = false;
        }
        this.soloPlayer = player;
        this.manualControl = false;
      } else if (!this.coop && !this.manualControl) {
        this.soloPlayer = this.players.filter((p) => p.team === TEAM_PLAYER)
          .sort((a, b) => distance(a, player) - distance(b, player))[0];
      }
      this.possessionTeam = player.team;
      this.ball.holder = player;
      this.ball.state = "held";
      this.ball.flight = null;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.vz = 0;
    }

    updateHud() {
      const remaining = Math.ceil(this.clock);
      const minutes = Math.floor(remaining / 60);
      const seconds = (remaining % 60).toString().padStart(2, "0");
      const period = this.quarter <= 4 ? `Q${this.quarter}` : `OT${this.quarter - 4}`;
      this.scoreText.setText(`PLAYER ${this.score.player}   ${period} ${minutes}:${seconds}   CPU ${this.score.cpu}`);
      const holder = this.ball.holder ? this.ball.holder.record.name : this.ball.state === "dead" ? "Inbound" : "In play";
      this.possessionText.setText(`Ball: ${holder}`);
      const burning = this.players.filter((player) => player.onFire)
        .map((player) => `${player.record.name.toUpperCase()} ${Math.ceil(player.fireRemaining / 1000)}s`);
      this.fireText.setText(burning.length ? `ON FIRE: ${burning.join(" + ")}` : "");
      document.querySelector("#player-score").textContent = this.score.player;
      document.querySelector("#cpu-score").textContent = this.score.cpu;
      document.querySelector("#match-period").textContent = period;
      document.querySelector("#match-clock").textContent = `${minutes}:${seconds}`;
      const shotDisplay = this.shotClock < 5 ? this.shotClock.toFixed(1) : String(Math.ceil(this.shotClock));
      document.querySelector("#shot-clock-value").textContent = shotDisplay;
      document.querySelector("#shot-clock").classList.toggle("urgent", this.shotClock <= 5);
      document.querySelector("#match-possession").textContent = holder;
      document.querySelector("#player-style").textContent = this.styleLedger.totals.player;
      document.querySelector("#cpu-style").textContent = this.styleLedger.totals.cpu;
      document.querySelector("#fire-status").textContent = this.fireText.text;
      if (!this.gameOver) document.querySelector("#match-results").hidden = true;
      for (const player of this.players) {
        if (!player.chargeUi) continue;
        const ready = player.ultimateCharge >= 100;
        player.chargeUi.meter.value = player.ultimateCharge;
        player.chargeUi.status.textContent = ready ? "READY" : `${Math.floor(player.ultimateCharge)}%`;
        player.chargeUi.turbo.value = player.stamina;
        player.chargeUi.label.classList.toggle("ready", ready);
        player.chargeUi.label.classList.toggle("controlled", this.humanIndex(player) >= 0);
        player.chargeUi.label.classList.toggle("on-fire", player.onFire);
        if (ready && !player.wasReady) {
          player.readyAt = this.matchTime;
          this.audio?.play("ready");
          this.audio?.call("ready", `${player.record.name}'s ultimate is ready!`);
        }
        player.wasReady = ready;
      }
      this.presentation?.playerHud();
      if (this.ultimateButton) {
        const player = this.controlledPlayer(0);
        this.ultimateButton.disabled = this.isPaused || this.gameOver || Boolean(this.ultimate)
          || this.clock <= 0 || this.shotClock <= 0 || this.ball.holder !== player || player.ultimateCharge < 100
          || player.shotLocked || player.z > 0 || this.matchTime < player.disabledUntil;
        this.ultimateButton.title = `${window.PokeJamFinishes.profileFor(player.record).name} (E); Shift + E for a dunk`;
      }
    }

    endQuarter() {
      if (this.quarter >= 4) {
        if (this.score.player !== this.score.cpu || this.previewEnd) {
          this.finishMatch();
          return;
        }
      }
      this.quarter += 1;
      this.present("period", null);
      this.clock = this.quarter > 4 ? 60 : QUARTER_SECONDS;
      const period = this.quarter <= 4 ? `Q${this.quarter}` : `OT${this.quarter - 4}`;
      this.inbound(this.quarter % 2 === 0 ? TEAM_CPU : TEAM_PLAYER, period);
    }

    previewFinalSecond() {
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
        || new URLSearchParams(location.search).has("debug");
      const focused = document.activeElement;
      if (!local || this.isPaused || this.gameOver || document.querySelector("dialog[open]")
        || focused?.matches("input, select, textarea, [contenteditable=true]")) return;
      this.previewEnd = true;
      this.quarter = 4;
      this.clock = 1;
      this.updateHud();
    }

    finishMatch() {
      this.firePerks.clear(true);
      this.gameOver = true;
      const draw = this.score.player === this.score.cpu;
      this.resultTitle = draw ? "DRAW / RESULTS PREVIEW" : this.score.player > this.score.cpu ? "PLAYER WINS" : "CPU WINS";
      this.cancelUltimate("reset");
      for (const p of this.players) { p.shotAttempt = null; p.shove = null; p.knockback = null; }
      this.presentation.clear();
      this.presentation.meters();
      this.pauseOverlay.setVisible(true);
      this.pauseText.setText(this.resultTitle).setFontSize(draw ? 28 : 40).setVisible(true);
      this.messageText.setText("");
      this.audio?.stop();
      this.present("win", draw ? null : this.players.find(p => p.team === (this.score.player > this.score.cpu ? TEAM_PLAYER : TEAM_CPU)),
        null, draw ? "Final buzzer. Results preview." : "");
      this.arena.lastCrowdFrame = -1;
      this.arena.update(this.matchTime);
      this.animator?.pause(true);
      this.showResults();
      this.updateHud();
    }

    restartMatch() {
      this.firePerks.clear(true);
      this.cancelUltimate("reset");
      this.finishEvents = [];
      this.styleLedger.reset();
      for (const popup of this.stylePopups) popup.text.destroy();
      this.stylePopups = [];
      this.audio?.stop();
      this.arena.reset();
      this.previewEnd = false;
      this.actionNeedsRelease.clear();
      this.presentation.clear();
      this.ball.scoreDrop = null;
      document.querySelector("#match-results").hidden = true;
      window.scrollTo({ top: 0, behavior: "instant" });
      this.score = { player: 0, cpu: 0 };
      this.quarter = 1;
      this.clock = QUARTER_SECONDS;
      this.shotClock = 24;
      this.shotClockRimTeam = null;
      this.gameOver = false;
      this.isPaused = false;
      this.manualControl = false;
      this.pauseOverlay.setVisible(false);
      this.pauseText.setText("PAUSED").setFontSize(52).setVisible(false);
      this.tweens.resumeAll();
      document.querySelector("#pause-match").setAttribute("aria-pressed", "false");
      this.resetPlayers();
      for (const player of this.players) {
        player.stats = { points: 0, shots: 0, makes: 0, steals: 0, dunks: 0, blocks: 0, assists: 0 };
        player.stamina = 100;
        player.nextActionAt = 0;
        player.nextCallAt = 0;
        player.nextStealAt = 0;
        player.ultimateCharge = 0;
        player.wasReady = false;
        this.recordMiss(player);
      }
      this.soloPlayer = this.players[0];
      this.pendingInbound = null;
      this.giveBall(this.soloPlayer);
      this.updateBall(0);
      for (const player of this.players) this.syncPlayerSprites(player);
      this.sortSprites();
      this.flash("Q1");
      this.updateHud();
    }

    togglePause() {
      if (this.gameOver || this.setupActive) return;
      this.isPaused = !this.isPaused;
      for (const player of this.players) {
        if (player.pendingShot) {
          player.pendingShot = null;
          player.shotLocked = false;
        }
        player.passCharge = null;
        player.callHeld = false;
        player.jockeying = false;
      }
      document.querySelector("#pause-match").setAttribute("aria-pressed", String(this.isPaused));
      this.pauseOverlay.setVisible(this.isPaused);
      this.pauseText.setVisible(this.isPaused);
      if (this.isPaused) this.tweens.pauseAll();
      else this.tweens.resumeAll();
      if (!this.isPaused) for (const player of this.players) {
        if (player.pausedRelease != null) { this.releaseShot(player, player.pausedRelease); player.pausedRelease = null; }
      }
      this.animator?.pause(this.isPaused);
      if (this.isPaused) this.audio?.stop();
      this.audio?.update();
      this.updateHud();
    }

    flash(text, duration = 900) {
      this.messageText.setText(text);
      this.messageUntil = this.matchTime + duration;
      this.messageText.setScale(1.08);
      this.tweens.add({
        targets: this.messageText,
        scale: 1,
        duration: 140,
        ease: "Back.Out",
      });
    }
  }

  async function startGame() {
    try {
      const response = await fetch("data/playable_roster.json");
      if (!response.ok) throw new Error("Playable roster missing");
      window.PokeJamRoster = await response.json();
      const stages = await fetch("data/stages.json");
      if (!stages.ok) throw new Error("Stages missing");
      window.PokeJamStages = await stages.json();
    } catch (_) {
      document.querySelector("#game-root").textContent = "The playable roster could not load. Please reload the match.";
      return;
    }
    try {
      const response = await fetch("assets/animations/manifest.json");
      if (!response.ok) throw new Error("Animation manifest missing");
      window.PokeJamAnimationManifest = await response.json();
    } catch (_) {
      window.PokeJamAnimationManifest = { players: {} };
    }
    const config = {
      type: Phaser.AUTO,
      parent: "game-root",
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: "#05070c",
      pixelArt: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: MatchScene,
    };

    const game = new Phaser.Game(config);
    if (new URLSearchParams(window.location.search).has("test")) window.pokeJamGame = game;
  }

  window.addEventListener("DOMContentLoaded", () => {
    if (window.lucide) window.lucide.createIcons();
    if (!window.Phaser) {
      document.querySelector("#game-root").textContent = "Phaser could not load.";
      return;
    }
    startGame();
  });
}());
