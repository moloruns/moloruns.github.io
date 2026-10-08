(function () {
  const LINES = { dunk: ["Straight to the rim!", "A monster finish!"], alley: ["What a connection!", "Up and away!"],
    make: ["That's good!", "Nothing but net!"], block: ["Not in this arena!", "Denied!"], steal: ["Picked clean!"],
    fire: ["Heating up!", "They're on fire!"], ready: ["Ultimate is ready!"], ultimate: ["Here comes the signature!"],
    shove: ["Big contact!"], shotclock: ["Shot clock violation!"], buzzer: ["Beat the buzzer!"], period: ["That's the quarter!"], win: ["The arena has its champions!"] };

  class ArenaAudio {
    constructor(scene) {
      this.scene = scene;
      this.context = scene.sound.context;
      this.muted = false;
      this.volumes = { sfx: 0.5, crowd: 0.22, announcer: 0.6 };
      this.speech = false;
      this.lastCall = -10000;
      this.callIndex = {};
      this.activeVoices = new Set();
      this.readySounds = 0;
      this.endCueUntil = 0;
      this.master = this.context?.createGain();
      if (this.master) {
        this.master.gain.value = 0.28;
        this.master.connect(this.context.destination);
        const length = this.context.sampleRate * 2;
        this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
        const data = this.noise.getChannelData(0);
        let seed = 731;
        for (let i = 0; i < length; i += 1) { seed = (seed * 16807) % 2147483647; data[i] = (seed / 2147483647 - 0.5) * 2; }
      }
    }

    bed() {
      if (!this.context || this.bedSource || this.context.state !== "running") return;
      const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter();
      this.bedGain = this.context.createGain();
      source.buffer = this.noise; source.loop = true;
      filter.type = "bandpass"; filter.frequency.value = 620; filter.Q.value = 0.5;
      source.connect(filter); filter.connect(this.bedGain); this.bedGain.connect(this.master);
      source.start(); this.bedSource = source;
    }

    update() {
      if (!this.context) return;
      this.bed();
      const active = !this.muted && !this.scene.isPaused
        && (!this.scene.gameOver || this.context.currentTime < this.endCueUntil);
      this.master.gain.setTargetAtTime(active ? 0.28 : 0, this.context.currentTime, 0.035);
      this.bedGain?.gain.setTargetAtTime(!this.scene.gameOver && active
        ? this.volumes.crowd * (this.scene.matchTime < this.scene.arena.cheerUntil ? 0.3 : 0.08)
          * (this.scene.ultimate?.stage === "windup" ? 0.35 : 1) : 0,
        this.context.currentTime, 0.08);
    }

    tone(frequency, duration, volume = 0.1, end = frequency, type = "sine", delay = 0) {
      if (!this.context || this.context.state !== "running" || this.muted || this.scene.isPaused) return;
      const oscillator = this.context.createOscillator(), gain = this.context.createGain();
      const start = this.context.currentTime + delay;
      oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), start + duration);
      gain.gain.setValueAtTime(Math.max(0.0001, volume * this.volumes.sfx), start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain); gain.connect(this.master);
      oscillator.start(start); oscillator.stop(start + duration);
      this.activeVoices.add(oscillator);
      oscillator.onended = () => { this.activeVoices.delete(oscillator); gain.disconnect(); };
    }

    play(type) {
      if (type === "win" && this.context) this.endCueUntil = this.context.currentTime + 0.7;
      if (type === "ready") {
        this.readySounds += 1;
        [520, 660, 880].forEach((frequency, i) => this.tone(frequency, 0.22, 0.16, frequency, "triangle", i * 0.09));
      } else if (type === "bounce") this.tone(125, 0.065, 0.2, 48);
      else if (type === "pass" || type === "catch") this.tone(210, 0.06, 0.09, 80);
      else if (type === "miss") this.tone(430, 0.18, 0.2, 110, "triangle");
      else if (["dunk", "ultimate", "block", "shove"].includes(type)) {
        this.tone(180, 0.22, 0.35, 35); this.tone(65, 0.32, 0.22, 30, "triangle");
      } else if (type === "period" || type === "win") this.tone(180, 0.65, 0.13, 180, "sawtooth");
      else this.tone(580, 0.15, 0.12, 290, "triangle");
    }

    call(type, detail = "") {
      const important = ["win", "period", "ultimate", "buzzer"].includes(type);
      if (!important && this.scene.matchTime - this.lastCall < 1700) return;
      this.lastCall = this.scene.matchTime;
      const variants = LINES[type] || LINES.make;
      const index = this.callIndex[type] || 0;
      this.callIndex[type] = index + 1;
      const text = detail || variants[index % variants.length];
      const caption = document.querySelector("#arena-call");
      caption.textContent = text;
      if (!this.speech || this.muted || this.scene.isPaused || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = this.volumes.announcer;
      utterance.rate = 1.08;
      utterance.pitch = 0.85;
      window.speechSynthesis.speak(utterance);
    }

    stop() {
      this.endCueUntil = 0;
      for (const voice of this.activeVoices) { try { voice.stop(); } catch (_) { /* Already ended. */ } }
      this.activeVoices.clear();
      window.speechSynthesis?.cancel();
      document.querySelector("#arena-call").textContent = "";
      this.lastCall = -10000;
    }
  }
  window.PokeJamAudio = ArenaAudio;
}());
