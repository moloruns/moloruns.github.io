(function () {
  const TYPES = {
    normal: [0xffe9ad, 0xffffff, "impact"],
    fire: [0xff5533, 0xffd166, "flame"],
    water: [0x38bdff, 0xc9f6ff, "wave"],
    electric: [0xffd923, 0xffffff, "lightning"],
    grass: [0x64df79, 0xe2ffab, "leaves"],
    ice: [0x92eaff, 0xffffff, "ice"],
    fighting: [0xff826a, 0xfff1c2, "pulse"],
    poison: [0xd569ee, 0xf6bcff, "shadow"],
    ground: [0xe8bd68, 0xfff0bb, "quake"],
    flying: [0xa3e1ff, 0xffffff, "vortex"],
    psychic: [0xff6bc5, 0xffe9fc, "pulse"],
    bug: [0xb8df51, 0xf2ffbd, "leaves"],
    rock: [0xcfbf9a, 0xffeed3, "shards"],
    ghost: [0x9572ff, 0xded1ff, "shadow"],
    dragon: [0x6688ff, 0xffcbf4, "claws"],
    dark: [0x866896, 0xe2c7f4, "eclipse"],
    steel: [0xb8d3e0, 0xffffff, "shards"],
    fairy: [0xff90cf, 0xffffff, "stars"],
  };

  const SIGNATURES = {
    pikachu: { name: "Volt Tackle", type: "electric", effect: "lightning", kind: "dunk" },
    charizard: { name: "Flare Blitz", type: "fire", effect: "flame", kind: "dunk" },
    gengar: { name: "Shadow Ball", type: "ghost", effect: "shadow", kind: "jumper" },
    mewtwo: { name: "Psystrike", type: "psychic", effect: "psystrike", kind: "jumper" },
    snorlax: { name: "Giga Impact", type: "normal", effect: "impact", kind: "dunk" },
    infernape: { name: "Flame Wheel", type: "fire", effect: "wheel", kind: "dunk" },
    lucario: { name: "Aura Sphere", type: "fighting", effect: "aura", kind: "jumper", color: 0x48baff },
    gardevoir: { name: "Moonblast", type: "fairy", effect: "moon", kind: "jumper" },
    darkrai: { name: "Dark Void", type: "dark", effect: "eclipse", kind: "jumper" },
    garchomp: { name: "Earthquake", type: "ground", effect: "quake", kind: "dunk" },
  };

  function profileFor(record, forceDunk = false) {
    const signature = SIGNATURES[record.slug];
    const type = signature?.type || record.types[0];
    const preset = TYPES[type] || TYPES.normal;
    const secondary = TYPES[record.types[1]];
    return {
      name: signature?.name || `${type[0].toUpperCase()}${type.slice(1)} Finish`,
      type,
      color: signature?.color || preset[0],
      accent: signature ? preset[1] : secondary?.[0] || preset[1],
      effect: signature?.effect || preset[2],
      kind: forceDunk ? "dunk" : signature?.kind
        || (record.attributes.dunk >= record.attributes.shooting ? "dunk" : "jumper"),
      signature: Boolean(signature),
      styleValue: signature ? 150 : 100,
    };
  }

  function polygon(g, points, color, alpha = 1) {
    g.fillStyle(color, alpha);
    g.fillPoints(points, true);
  }

  function star(g, x, y, radius, color, phase) {
    const points = Array.from({ length: 10 }, (_, i) => {
      const angle = phase + i * Math.PI / 5;
      const r = i % 2 ? radius * 0.4 : radius;
      return { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r };
    });
    polygon(g, points, color);
  }

  function ring(g, x, y, radius, color, phase) {
    g.lineStyle(3, color, 0.85);
    g.strokeCircle(x, y, radius);
    g.lineStyle(2, color, 0.65);
    g.beginPath();
    g.arc(x, y, radius + 9, phase, phase + Math.PI * 1.4);
    g.strokePath();
  }

  function render(g, frame) {
    const { profile, position, source, hoop, stage, progress, time, trail } = frame;
    const { effect, color, accent } = profile;
    const phase = time / 130;
    const radius = stage === "windup" ? 18 + progress * 32 : 24;
    const x = position.x;
    const y = position.y;
    g.clear();
    ring(g, x, y, radius, color, phase);
    if (stage === "windup") {
      for (let i = 0; i < 6; i += 1) {
        const a = phase + i * Math.PI / 3;
        const r = radius + 24 * (1 - progress);
        g.lineStyle(2, accent, 0.8);
        g.lineBetween(x + Math.cos(a) * r, y + Math.sin(a) * r,
          x + Math.cos(a) * (radius - 4), y + Math.sin(a) * (radius - 4));
      }
    }
    if (trail.length > 1) {
      g.lineStyle(7, color, 0.4);
      g.strokePoints(trail, false);
      g.lineStyle(2, accent, 0.9);
      g.strokePoints(trail, false);
    }
    switch (effect) {
      case "lightning":
        for (let i = 0; i < 5; i += 1) {
          const a = phase * 0.5 + i * Math.PI * 2 / 5;
          const dx = Math.cos(a), dy = Math.sin(a);
          g.lineStyle(4, color, 1);
          g.strokePoints([{ x, y }, { x: x + dx * 22 - dy * 13, y: y + dy * 22 + dx * 13 },
            { x: x + dx * 28 + dy * 11, y: y + dy * 28 - dx * 11 },
            { x: x + dx * 65, y: y + dy * 65 }], false);
        }
        break;
      case "flame":
      case "wheel":
        for (let i = 0; i < 9; i += 1) {
          const a = phase + i * Math.PI * 2 / 9;
          const px = x + Math.cos(a) * radius, py = y + Math.sin(a) * radius;
          const flare = effect === "wheel" ? a : -Math.PI / 2;
          polygon(g, [{ x: px - 9, y: py + 8 }, { x: px + 9, y: py + 8 },
            { x: px + Math.cos(flare) * 24, y: py + Math.sin(flare) * 32 }], color, 0.9);
          g.fillStyle(accent, 0.9); g.fillCircle(px, py, 5);
        }
        break;
      case "quake":
        g.lineStyle(4, color, 0.9);
        for (let i = 0; i < 6; i += 1) {
          const a = i * Math.PI / 3;
          const cx = stage === "impact" ? hoop.x : source.x;
          const cy = stage === "impact" ? hoop.y : source.y;
          const r = 40 + progress * 110;
          g.strokePoints([{ x: cx, y: cy }, { x: cx + Math.cos(a) * r * 0.5 - 10, y: cy + Math.sin(a) * r * 0.25 },
            { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.5 }], false);
        }
        break;
      case "aura":
      case "shadow":
      case "moon":
        g.fillStyle(effect === "shadow" ? 0x231335 : color, 0.9);
        g.fillCircle(x, y, 22);
        ring(g, x, y, 30, accent, -phase);
        if (effect === "moon") {
          g.fillStyle(accent, 0.9); g.fillCircle(x - 6, y - 4, 12);
          star(g, x + 37, y - 24, 9, accent, phase);
        } else {
          g.lineStyle(3, accent, 0.95);
          g.strokeEllipse(x, y, 28, 48);
          g.strokeEllipse(x, y, 48, 28);
        }
        break;
      case "eclipse":
        g.fillStyle(0x100b1c, 0.95); g.fillCircle(x, y, radius);
        ring(g, x, y, radius + 6, accent, -phase);
        if (stage === "flight" || stage === "impact") {
          g.lineStyle(4, color, 0.85); g.strokeEllipse(hoop.x, hoop.y, 130, 54);
        }
        break;
      case "psystrike":
        for (let i = 0; i < 3; i += 1) {
          const r = 24 + ((time / 12 + i * 18) % 65);
          ring(g, x, y, r, i % 2 ? accent : color, phase + i);
        }
        break;
      case "wave":
      case "vortex":
        for (let i = 0; i < 3; i += 1) {
          g.lineStyle(3, i % 2 ? accent : color, 0.8);
          g.strokeEllipse(x + Math.sin(phase + i) * 12, y, 45 + i * 20, 18 + i * 16);
        }
        break;
      case "leaves":
      case "shards":
        for (let i = 0; i < 8; i += 1) {
          const a = phase * 0.4 + i * Math.PI / 4;
          const px = x + Math.cos(a) * (radius + 15), py = y + Math.sin(a) * (radius + 15);
          polygon(g, [{ x: px - 5, y: py }, { x: px, y: py - 14 },
            { x: px + 7, y: py + 3 }, { x: px, y: py + 9 }], i % 2 ? accent : color);
        }
        break;
      case "ice":
      case "stars":
        for (let i = 0; i < 6; i += 1) {
          const a = phase * 0.3 + i * Math.PI / 3;
          star(g, x + Math.cos(a) * 44, y + Math.sin(a) * 44, effect === "ice" ? 8 : 11, accent, a);
        }
        break;
      case "claws":
        g.lineStyle(5, accent, 0.95);
        for (let i = -1; i <= 1; i += 1) g.lineBetween(x - 30 + i * 15, y + 30, x + 25 + i * 15, y - 30);
        break;
      default:
        ring(g, x, y, radius + 17, accent, -phase);
        g.lineStyle(3, color, 0.8); g.strokeEllipse(x, y + 22, 110, 30);
    }
    if (stage === "impact") {
      g.lineStyle(5, color, 1 - progress);
      g.strokeEllipse(hoop.x, hoop.y + 5, 70 + progress * 170, 30 + progress * 65);
    }
  }

  window.PokeJamFinishes = { TYPES, SIGNATURES, profileFor, render };
}());
