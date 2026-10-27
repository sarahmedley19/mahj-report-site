/* The Mahj Report web scorekeeper: scoring rules.
 *
 * A straight port of the app's math (app/(tabs)/rules.tsx parseRules,
 * calculateScoreFromRules, nmjlCustomBonuses and app/(tabs)/tonight.tsx
 * nmjlPayments / handleSaveNmjlHand / handleSaveScore / handleLogWallGame),
 * so a hand logged in the browser lands in the database exactly as the app
 * would have written it. Keep the two in step.
 */
(function (root) {
  var NMJL_DEFAULTS = {
    nmjl_no_deductions: false, nmjl_discard_double: true, nmjl_selfpick_double: true,
    nmjl_jokerless_double: true, nmjl_track_jokerless: false, nmjl_wall_enabled: false,
    nmjl_wall_value: 10, nmjl_custom_enabled: false,
    nmjl_bonus_jokerless_enabled: false, nmjl_bonus_jokerless_value: 10,
    nmjl_bonus_selfpick_enabled: false, nmjl_bonus_selfpick_value: 10,
    nmjl_bonus_concealed_enabled: false, nmjl_bonus_concealed_value: 10,
    nmjl_bonus_singles_pairs_enabled: false, nmjl_bonus_singles_pairs_value: 10,
    nmjl_bonus_quint_enabled: false, nmjl_bonus_quint_value: 10,
    nmjl_bonus_last_tile_enabled: false, nmjl_bonus_last_tile_value: 10,
    nmjl_bonus_heavenly_enabled: false, nmjl_bonus_heavenly_value: 25,
    nmjl_discard_penalty_enabled: false, nmjl_discard_penalty_value: 10,
    nmjl_discard_penalty_recipient: "none"
  };
  var DEFAULT_RULES = Object.assign({
    scoring_mode: "casual", mahjong: 2, attendance_enabled: false, attendance_value: 1,
    jokerless_enabled: true, jokerless_value: 1, concealed_enabled: true, concealed_value: 1,
    consecutive_enabled: true, consecutive_value: 1, singles_pairs_enabled: false, singles_pairs_value: 1,
    first_mahjong_enabled: false, first_mahjong_value: 1, self_drawn_enabled: false, self_drawn_value: 1,
    last_tile_enabled: false, last_tile_value: 1, heavenly_hand_enabled: false, heavenly_hand_value: 2,
    quint_enabled: false, quint_value: 1, discard_penalty_enabled: false, discard_penalty_value: 1,
    discard_penalty_recipient: "none"
  }, NMJL_DEFAULTS);

  function parseRules(data) {
    var r = Object.assign({}, DEFAULT_RULES);
    if (!data || typeof data !== "object") return r;
    Object.keys(DEFAULT_RULES).forEach(function (k) {
      var v = data[k], d = DEFAULT_RULES[k];
      if (v === undefined || v === null) return;
      if (typeof d === "number") { var n = Number(v); if (isFinite(n)) r[k] = n; }
      else if (typeof d === "boolean") r[k] = !!v;
    });
    r.scoring_mode = data.scoring_mode === "nmjl" ? "nmjl" : "casual";
    r.discard_penalty_recipient = data.discard_penalty_recipient === "winner" ? "winner" : "none";
    r.nmjl_discard_penalty_recipient = data.nmjl_discard_penalty_recipient === "winner" ? "winner" : "none";
    return r;
  }

  /* What the log screen asks. Only boxes that can change the score show
     (Sarah, 26 Oct), plus Jokerless when the host tracks it for the recap. */
  function nmjlAsks(r) {
    var flat = r.nmjl_no_deductions, custom = r.nmjl_custom_enabled;
    var discarder = (!flat && r.nmjl_discard_double) ||
      (custom && r.nmjl_discard_penalty_enabled && !!r.nmjl_discard_penalty_value);
    var selfPick = discarder || (!flat && r.nmjl_selfpick_double) ||
      (custom && r.nmjl_bonus_selfpick_enabled && !!r.nmjl_bonus_selfpick_value);
    var jokerScores = (!flat && r.nmjl_jokerless_double) ||
      (custom && r.nmjl_bonus_jokerless_enabled && !!r.nmjl_bonus_jokerless_value);
    return { discarder: !!discarder, selfPick: !!selfPick, jokerless: !!(jokerScores || r.nmjl_track_jokerless) };
  }

  function nmjlCustomBonuses(r) {
    if (r.scoring_mode !== "nmjl" || !r.nmjl_custom_enabled) return [];
    return [
      { key: "Concealed", label: "Concealed", on: r.nmjl_bonus_concealed_enabled, value: r.nmjl_bonus_concealed_value },
      { key: "Singles and Pairs", label: "Singles & Pairs", on: r.nmjl_bonus_singles_pairs_enabled, value: r.nmjl_bonus_singles_pairs_value },
      { key: "Quint", label: "Quint", on: r.nmjl_bonus_quint_enabled, value: r.nmjl_bonus_quint_value },
      { key: "Last Tile", label: "Last tile", on: r.nmjl_bonus_last_tile_enabled, value: r.nmjl_bonus_last_tile_value },
      { key: "Heavenly Hand", label: "Heavenly hand", on: r.nmjl_bonus_heavenly_enabled, value: r.nmjl_bonus_heavenly_value }
    ].filter(function (b) { return b.on && b.value !== 0; });
  }

  /* One NMJL hand: the winner's row plus one row per opponent at the table.
     h = { base, winnerId, opponents: [ids], selfPick, jokerless, discarderId, chips: {key: true} } */
  function nmjlHand(r, h) {
    var asks = nmjlAsks(r);
    var pickOn = asks.selfPick && !!h.selfPick;
    var jokerOn = asks.jokerless && !!h.jokerless;
    var discOn = asks.discarder && !pickOn ? (h.discarderId || "") : "";
    var base = h.base;
    var mult = jokerOn && r.nmjl_jokerless_double ? 2 : 1;
    var single = base * mult;
    var selfPay = r.nmjl_selfpick_double ? base * 2 * mult : single;
    var discardPay = r.nmjl_discard_double ? base * 2 * mult : single;
    var payments = h.opponents.map(function (id) {
      return { id: id, amount: pickOn ? selfPay : id === discOn ? discardPay : single };
    });
    var custom = r.nmjl_custom_enabled;
    var bonusTags = [];
    if (custom && jokerOn && r.nmjl_bonus_jokerless_enabled && r.nmjl_bonus_jokerless_value)
      bonusTags.push({ name: "Jokerless bonus", points: r.nmjl_bonus_jokerless_value });
    if (custom && pickOn && r.nmjl_bonus_selfpick_enabled && r.nmjl_bonus_selfpick_value)
      bonusTags.push({ name: "Self-pick bonus", points: r.nmjl_bonus_selfpick_value });
    nmjlCustomBonuses(r).forEach(function (b) { if (h.chips && h.chips[b.key]) bonusTags.push({ name: b.key, points: b.value }); });
    var bonus = bonusTags.reduce(function (t, b) { return t + b.points; }, 0);
    var penalty = custom && r.nmjl_discard_penalty_enabled && !pickOn && !!discOn ? r.nmjl_discard_penalty_value : 0;
    var penaltyToWinner = penalty && r.nmjl_discard_penalty_recipient === "winner" ? penalty : 0;
    var collected = (r.nmjl_no_deductions ? base : payments.reduce(function (t, p) { return t + p.amount; }, 0)) + bonus + penaltyToWinner;
    var tag = [{ name: "Card " + base, points: base }];
    if (pickOn) tag.push({ name: "Self-pick", points: 0 });
    if (jokerOn) tag.push({ name: "Jokerless", points: 0 });
    tag = tag.concat(bonusTags);
    var rows = [{ playerId: h.winnerId, score: collected, is_winner: true, bonuses: tag, suffix: "-w" }];
    payments.forEach(function (p, i) {
      rows.push({
        playerId: p.id,
        score: (r.nmjl_no_deductions ? 0 : -p.amount) - (p.id === discOn ? penalty : 0),
        is_winner: false, bonuses: tag, suffix: "-p" + i
      });
    });
    return { rows: rows, collected: collected, prefix: "nmjl-" };
  }

  /* Casual bonuses the host has turned on, in the app's order. */
  var CASUAL = [
    ["Jokerless", "jokerless"], ["Concealed", "concealed"], ["Self-drawn", "self_drawn"],
    ["Consecutive", "consecutive"], ["First mahjong", "first_mahjong"], ["Singles and Pairs", "singles_pairs"],
    ["Quint", "quint"], ["Last Tile", "last_tile"], ["Heavenly Hand", "heavenly_hand"]
  ];
  function casualBonusList(r) {
    return CASUAL.filter(function (c) { return r[c[1] + "_enabled"]; })
      .map(function (c) { return { key: c[0], value: r[c[1] + "_value"] }; });
  }

  /* h = { winnerId, bonuses: [names], discarderId ("" | "SELF" | id), firstOk, consecOk, nameOf(id) } */
  function casualHand(r, h) {
    var names = (h.bonuses || []).filter(function (k) {
      if (k === "Consecutive") return !!h.consecOk;
      if (k === "First mahjong") return !!h.firstOk;
      return true;
    });
    var score = r.mahjong, tags = [];
    casualBonusList(r).forEach(function (b) {
      if (names.indexOf(b.key) >= 0) { score += b.value; tags.push({ name: b.key, points: b.value }); }
    });
    var target = r.discard_penalty_enabled && h.discarderId && h.discarderId !== "SELF" && h.discarderId !== h.winnerId
      ? h.discarderId : "";
    var pen = Math.abs(r.discard_penalty_value);
    var toWinner = !!target && r.discard_penalty_recipient === "winner";
    var winScore = toWinner ? score + pen : score;
    if (toWinner) tags.push({ name: "Discard penalty from " + (h.nameOf ? h.nameOf(target) : "player"), points: pen });
    var rows = [{ playerId: h.winnerId, score: winScore, is_winner: winScore > 0, bonuses: tags, suffix: "" }];
    if (target) rows.push({
      playerId: target, score: -pen, is_winner: false,
      bonuses: [{ name: "Discarded winning tile", points: -pen }], suffix: "-pen"
    });
    return { rows: rows, collected: winScore, prefix: "client-" };
  }

  function wallPoints(r) { return r.scoring_mode === "nmjl" && r.nmjl_wall_enabled ? r.nmjl_wall_value : 0; }

  var api = { parseRules: parseRules, nmjlAsks: nmjlAsks, nmjlHand: nmjlHand, nmjlCustomBonuses: nmjlCustomBonuses,
    casualBonusList: casualBonusList, casualHand: casualHand, wallPoints: wallPoints, DEFAULT_RULES: DEFAULT_RULES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MahjScoring = api;
})(this);
