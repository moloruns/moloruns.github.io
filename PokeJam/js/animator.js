(function () {
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

  class CharacterAnimator {
    constructor(scene, manifest) {
      this.scene = scene;
      this.manifest = manifest.players || {};
      this.bodyMetrics = new Map();
      this.frameAnchors = new Map();
      for (const [slug, record] of Object.entries(this.manifest)) {
        this.measureBody(slug, record);
        const idle = window.PokeJamRoster.players.find(p => p.slug === slug)?.visual.animation?.actions.idle;
        for (const [action, data] of Object.entries(record.actions)) {
          const texture = `${slug}-${action}`;
          if (!scene.textures.exists(texture)) continue;
          const columns = data.durations.length;
          const rows = Math.floor(scene.textures.get(texture).getSourceImage().height / data.height);
          for (let direction = 0; direction < rows; direction += 1) {
            scene.anims.create({ key: `${texture}-${direction}`, frames: Array.from({ length: columns }, (_, i) => ({
              key: texture, frame: direction * columns + i, duration: data.durations[i],
            })), duration: 1, repeat: ["Walk", "Idle", idle].includes(action) ? -1 : 0 });
          }
        }
      }
    }

    measureBody(slug, record) {
      const entry = window.PokeJamRoster.players.find(p => p.slug === slug);
      const data = record.actions.Idle, texture = this.scene.textures.get(`${slug}-Idle`);
      if (!data || !texture || texture.key === "__MISSING") return;
      const source = texture.getSourceImage(), canvas = document.createElement("canvas");
      canvas.width = source.width; canvas.height = source.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(source, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let extent = 1;
      // One scale for every pose and direction: transparent sheet padding cannot alter body size.
      for (let y = 0; y < source.height; y += data.height) for (let x = 0; x < source.width; x += data.width) {
        let left = data.width, top = data.height, right = -1, bottom = -1;
        for (let j = 0; j < data.height; j++) for (let i = 0; i < data.width; i++) {
          if (pixels[((y+j)*source.width+x+i)*4+3] <= 8) continue;
          left = Math.min(left,i); right = Math.max(right,i); top = Math.min(top,j); bottom = Math.max(bottom,j);
        }
        extent = Math.max(extent, right-left+1, bottom-top+1);
      }
      const requested = Number(entry?.visual.bodySize);
      const target = clamp(Number.isFinite(requested) && requested > 0 ? requested : 70, 45, 112);
      this.bodyMetrics.set(slug, { extent, target, scale: clamp(target / extent, 0.5, 4.5) });
    }

    scaleFor(player) {
      return this.bodyMetrics.get(player.slug)?.scale ?? player.visual?.scale ?? 2.1;
    }

    anchorContact(sprite) {
      const frame = sprite.frame, key = `${sprite.texture.key}:${frame.name}`;
      let anchor = this.frameAnchors.get(key);
      if (!anchor) {
        const canvas = document.createElement("canvas");
        canvas.width = frame.cutWidth; canvas.height = frame.cutHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(sprite.texture.getSourceImage(), frame.cutX, frame.cutY,
          frame.cutWidth, frame.cutHeight, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          if (pixels[(y * canvas.width + x) * 4 + 3] <= 8) continue;
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        // Source attack sheets contain root motion; keep contact centered on the court body.
        anchor = right < 0 ? [0.5, 0.5]
          : [(left + right + 1) / (2 * canvas.width), (top + bottom + 1) / (2 * canvas.height)];
        this.frameAnchors.set(key, anchor);
      }
      sprite.setOrigin(...anchor);
    }

    shoveProgress(p, now) {
      return p.actionCue === "shove" ? 0.12 + clamp((now - p.actionVisualStartedAt) / p.actionVisualDuration) * 0.87
        : clamp(p.shove.elapsed / p.shove.duration);
    }

    actionPose(p, now) {
      const actions = p.visual.animation.actions;
      const pose = (cue, fallback, progress = null) => ({ cue, action: actions[cue] || fallback, progress });
      if (this.scene.firePerks.locked(p)) return { cue: "disabled", action: "Idle", progress: 0 };
      if (p.knockback || (now < p.disabledUntil && now >= (p.reachUntil || 0)))
        return pose("hurt", "Hurt", clamp(1 - (p.disabledUntil - now) / 480));
      if (p.actionCue === "celebrate" && now < p.actionVisualUntil && this.scene.ball.state === "dead")
        return pose("celebrate", "Pose", 0.12 + clamp((now - p.actionVisualStartedAt) / p.actionVisualDuration) * 0.87);
      if (p.shove) return { ...pose("shove", "Attack", this.shoveProgress(p, now)), replayAt: p.actionVisualStartedAt };
      if (p.ultimate) return p.ultimate.stage === "windup"
        ? pose("charge", "Charge", 0.1 + p.ultimate.progress * 0.7)
        : pose("dunk", "Attack", clamp(p.ultimate.progress / 0.78));
      if (p.dunking) {
        const t = clamp(p.dunk.elapsed / p.dunk.duration);
        return t < 0.18 ? pose("gather", "Charge", 0.2 + t * 2)
          : pose("dunk", "Attack", 0.12 + clamp((t - 0.18) / 0.54) * 0.86);
      }
      if (p.blocking || p.alleyPrep) {
        const t = p.alleyPrep ? clamp(p.alleyPrep.elapsed / p.alleyPrep.duration)
          : p.vz > 0 ? clamp(p.z / 250, 0, 0.45) : clamp(0.5 + (1 - p.z / 180) * 0.45, 0.5, 0.95);
        return pose("block", "Charge", t);
      }
      if (p.shooting) {
        // Native frames follow the basketball release, not their original game timing.
        if (p.shotAttempt?.released) return pose("shot", "Shoot", 0.25 + clamp((now - p.shotAttempt.releaseAt) / 320) * 0.74);
        if (this.scene.ultimate?.shooter === p && this.scene.ultimate.stage === "flight")
          return { ...pose("ultimate", "Shoot", 0.12 + clamp((now - p.actionVisualStartedAt) / p.actionVisualDuration) * 0.87),
            replayAt: p.actionVisualStartedAt };
        return pose("gather", "Charge", 0.12 + clamp((now - p.shotStartedAt) / 520) * 0.65);
      }
      if (p.pendingShot) return pose("gather", "Charge", 0.1 + clamp((now - p.pendingShot.startedAt) / 150) * 0.55);
      if (now < p.fakeUntil) return pose("fake", "Charge", 0.15 + Math.sin(clamp(1 - (p.fakeUntil - now) / 220) * Math.PI) * 0.6);
      if (now < p.actionVisualUntil) {
        const t = clamp((now - (p.actionVisualStartedAt ?? now)) / Math.max(1, p.actionVisualDuration || 350));
        const cue = p.actionCue || "action";
        return { ...pose(cue, p.actionVisual, cue === "catch" ? 0.1 + Math.sin(t * Math.PI) * 0.4 : 0.12 + t * 0.87),
          replayAt: p.actionVisualStartedAt };
      }
      if (p.passCharge) return pose("gather", "Charge", 0.2 + Math.sin((now - p.passCharge.startedAt) / 160) * 0.08);
      if (p.jockeying) return pose("guard", "Charge", 0.18 + Math.sin(now / 130) * 0.07);
      return p.moving ? pose("run", "Walk") : pose("idle", "Idle");
    }

    motion(p, point, pose) {
      const sprite = p.sprite, s = this.scene, profile = p.visual.animation;
      const base = this.scaleFor(p) * point.scale;
      let x = 0, y = 0, tilt = 0, sx = 1, sy = 1;
      if (p.z > 0) p.visualWasAirborne = true;
      else if (p.visualWasAirborne) { p.visualWasAirborne = false; p.visualLandedAt = s.matchTime; }
      if (!s.reducedEffects && !s.firePerks.locked(p)) {
        const beat = s.matchTime / 90 * profile.cadence;
        const floating = ["spectral", "psychic", "flying"].includes(profile.style);
        const direction = Math.cos((2 - p.facing) * Math.PI / 4);
        if (p.z === 0 && ["idle", "run", "guard", "catch"].includes(pose.cue)) {
          if (pose.cue === "idle") sy += Math.sin(s.matchTime / 230) * 0.012;
          if (floating) y -= 2.5 + Math.sin(s.matchTime / 190) * 2;
          else if (p.moving) y -= Math.abs(Math.sin(beat)) * (profile.style === "heavy" ? 1 : 1.6);
          if (p.moving) tilt = direction * (profile.style === "agile" ? p.turboing ? 0.15 : 0.09 : 0.035);
          if (profile.style === "heavy" && p.moving) tilt += Math.sin(beat) * 0.025;
        }
        const t = pose.progress ?? 0, pulse = Math.sin(t * Math.PI);
        if (["pass", "perk", "ultimate", "steal"].includes(pose.cue)) {
          x -= direction * pulse * (profile.style === "heavy" ? 4 : 2);
          tilt -= direction * pulse * 0.07;
          sx += pulse * 0.03; sy -= pulse * 0.02;
        } else if (pose.cue === "shove") {
          x += direction * pulse * 2;
          tilt += direction * pulse * 0.025;
        } else if (["gather", "fake", "catch"].includes(pose.cue)) {
          sx += pulse * 0.035; sy -= pulse * 0.055;
        } else if (pose.cue === "dunk") {
          sy += pulse * 0.07; sx -= pulse * 0.025;
          tilt += direction * pulse * (profile.style === "agile" ? 0.14 : 0.05);
        } else if (pose.cue === "charge") {
          sx += pulse * 0.035; sy += pulse * 0.035;
        }
        const landing = clamp(1 - (s.matchTime - (p.visualLandedAt ?? -1000)) / 150);
        if (p.z === 0 && landing > 0) { sx += landing * 0.06; sy -= landing * 0.08; }
      }
      const wheel = !s.reducedEffects && p.ultimate?.stage === "drive" && p.ultimate.profile.effect === "wheel"
        ? p.ultimate.progress * Math.PI * 6 : 0;
      sprite.setPosition(point.x + x * point.scale, point.y + y * point.scale)
        .setScale(base * sx, base * sy).setRotation(tilt + wheel);
      p.visualOffset = { x, y };
    }

    sync(player, point) {
      const s = this.scene, now = s.matchTime;
      let action = "Idle", progress = null;
      const incapacitated = s.firePerks?.locked(player);
      if (now < player.disabledUntil) action = "Hurt";
      else if (player.shove) { action = "Attack"; progress = this.shoveProgress(player, now); }
      else if (player.ultimate) {
        action = player.ultimate.stage === "windup" ? "Charge" : "Attack";
        progress = player.ultimate.progress;
      } else if (player.dunking) { action = "Attack"; progress = Math.min(1, player.dunk.elapsed / player.dunk.duration); }
      else if (player.blocking || player.alleyPrep) { action = "Charge"; progress = Math.min(1, player.z / 110); }
      else if (player.shooting || player.pendingShot || now < player.fakeUntil) {
        action = "Shoot";
        progress = player.pendingShot || now < player.fakeUntil ? 0.2 : Math.min(1, (now - player.shotStartedAt) / 650);
      } else if (now < player.actionVisualUntil) {
        action = player.actionVisual;
        if (player.actionCue === "shove") progress = this.shoveProgress(player, now);
      }
      else if (player.moving) action = "Walk";
      if (incapacitated) { action = "Idle"; progress = 0; }
      const pose = player.visual?.animation ? this.actionPose(player, now) : { action, progress, cue: action };
      ({ action, progress } = pose);

      const record = this.manifest[player.slug];
      if (!record) {
        player.sprite.anims.stop();
        player.sprite.setTexture(player.slug).setOrigin(0.5, 1).setScale((player.visual?.staticScale ?? 1) * point.scale);
        if (player.visual?.animation) player.sprite.setRotation(0);
        return;
      }
      if (!record.actions[action]) action = action === "Shoot" && record.actions.Charge ? "Charge" : "Idle";
      const direction = player.facing ?? (player.team === "player" ? 2 : 6);
      let key = `${player.slug}-${action}-${direction}`;
      if (!s.anims.exists(key)) key = `${player.slug}-${action}-0`;
      if (!s.anims.exists(key)) {
        player.sprite.anims.stop();
        player.sprite.setTexture(player.slug).setOrigin(0.5, 1).setScale((player.visual?.staticScale ?? 1) * point.scale);
        if (player.visual?.animation) player.sprite.setRotation(0);
        return;
      }
      const sprite = player.sprite;
      if (sprite.anims.currentAnim?.key !== key || sprite.texture.key !== `${player.slug}-${action}`
        || player.visual?.animation && (player.visualCue !== pose.cue || player.renderedActionAt !== pose.replayAt)) sprite.play(key);
      const cadence = player.visual?.animation?.cadence ?? 1;
      const pace = player.visual?.animation ? clamp((player.visualPace || 180) / 180, 0.2, 1.8) : 1;
      sprite.anims.timeScale = action === "Walk" ? (player.turboing ? 1.8 : 1.25) * cadence * pace : cadence;
      if (progress !== null) {
        sprite.anims.pause();
        sprite.anims.setProgress(Math.max(0, Math.min(0.99, progress)));
      } else if (!s.isPaused && !s.gameOver) sprite.anims.resume();
      sprite.setOrigin(0.5, 0.5).setScale(this.scaleFor(player) * point.scale).setFlipX(false);
      if (player.visual?.animation) this.motion(player, point, pose);
      if (player.slug === "darkrai" || ["shove", "steal"].includes(pose.cue) || player.shove
        || ["shove", "steal"].includes(player.actionCue) && now < player.actionVisualUntil)
        this.anchorContact(sprite);
      player.visualAction = action;
      player.visualCue = pose.cue;
      player.visualProgress = progress;
      player.renderedActionAt = pose.replayAt;
    }

    pause(paused) {
      for (const player of this.scene.players) {
        if (paused) player.sprite.anims.pause();
        else if (!player.ultimate && !player.dunking && !player.shooting) player.sprite.anims.resume();
      }
    }
  }

  window.PokeJamAnimator = CharacterAnimator;
}());
