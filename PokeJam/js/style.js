(function () {
  class StyleLedger {
    constructor() { this.reset(); }
    reset() { this.totals = { player: 0, cpu: 0 }; this.players = {}; this.events = []; this.ids = new Set(); }
    award(id, player, category, value) {
      if (!value || this.ids.has(id)) return null;
      this.ids.add(id);
      const event = { id, player: player.slug, team: player.team, category, value };
      this.events.push(event);
      this.totals[player.team] += value;
      this.players[player.slug] = (this.players[player.slug] || 0) + value;
      return event;
    }
    finish(id, flight, clock, quarter) {
      if (!flight.made) return [];
      const rewards = [];
      const profile = flight.ultimate?.profile;
      const category = profile ? profile.name : flight.alley ? "ALLEY-OOP" : flight.kind === "dunk" ? "DUNK" : null;
      const value = profile ? profile.styleValue : flight.alley ? 125 : flight.kind === "dunk" ? 75 : 0;
      rewards.push(this.award(`${id}:finish`, flight.shooter, category, value));
      if (flight.fakeBite) rewards.push(this.award(`${id}:fake`, flight.shooter, "PUMP FAKE", 25));
      if (clock <= 0 && flight.period === quarter) rewards.push(this.award(`${id}:buzzer`, flight.shooter, "BUZZER BEATER", 50));
      return rewards.filter(Boolean);
    }
  }
  window.PokeJamStyleLedger = StyleLedger;
}());
