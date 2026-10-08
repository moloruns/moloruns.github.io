(function () {
  const pick = items => items[Math.floor(Math.random() * items.length)];
  const labels = ["Your Lead", "Your Teammate", "Opponent Lead", "Opponent Teammate"];

  class MatchSetup {
    constructor(scene) {
      this.scene = scene;
      this.root = document.querySelector("#match-setup");
      this.gameShell = document.querySelector(".game-shell");
      this.form = document.querySelector("#lineup-form");
      document.querySelector("#team-editor").append(this.form);
      this.selects = [...this.form.querySelectorAll("select")];
      this.slot = 0;
      this.stage = scene.stage.id;
      const submit = this.form.querySelector("button[type=submit]");
      submit.innerHTML = '<i data-lucide="arrow-right" aria-hidden="true"></i> Choose Stage';
      submit.id = "choose-stage";
      for (const [i, select] of this.selects.entries()) {
        select.addEventListener("focus", () => this.selectSlot(i));
        select.addEventListener("change", () => this.updateRoster());
        const random = this.button("dices", `Random ${labels[i]}`, () => this.randomSlots([i]));
        select.parentElement.append(random);
        const preview = document.querySelector(`#${select.id}-preview`);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 96;
        canvas.setAttribute("aria-label", `${labels[i]} animated portrait`);
        preview.querySelector("img").replaceWith(canvas);
      }
      for (const [index, section] of [...this.form.querySelectorAll(".lineup-teams > section")].entries()) {
        const random = this.button("shuffle", index ? "Random opponents" : "Random your team", () => this.randomSlots(index ? [2,3] : [0,1]));
        section.querySelector("h3").append(random);
      }
      const roster = document.querySelector("#setup-roster");
      this.rosterButtons = window.PokeJamRoster.players.map(entry => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "roster-choice";
        button.setAttribute("aria-label", `Choose ${entry.name}`);
        const image = document.createElement("img");
        image.src = `assets/pokemon/${entry.slug}.png`;
        image.alt = "";
        const name = document.createElement("span"); name.textContent = entry.name;
        const region = document.createElement("small"); region.textContent = entry.region;
        button.append(image, name, region);
        button.addEventListener("click", () => {
          const other = this.selects.findIndex(select => select.value === entry.slug);
          if (other >= 0 && other !== this.slot) {
            this.selects[other].value = this.selects[this.slot].value;
            this.selects[other].dispatchEvent(new Event("change"));
          }
          this.selects[this.slot].value = entry.slug;
          this.selects[this.slot].dispatchEvent(new Event("change"));
          this.updateRoster();
        });
        roster.append(button);
        return {entry,button};
      });
      const options = document.querySelector("#stage-options");
      for (const stage of [...window.PokeJamStages.stages, {id:"random",name:"Random Stage",region:"ANY REGION"}]) {
        const label = document.createElement("label"); label.className = "stage-choice";
        const radio = document.createElement("input"); radio.type = "radio"; radio.name = "stage-choice"; radio.value = stage.id;
        if (stage.backdrop) {
          const art = document.createElement("span"); art.className = "stage-art";
          const image = document.createElement("img"); image.src = stage.backdrop; image.alt = "";
          art.append(image); label.append(art);
        } else {
          const art = document.createElement("span"); art.className = "random-stage-art";
          art.innerHTML = '<i data-lucide="dices" aria-hidden="true"></i>'; label.append(art);
        }
        const title = document.createElement("strong"); title.textContent = stage.shortName || stage.name;
        const region = document.createElement("span"); region.textContent = stage.region;
        label.append(radio, title, region); options.append(label);
        radio.addEventListener("change", () => { this.stage = stage.id; });
      }
      document.querySelector("#random-all").addEventListener("click", () => this.randomSlots([0,1,2,3]));
      document.querySelector("#setup-back").addEventListener("click", () => this.showTeams());
      document.querySelector("#setup-start").addEventListener("click", () => this.start());
      document.querySelector("#setup-cancel").addEventListener("click", () => this.cancel());
      this.menuKey = event => {
        if (!scene.setupActive || event.key !== "Escape") return;
        event.preventDefault();
        if (!document.querySelector("#setup-stages").hidden) this.showTeams();
        else this.cancel();
      };
      document.addEventListener("keydown", this.menuKey);
      window.lucide?.createIcons();
      const animate = now => {
        if (scene.setupActive && !document.hidden) this.portraits(now);
        this.raf = requestAnimationFrame(animate);
      };
      this.raf = requestAnimationFrame(animate);
      scene.events.once("shutdown", () => {
        cancelAnimationFrame(this.raf);
        document.removeEventListener("keydown", this.menuKey);
      });
    }

    button(icon, label, action) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "icon-button";
      button.title = label; button.setAttribute("aria-label", label);
      button.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i>`;
      button.addEventListener("click", action);
      return button;
    }

    selectSlot(index) {
      this.slot = index;
      document.querySelector("#roster-slot").textContent = labels[index];
      this.selects.forEach((select,i) => select.closest(".setting-row").classList.toggle("active-slot", index === i));
      this.updateRoster();
    }

    updateRoster() {
      for (const {entry,button} of this.rosterButtons) {
        const i = this.selects.findIndex(select => select.value === entry.slug);
        button.setAttribute("aria-pressed", String(i === this.slot));
        button.dataset.team = i < 0 ? "" : i < 2 ? "home" : "away";
      }
    }

    randomSlots(indices) {
      const used = new Set(this.selects.filter((_,i) => !indices.includes(i)).map(select => select.value));
      for (const i of indices) {
        const entry = pick(window.PokeJamRoster.players.filter(entry => !used.has(entry.slug)));
        this.selects[i].value = entry.slug; used.add(entry.slug);
      }
      // Validate after assigning the complete draft, not midway through randomizing a team.
      for (const i of indices) this.selects[i].dispatchEvent(new Event("change"));
      this.updateRoster();
    }

    open(initial = false) {
      const s = this.scene;
      this.initial = initial;
      this.wasPaused = s.isPaused;
      if (!s.isPaused && !s.gameOver) s.togglePause();
      s.setupActive = true;
      s.animator.pause(true); s.audio.stop();
      s.input.keyboard.enabled = false;
      s.input.keyboard.disableGlobalCapture();
      this.gameShell.hidden = true; this.root.hidden = false;
      this.selects.forEach((select,i) => { select.value = s.players[i].slug; select.dispatchEvent(new Event("change")); });
      document.querySelector("#setup-mode").value = s.coop ? "coop" : "solo";
      this.stage = s.stage.id;
      document.querySelector("#setup-cancel").hidden = initial;
      this.selectSlot(0); this.showTeams();
    }

    showTeams() {
      document.querySelector("#setup-teams").hidden = false;
      document.querySelector("#setup-stages").hidden = true;
      this.heading("Choose Your Teams", "teams-step");
    }

    showStages() {
      if (new Set(this.selects.map(select => select.value)).size !== 4) return;
      document.querySelector("#setup-teams").hidden = true;
      document.querySelector("#setup-stages").hidden = false;
      for (const radio of document.querySelectorAll('[name="stage-choice"]')) radio.checked = radio.value === this.stage;
      this.heading("Choose Your Stage", "stage-step");
    }

    heading(text, step) {
      const heading = document.querySelector("#setup-title"); heading.textContent = text; heading.focus();
      for (const item of document.querySelectorAll(".setup-steps li")) {
        if (item.id === step) item.setAttribute("aria-current", "step"); else item.removeAttribute("aria-current");
      }
    }

    close() {
      this.scene.setupActive = false;
      this.scene.input.keyboard.resetKeys(); this.scene.input.keyboard.enabled = true;
      this.scene.input.keyboard.enableGlobalCapture();
      this.root.hidden = true; this.gameShell.hidden = false;
      this.scene.scale.refresh();
    }

    cancel() {
      if (this.initial) return;
      this.close();
      if (!this.wasPaused && this.scene.isPaused && !this.scene.gameOver) this.scene.togglePause();
      document.querySelector("#choose-lineup").focus();
    }

    start() {
      const slugs = this.selects.map(select => select.value);
      if (new Set(slugs).size !== 4) return;
      const s = this.scene;
      const stage = this.stage === "random" ? pick(window.PokeJamStages.stages).id : this.stage;
      if (!s.setStage(stage)) return;
      this.close();
      s.coop = document.querySelector("#setup-mode").value === "coop";
      document.querySelector("#match-mode").value = s.coop ? "coop" : "solo";
      document.querySelector("#switch-mon").disabled = s.coop;
      s.setLineup(slugs);
      s.scale.refresh(); document.querySelector("#pause-match").focus();
    }

    portraits(now) {
      for (const [i,select] of this.selects.entries()) {
        const canvas = document.querySelector(`#${select.id}-preview canvas`), context = canvas.getContext("2d");
        context.clearRect(0,0,96,96); context.imageSmoothingEnabled = false;
        const entry = window.PokeJamRoster.players.find(entry => entry.slug === select.value);
        const action = entry.visual.animation?.actions.idle || "Idle";
        const data = this.scene.animator.manifest[entry.slug]?.actions[action];
        if (!data || !this.scene.textures.exists(`${entry.slug}-${action}`)) {
          const image = this.scene.textures.get(entry.slug).getSourceImage();
          context.drawImage(image, 8, 8, 80, 80);
          continue;
        }
        const image = this.scene.textures.get(`${entry.slug}-${action}`).getSourceImage();
        let at = this.scene.reducedEffects ? 0 : now % data.durations.reduce((sum,v)=>sum+v,0), frame = 0;
        while (frame < data.durations.length-1 && at >= data.durations[frame]) at -= data.durations[frame++];
        const scale = this.scene.animator.scaleFor(entry) * 0.72;
        const dir = i < 2 ? 2 : 6;
        context.drawImage(image,frame*data.width,dir*data.height,data.width,data.height,
          48-data.width*scale/2,48-data.height*scale/2,data.width*scale,data.height*scale);
      }
    }
  }
  window.PokeJamMatchSetup = MatchSetup;
}());
