import express from "express";
import { fetch } from "undici";

const app = express();
const PORT = process.env.PORT || 3000;

// 🔒 your Steam vanity ID
const CUSTOM_ID = "PRIX0N";

// 👇 fallback (used only if Steam doesn’t show “Perfect Games”)
const PERFECT_FALLBACK = 132;

const PROFILE_BASE = `https://steamcommunity.com/id/${CUSTOM_ID}/`;

/* ----------------------------------------------------------
   Fetch helper
---------------------------------------------------------- */
async function getText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "steam-status-svg/1.0",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.text();
}

/* ----------------------------------------------------------
   Games count
---------------------------------------------------------- */
async function getGameCountFromWeb() {
  const html = await getText(`https://steamcommunity.com/id/${CUSTOM_ID}/games/?l=english`);

  const patterns = [
    /All\s+Games\s*\(([0-9,\.]+)\)/i,
    /Games\s*\(([0-9,\.]+)\)/i,
    /data-games_count="([0-9,\.]+)"/i,
    /id="gameslist_sort_options"[\s\S]{0,200}\(([0-9,\.]+)\)/i,
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const n = Number(m[1].replace(/[, ]/g, ""));
      if (Number.isFinite(n) && n > 0 && n < 50000) return n;
    }
  }
  return 0;
}

/* ----------------------------------------------------------
   Perfect Games count (NEW version)
---------------------------------------------------------- */
async function getPerfectGamesFromWeb() {
  const html = await getText(`https://steamcommunity.com/id/${CUSTOM_ID}/games/?l=english`);

  // Detect tab format:  <a href="...tab=perfect">Perfect Games (132)</a>
  const m =
    html.match(/tab=perfect[^>]*>\s*Perfect\s*Games\s*\(([0-9,\.]+)\)/i) ||
    html.match(/Perfect\s+Games\s*\(([0-9,\.]+)\)/i);

  if (m) {
    const n = Number(m[1].replace(/[, ]/g, ""));
    if (Number.isFinite(n) && n >= 0 && n < 10000) return n;
  }

  return 0;
}

