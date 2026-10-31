#!/usr/bin/env node
// Draws the activity cards for the profile README from both GitHub accounts
// (JungMK0720 and minkyu-k530) plus LeetCode.
//
//   node scripts/build-cards.mjs [out dir]
//
// Needs the gh CLI with a token (GH_TOKEN in Actions). Writes calendar-*.svg,
// stats-*.svg, recent-*.svg and data.json. If LeetCode can't be reached, the
// numbers from the previous run (PREV_DATA=path/to/data.json) are reused.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const USERS = ["JungMK0720", "minkyu-k530"];
const LEETCODE_USER = "MKJung";
const PROFILE_REPO = "JungMK0720/JungMK0720";
const OUT = process.argv[2] ?? "dist";

const THEMES = {
  light: {
    bg: "#FFFFFF", border: "#E1E6EE", ink: "#162431", text: "#394553", muted: "#5C6874", faint: "#8B96A5",
    accent: "#2F6BDB", navy: "#002968", track: "#EEF2F7",
    scale: ["#EEF2F7", "#BBD3F5", "#7FAAEB", "#3B7DE0", "#002968"],
    split: ["#002968", "#7FAAEB"],
  },
  dark: {
    bg: "#0D1117", border: "#30363D", ink: "#E6EDF3", text: "#C9D1D9", muted: "#8B949E", faint: "#6E7681",
    accent: "#8AB8FF", navy: "#8AB8FF", track: "#161B22",
    scale: ["#161B22", "#0B2E63", "#0F4AA0", "#2F6BDB", "#8AB8FF"],
    split: ["#8AB8FF", "#2F6BDB"],
  },
};
const LEET = { Easy: "#1CBABA", Medium: "#FFB800", Hard: "#F63737" };
const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ---------------------------------------------------------------- fetch

function gql(query, vars) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(vars)) args.push("-f", `${k}=${v}`);
  const res = JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1 << 26 }));
  if (res.errors?.length) throw new Error("GraphQL: " + JSON.stringify(res.errors));
  return res.data;
}

const USER_QUERY = `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    login
    contributionsCollection(from: $from, to: $to) {
      restrictedContributionsCount
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
    }
    repositoriesContributedTo(first: 30, contributionTypes: [COMMIT], includeUserRepositories: true,
                              orderBy: { field: PUSHED_AT, direction: DESC }) {
      nodes { nameWithOwner pushedAt isFork isArchived isPrivate primaryLanguage { name color } }
    }
  }
}`;