/* ----------------------------------------------------------
   Badges count
---------------------------------------------------------- */
function parseBadgesFromProfile(html) {
  const m =
    html.match(
      /Badges[\s\S]{0,120}?profile_count_link_total[^>]*>\s*([0-9\+]+)\s*</i
    ) ||
    html.match(
      /<span[^>]*class="profile_count_link_total"[^>]*>\s*([0-9\+]+)\s*<\/span>[\s\S]{0,40}Badges/i
    );

  if (!m) return 0;

  let val = m[1].trim();
  if (val.endsWith("+")) val = val.slice(0, -1);
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

/* ----------------------------------------------------------
   Level from profile
---------------------------------------------------------- */
function parseLevelFromProfile(html) {
  let m = html.match(
    /<span[^>]*class="friendPlayerLevelNum"[^>]*>\s*([0-9]+)\s*<\/span>/i
  );
  if (m) return Number(m[1]);

  m = html.match(
    /<div[^>]*class="persona_level"[^>]*>[^0-9]*([0-9]+)[^0-9]*<\/div>/i
  );
  if (m) return Number(m[1]);

  return 0;
}

/* ----------------------------------------------------------
   Awards & Achievements
---------------------------------------------------------- */
function parseOtherStatsFromProfile(html) {
  const awardsM =
    html.match(/Profile\s*Awards[^0-9]*([0-9][0-9,\.]*)/i) ||
    html.match(/Profile\s*Awards<\/div>\s*<div[^>]*>\s*([0-9,\.]+)/i);
  const awards = awardsM ? Number(awardsM[1].replace(/[, ]/g, "")) : 0;

  const achM =
    html.match(/([0-9][0-9,\.]*)\s*Achievements/i) ||
    html.match(/>Achievements<\/div>\s*<div[^>]*>\s*([0-9,\.]+)\s*</i);
  const achievements = achM ? Number(achM[1].replace(/[, ]/g, "")) : 0;

  return { awards, achievements };
}

/* ----------------------------------------------------------
   Fetch all stats
---------------------------------------------------------- */
async function fetchSteamStats() {
  const profileHtml = await getText(PROFILE_BASE);

  // nickname
  const nicknameMatch = profileHtml.match(
    /<span class="actual_persona_name">([\s\S]*?)<\/span>/
  );
  const nickname = nicknameMatch ? nicknameMatch[1].trim() : "Unknown";

  // level, badges, achievements
  const level = parseLevelFromProfile(profileHtml);
  const badges = parseBadgesFromProfile(profileHtml);
  const { awards, achievements } = parseOtherStatsFromProfile(profileHtml);

  // games + perfect games
  let games = await getGameCountFromWeb();
  if (games === 0) games = 274;

  let perfect = await getPerfectGamesFromWeb();
  if (perfect === 0) perfect = PERFECT_FALLBACK;

  return {
    nickname,
    level,
    games,
    perfect,
    achievements,
    badges,
    awards,
    at: new Date().toISOString(),
  };
}

/* ----------------------------------------------------------
   SVG helpers
---------------------------------------------------------- */
function escapeXML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* ----------------------------------------------------------
   SVG generator
---------------------------------------------------------- */
function svg(stats) {
  const card = (x, title, value) => `
    <g transform="translate(${x},0)">
      <rect x="0" y="0" width="270" height="130" rx="14"
        fill="url(#cardBg)"
        stroke="url(#cardBorder)"
        stroke-width="2"/>
      <text x="20" y="40" fill="#c8b9d4" font-size="22" font-weight="500">
        ${title}
      </text>
      <text x="20" y="95" fill="#ff4dd8" font-size="54" font-weight="700" opacity="0.35" filter="url(#numberGlow)">
        ${value.toLocaleString("de-DE")}
      </text>
      <text x="20" y="95" fill="#ffffff" font-size="54" font-weight="700">
        ${value.toLocaleString("de-DE")}
      </text>
    </g>
  `;

  const awardsCard = () => `
    <g>
      <rect x="0" y="0" width="1128" height="140" rx="14"
        fill="url(#cardBg)"
        stroke="url(#cardBorder)"
        stroke-width="2"/>
      <text x="20" y="40" fill="#c8b9d4" font-size="22" font-weight="500">
        Awards
      </text>
      <text x="20" y="100" fill="#ff4dd8" font-size="48" font-weight="700" opacity="0.35" filter="url(#numberGlow)">
        ${stats.awards.toLocaleString("de-DE")}
      </text>
      <text x="20" y="100" fill="#ffffff" font-size="48" font-weight="700">
        ${stats.awards.toLocaleString("de-DE")}
      </text>
      <g transform="translate(200,55)">
        ${awardIcon(0)} ${awardIcon(50)} ${awardIcon(100)} ${awardIcon(150)} ${awardIcon(200)}
      </g>
    </g>
  `;

  function awardIcon(x) {
    return `
      <g transform="translate(${x},0)">
        <circle cx="16" cy="16" r="16" fill="#ff4dd8" opacity="0.3" filter="url(#numberGlow)"/>
        <circle cx="16" cy="16" r="12" fill="#ffffff"/>
      </g>
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="520" viewBox="0 0 1200 520" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bgGrad" cx="0.5" cy="0.4" r="0.8">
      <stop offset="0%" stop-color="#0a0a11"/>
      <stop offset="60%" stop-color="#130017"/>
      <stop offset="100%" stop-color="#1a0024"/>
    </radialGradient>
    <linearGradient id="cardBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d0d12"/>
      <stop offset="100%" stop-color="#1a1a28"/>
    </linearGradient>
    <linearGradient id="cardBorder" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff4dd8"/>
      <stop offset="40%" stop-color="#ff4dd8" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#ff4dd8" stop-opacity="0"/>
    </linearGradient>
    <filter id="numberGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="blur1"/>
      <feMerge><feMergeNode in="blur1"/></feMerge>
    </filter>
    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff4dd8"/>
      <stop offset="100%" stop-color="#ff3baf"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="520" fill="url(#bgGrad)"/>

  <g transform="translate(36,70)">
    <text x="0" y="0" font-size="40" font-weight="700" fill="#ffffff">${escapeXML(stats.nickname)}</text>
    <text x="0" y="32" font-size="18" fill="#c8b9d4">Steam Level ${stats.level}</text>
  </g>

  <rect x="36" y="82" width="1128" height="4" rx="2" fill="url(#barGrad)"/>

  <g transform="translate(36,120)">
    ${card(0, "Games", stats.games)}
    ${card(290, "Perfect Games", stats.perfect)}
    ${card(580, "Achievements", stats.achievements)}
    ${card(870, "Badges", stats.badges)}
  </g>

  <g transform="translate(36,280)">${awardsCard()}</g>

  <text x="36" y="500" fill="#c8b9d4" font-size="16">
    Source: steamcommunity.com/id/${CUSTOM_ID} • Updated: ${stats.at}
  </text>
</svg>`;
}

/* ----------------------------------------------------------
   Express route
---------------------------------------------------------- */
app.get("/steam-status.svg", async (req, res) => {
  try {
    const stats = await fetchSteamStats();
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.send(svg(stats));
  } catch (err) {
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res
      .status(500)
      .send(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="200">
          <rect width="1000" height="200" fill="#1b2236" />
          <text x="30" y="70" fill="#ffd166" font-size="28">Steam Status Unavailable</text>
          <text x="30" y="120" fill="#ffb3c7" font-size="16">${String(
            err?.message ?? err
          )
            .replace(/</g, "&lt;")
            .slice(0, 300)}</text>
        </svg>`
      );
  }
});

app.listen(PORT, () => {
  console.log("✅ Server running at http://localhost:" + PORT);
});