async function leetcode(user) {
  try {
    const r = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", referer: "https://leetcode.com", "user-agent": "Mozilla/5.0" },
      body: JSON.stringify({
        query: `query($u: String!) { matchedUser(username: $u) { submitStatsGlobal { acSubmissionNum { difficulty count } } } }`,
        variables: { u: user },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const m = (await r.json()).data?.matchedUser;
    if (!m) return null;
    const by = Object.fromEntries(m.submitStatsGlobal.acSubmissionNum.map((x) => [x.difficulty, x.count]));
    return { solved: by.All, easy: by.Easy, medium: by.Medium, hard: by.Hard };
  } catch (e) {
    console.warn("LeetCode fetch failed:", e.message);
    return null;
  }
}

function previousLeetcode() {
  const p = process.env.PREV_DATA;
  if (!p || !existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")).leetcode ?? null; } catch { return null; }
}

// ---------------------------------------------------------------- text helpers

// SVG can't measure text, so widths are estimated per character class.
function units(ch) {
  if (ch === " ") return 0.28;
  if (/[.,:;'|!·]/.test(ch)) return 0.28;
  if (/[0-9]/.test(ch)) return 0.58;
  if (/[A-Z]/.test(ch)) return 0.66;
  if (/[a-z]/.test(ch)) return 0.54;
  return 0.6;
}
const widthOf = (s, size) => [...s].reduce((w, ch) => w + units(ch) * size, 0);
function clip(s, size, max) {
  if (widthOf(s, size) <= max) return s;
  let out = "", w = 0.6 * size;
  for (const ch of s) { const cw = units(ch) * size; if (w + cw > max) break; out += ch; w += cw; }
  return out.trimEnd() + "…";
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n) => Number(n).toLocaleString("en-US");
const T = (x, y, s, size, fill, extra = "") => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(s)}</text>`;

function ago(iso, now) {
  const d = Math.floor((now - new Date(iso)) / 864e5);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "last week";
  if (d < 30) return `${Math.floor(d / 7)} weeks ago`;
  if (d < 60) return "last month";
  if (d < 365) return `${Math.floor(d / 30)} months ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function card(theme, w, h, label, body, css = "") {
  const t = THEMES[theme];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">
<style>
text { font-family: ${FONT}; font-variant-numeric: tabular-nums; }
.in { opacity: 0; animation: in .5s ease-out forwards; }
@keyframes in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
${css}
</style>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>
${body}
</svg>`;
}

// ---------------------------------------------------------------- 1. calendar

function calendarCard(theme, d) {
  const t = THEMES[theme];
  const W = 832, H = 204, cell = 11, step = 14, ox = 52, oy = 68;
  let b = "";
  b += T(20, 34, "Contributions in the last year", 15, t.ink, 'font-weight="600"');
  b += T(812, 34, `${num(d.total)} across ${USERS.length} accounts`, 12, t.muted, 'text-anchor="end"');
  for (const [r, lab] of [[1, "Mon"], [3, "Wed"], [5, "Fri"]]) b += T(20, oy + r * step + 9, lab, 10, t.muted);
  for (const m of d.months) b += T(ox + m.col * step, 60, m.label, 10, t.muted);
  let css = `.c { transform-box: fill-box; transform-origin: center; animation: wave 9s ease-in-out infinite; }
@keyframes wave { 0%, 10%, 100% { transform: scale(1); } 5% { transform: scale(.5); } }
.now { animation: now 1.8s ease-in-out infinite; }
@keyframes now { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }`;
  d.grid.forEach((col, ci) => {
    css += `\n.k${ci} .c { animation-delay: ${(1.6 + ci * 0.03).toFixed(2)}s; }`;
    b += `<g class="in k${ci}" style="animation-delay:${ci * 14}ms">`;
    col.forEach((day, ri) => {
      if (!day) return;
      b += `<rect class="c" x="${ox + ci * step}" y="${oy + ri * step}" width="${cell}" height="${cell}" rx="2.5" fill="${t.scale[day.level]}"><title>${day.date}: ${day.count}</title></rect>`;
    });
    b += `</g>`;
  });
  const last = d.grid.length - 1, lr = d.grid[last].findLastIndex((x) => x);
  b += `<rect class="now" x="${ox + last * step - 2}" y="${oy + lr * step - 2}" width="${cell + 4}" height="${cell + 4}" rx="4" fill="none" stroke="${t.accent}" stroke-width="1.5"/>`;
  const note = d.restricted > 0 ? "Both accounts combined, private contributions included, redrawn every night" : "Both accounts combined, redrawn every night";
  b += T(20, 190, note, 10.5, t.faint);
  const lx = 812 - 5 * step - 28;
  b += T(lx - 6, 190, "Less", 10, t.muted, 'text-anchor="end"');
  t.scale.forEach((c, i) => { b += `<rect x="${lx + i * step}" y="181" width="${cell}" height="${cell}" rx="2.5" fill="${c}"/>`; });
  b += T(lx + 5 * step + 2, 190, "More", 10, t.muted);
  return card(theme, W, H, `${d.total} contributions in the last year across ${USERS.join(" and ")}`, b, css);
}

// ---------------------------------------------------------------- 2. stats

function statsCard(theme, d) {
  const t = THEMES[theme];
  const W = 408, H = 236;
  let b = "";
  b += T(20, 34, "Last 12 months", 15, t.ink, 'font-weight="600"');
  const big = [["Contributions", num(d.total)], ["Last 30 days", num(d.last30)], ["LeetCode solved", d.leet ? num(d.leet.solved) : "-"]];
  big.forEach(([label, v], i) => {
    const x = 20 + i * 126;
    b += `<g class="in" style="animation-delay:${100 + i * 90}ms">`;
    b += T(x, 84, v, 30, t.navy, 'font-weight="700" letter-spacing="-0.5"');
    b += T(x, 104, label, 11, t.muted);
    b += `</g>`;
  });
  b += T(20, 134, "By account", 11.5, t.text);
  const bw = 368;
  b += `<rect x="20" y="144" width="${bw}" height="8" rx="4" fill="${t.track}"/>`;
  let x = 20;
  d.perUser.forEach((u, i) => {
    const w = d.total ? (u.total / d.total) * bw : 0;
    b += `<rect x="${x.toFixed(1)}" y="144" width="0" height="8" rx="4" fill="${t.split[i]}"><animate attributeName="width" from="0" to="${w.toFixed(1)}" dur=".9s" begin=".3s" fill="freeze"/></rect>`;
    x += w;
  });
  d.perUser.forEach((u, i) => {
    const lx = 20 + i * 172;
    b += `<circle cx="${lx + 4}" cy="166" r="4" fill="${t.split[i]}"/>`;
    b += T(lx + 13, 170, `${u.login} ${num(u.total)}`, 11, t.muted);
  });
  if (d.leet) {
    const L = d.leet;
    b += T(20, 200, "LeetCode by difficulty", 11.5, t.text);
    [["Easy", L.easy, 176], ["Medium", L.medium, 246], ["Hard", L.hard, 330]].forEach(([k, v, kx]) => {
      b += `<circle cx="${kx}" cy="196" r="4" fill="${LEET[k]}"/>`;
      b += T(kx + 8, 200, `${k} ${num(v)}`, 11, t.muted);
    });
    b += `<rect x="20" y="210" width="${bw}" height="8" rx="4" fill="${t.track}"/>`;
    let sx = 20;
    for (const [k, v] of [["Easy", L.easy], ["Medium", L.medium], ["Hard", L.hard]]) {
      const w = L.solved ? (v / L.solved) * bw : 0;
      b += `<rect x="${sx.toFixed(1)}" y="210" width="0" height="8" rx="4" fill="${LEET[k]}"><animate attributeName="width" from="0" to="${w.toFixed(1)}" dur=".9s" begin=".5s" fill="freeze"/></rect>`;
      sx += w;
    }
  }
  return card(theme, W, H, `Last 12 months: ${d.total} contributions, ${d.last30} in the last 30 days`, b);
}

// ---------------------------------------------------------------- 3. recent repositories

function recentCard(theme, d) {
  const t = THEMES[theme];
  const W = 408, H = 236;
  let b = "";
  b += T(20, 34, "Recently pushed", 15, t.ink, 'font-weight="600"');
  b += T(388, 34, "public repositories", 11, t.muted, 'text-anchor="end"');
  const rows = d.repos.slice(0, 6);
  rows.forEach((r, i) => {
    const y = 66 + i * 29;
    const when = ago(r.pushedAt, d.now);
    const lang = r.primaryLanguage?.name ?? "";
    b += `<g class="in" style="animation-delay:${80 + i * 70}ms">`;
    b += T(388, y, when, 11, t.muted, 'text-anchor="end"');
    if (lang) {
      b += `<circle cx="252" cy="${y - 4}" r="4" fill="${r.primaryLanguage.color ?? t.faint}"/>`;
      b += T(261, y, clip(lang, 11, 72), 11, t.muted);
    }
    const [owner, name] = r.nameWithOwner.split("/");
    const room = 220;
    if (widthOf(owner + "/" + name, 12.5) <= room) {
      b += `<text x="20" y="${y}" font-size="12.5"><tspan fill="${t.muted}">${esc(owner)}/</tspan><tspan fill="${t.ink}" font-weight="600">${esc(name)}</tspan></text>`;
    } else {
      b += T(20, y, clip(name, 12.5, room), 12.5, t.ink, 'font-weight="600"');
    }
    b += `</g>`;
  });
  if (!rows.length) b += T(20, 80, "No public pushes yet.", 12, t.muted);
  return card(theme, W, H, `Recently pushed public repositories: ${rows.map((r) => r.nameWithOwner).join(", ")}`, b);
}

// ---------------------------------------------------------------- assemble

function assemble(users, leet, now) {
  const byDate = new Map();
  const perUser = [];
  let restricted = 0;
  for (const u of users) {
    const c = u.contributionsCollection;
    restricted += c.restrictedContributionsCount;
    perUser.push({ login: u.login, total: c.contributionCalendar.totalContributions });
    for (const w of c.contributionCalendar.weeks) for (const day of w.contributionDays)
      byDate.set(day.date, (byDate.get(day.date) ?? 0) + day.contributionCount);
  }
  const dates = [...byDate.keys()].sort();
  const first = new Date(dates[0] + "T00:00:00Z"), last = new Date(dates.at(-1) + "T00:00:00Z");

  const nonzero = [...byDate.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p) => (nonzero.length ? nonzero[Math.min(nonzero.length - 1, Math.floor(p * nonzero.length))] : 0);
  const cut = [q(0.25), q(0.5), q(0.75)];
  const level = (v) => (v <= 0 ? 0 : 1 + cut.filter((c) => v > c).length);

  const grid = [], months = [];
  const start = new Date(first); start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  let col = 0;
  for (const d = new Date(start); d <= last; col++) {
    const column = [];
    for (let r = 0; r < 7; r++, d.setUTCDate(d.getUTCDate() + 1)) {
      if (d < first || d > last) { column.push(null); continue; }
      const key = d.toISOString().slice(0, 10);
      const v = byDate.get(key) ?? 0;
      column.push({ date: key, count: v, level: level(v) });
      if (d.getUTCDate() === 1) months.push({ col: r === 0 ? col : col + 1, label: MONTHS[d.getUTCMonth()] });
    }
    grid.push(column);
  }
  const monthsShown = months.filter((m) => m.col <= grid.length - 2);

  const last30 = dates.slice(-30).reduce((sum, k) => sum + byDate.get(k), 0);
  const byMonth = new Map();
  for (const [k, v] of byDate) byMonth.set(k.slice(0, 7), (byMonth.get(k.slice(0, 7)) ?? 0) + v);
  const [bm, bc] = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const busiest = { label: bm ? `${MONTHS_LONG[Number(bm.slice(5)) - 1]} ${bm.slice(0, 4)}` : "-", count: bc };

  const total = perUser.reduce((s, u) => s + u.total, 0);
  const seen = new Set();
  const repos = users.flatMap((u) => u.repositoriesContributedTo.nodes)
    .filter((r) => r && !r.isFork && !r.isArchived && !r.isPrivate && r.nameWithOwner !== PROFILE_REPO)
    .filter((r) => (seen.has(r.nameWithOwner) ? false : seen.add(r.nameWithOwner)))
    .sort((a, b) => new Date(b.pushedAt) - new Date(a.pushedAt));
  return { grid, months: monthsShown, total, perUser, restricted, last30, busiest, leet, repos, now };
}

// ---------------------------------------------------------------- main

const now = new Date();
const from = new Date(now.getTime() - 364 * 864e5);
const users = USERS.map((login) => gql(USER_QUERY, { login, from: from.toISOString(), to: now.toISOString() }).user);
const leet = (await leetcode(LEETCODE_USER)) ?? previousLeetcode();
const data = assemble(users, leet, now);

mkdirSync(OUT, { recursive: true });
for (const theme of Object.keys(THEMES)) {
  writeFileSync(join(OUT, `calendar-${theme}.svg`), calendarCard(theme, data));
  writeFileSync(join(OUT, `stats-${theme}.svg`), statsCard(theme, data));
  writeFileSync(join(OUT, `recent-${theme}.svg`), recentCard(theme, data));
}
writeFileSync(join(OUT, "data.json"), JSON.stringify({
  generatedAt: now.toISOString(),
  window: { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) },
  total: data.total, last30Days: data.last30, perUser: data.perUser,
  busiest: data.busiest, leetcode: data.leet,
  recent: data.repos.slice(0, 6).map((r) => ({ repo: r.nameWithOwner, pushedAt: r.pushedAt })),
}, null, 2) + "\n");
console.log(`cards → ${OUT}/  ${data.total} contributions (${data.perUser.map((u) => `${u.login} ${u.total}`).join(", ")}), ` +
  `${data.last30} in the last 30 days, LeetCode ${data.leet?.solved ?? "n/a"}`);
