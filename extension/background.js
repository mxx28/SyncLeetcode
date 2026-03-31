function isLeetcodeProblemSubmitUrl(url) {
  try {
    const u = new URL(url);
    if (!/\/submit(\/|$|\?)/.test(u.pathname)) return false;
    if (!u.pathname.startsWith('/problems/')) return false;
    const h = u.hostname;
    if (h === 'leetcode.com') return true;
    if (h === 'leetcode.cn' || h.endsWith('.leetcode.cn')) return true;
    if (h === 'lingkou.xyz' || h.endsWith('.lingkou.xyz')) return true;
    return false;
  } catch (_) {
    return false;
  }
}

const LANG_EXT = {
  python: 'py',
  python3: 'py',
  cpp: 'cpp',
  'c++': 'cpp',
  java: 'java',
  javascript: 'js',
  typescript: 'ts',
  c: 'c',
  go: 'go',
  rust: 'rs',
  ruby: 'rb',
  swift: 'swift',
  kotlin: 'kt',
  php: 'php',
  dart: 'dart',
  scala: 'scala',
  mysql: 'sql',
  mssql: 'sql',
  oraclesql: 'sql',
};

function extFromLang(detail) {
  const name = (detail?.lang?.name || '').toLowerCase();
  const verbose = (detail?.lang?.verboseName || '').toLowerCase();
  if (LANG_EXT[name]) return LANG_EXT[name];
  if (verbose.includes('python')) return 'py';
  if (verbose.includes('c++') || verbose.includes('cpp')) return 'cpp';
  if (verbose.includes('java') && !verbose.includes('javascript')) return 'java';
  if (verbose.includes('javascript')) return 'js';
  if (verbose.includes('typescript')) return 'ts';
  if (verbose.includes('go')) return 'go';
  if (verbose.includes('rust')) return 'rs';
  if (verbose.includes('ruby')) return 'rb';
  if (verbose.includes('swift')) return 'swift';
  if (verbose.includes('kotlin')) return 'kt';
  if (verbose.includes('php')) return 'php';
  if (verbose.includes('dart')) return 'dart';
  if (verbose.includes('scala')) return 'scala';
  if (verbose.includes('c#') || name === 'csharp') return 'cs';
  return 'txt';
}

function sanitizePathPart(s) {
  return String(s || '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 120);
}

/** Keep enough days for a GitHub-style heatmap; old entries drop `seen` to save space. */
const SYNC_DAILY_STATS_MAX_DAYS = 400;

const SYNCL_ACTIVITY_SVG = 'syncl-activity.svg';
const HEATMAP_WEEKS = 13;
const HEATMAP_DOW = 7;

/** Heatmap: light → saturated teal (LeetCode-adjacent). */
const HEAT_GRID_EMPTY = '#ebedf0';
const HEAT_GRID_LEVELS = ['#c5f0e8', '#5fd4be', '#1fc1a5', '#008f7a'];

/** Donut: LeetCode-style Easy / Medium / Hard. */
const LC_EASY = '#00af9b';
const LC_MEDIUM = '#ffa116';
const LC_HARD = '#ef4743';
const LC_OTHER = '#8b949e';

/** Linked from the auto-created README in the user’s solutions folder. */
const SYNC_LEETCODE_PROJECT_URL = 'https://github.com/mxx28/SynLeetcode';

function repoPublicUrl(cfg) {
  return `https://github.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
}

function syncFolderReadmeMarkdown(cfg, activityChartWidth = 560) {
  const repoUrl = repoPublicUrl(cfg);
  const owner = String(cfg.owner || '').trim() || 'Your';
  const w = Math.max(320, Math.round(Number(activityChartWidth) || 560));
  return `<div align="center">

## ${owner} progress at LeetCode 🚀

[![LeetCode](https://img.shields.io/badge/LeetCode-FFA116?style=flat&logo=leetcode&logoColor=black)](https://leetcode.com) [![GitHub](https://img.shields.io/badge/GitHub-181717?style=flat&logo=github)](${repoUrl}) [![SyncLeetcode](https://img.shields.io/badge/SyncLeetcode-extension-1a7c3e?style=flat&logo=googlechrome&logoColor=white)](${SYNC_LEETCODE_PROJECT_URL})

</div>

<p align="center"><img src="${SYNCL_ACTIVITY_SVG}" alt="SyncLeetcode activity" width="${w}" /></p>

<p align="center"><sub>Powered by <a href="${SYNC_LEETCODE_PROJECT_URL}">SyncLeetcode</a></sub></p>

<!--syncl-managed-->
`;
}

/** Refresh repo-root \`README.md\` each sync when enabled (managed template). */
async function upsertSyncFolderReadme(cfg, activityChartWidth) {
  if (cfg.syncFolderReadme === false) return;
  const relPath = 'README.md';
  const sha = await githubGetFileSha(cfg.token, cfg.owner, cfg.repo, relPath, cfg.branch);
  const body = syncFolderReadmeMarkdown(cfg, activityChartWidth);
  await githubPutFile(
    cfg.token,
    cfg.owner,
    cfg.repo,
    relPath,
    cfg.branch,
    body,
    'SyncLeetcode: update README',
    sha,
  );
}

function localDateKey(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function yesterdayDateKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateKey(d.getTime());
}

function dayActivityTotal(row) {
  if (!row || typeof row !== 'object') return 0;
  return (
    (Number(row.easy) || 0) +
    (Number(row.medium) || 0) +
    (Number(row.hard) || 0) +
    (Number(row.other) || 0)
  );
}

/** Drop per-day \`seen\` maps for days before yesterday to limit storage. */
function compactDailyStatsSeen(map) {
  const yKey = yesterdayDateKey();
  const out = { ...map };
  for (const k of Object.keys(out)) {
    if (k >= yKey) continue;
    const d = out[k];
    if (!d || typeof d !== 'object' || !d.seen) continue;
    out[k] = {
      easy: Number(d.easy) || 0,
      medium: Number(d.medium) || 0,
      hard: Number(d.hard) || 0,
      other: Number(d.other) || 0,
    };
  }
  return out;
}

function heatFillForCount(n, max) {
  if (!n || n <= 0) return HEAT_GRID_EMPTY;
  if (!max || max <= 0) return HEAT_GRID_EMPTY;
  const r = n / max;
  if (r <= 0.25) return HEAT_GRID_LEVELS[0];
  if (r <= 0.5) return HEAT_GRID_LEVELS[1];
  if (r <= 0.75) return HEAT_GRID_LEVELS[2];
  return HEAT_GRID_LEVELS[3];
}

function polarDeg(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSegment(cx, cy, rIn, rOut, a0, a1) {
  const p0 = polarDeg(cx, cy, rOut, a0);
  const p1 = polarDeg(cx, cy, rOut, a1);
  const p2 = polarDeg(cx, cy, rIn, a1);
  const p3 = polarDeg(cx, cy, rIn, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${rOut} ${rOut} 0 ${large} 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${rIn} ${rIn} 0 ${large} 0 ${p3.x} ${p3.y} Z`;
}

function svgEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Returns \`{ svg, width }\` — width matches viewBox for README \`<img width>\`; split line is horizontal center. */
function buildSynclActivitySvg(syncDailyStats, syncLifetimeStats) {
  const VIEW_H = 214;
  const PAD_X = 28;
  const nDays = HEATMAP_WEEKS * HEATMAP_DOW;
  const cell = 14;
  const gap = 4;
  const cells = [];
  let maxCount = 0;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = 0; i < nDays; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (nDays - 1 - i));
    const key = localDateKey(d.getTime());
    const t = dayActivityTotal(syncDailyStats[key]);
    cells.push(t);
    if (t > maxCount) maxCount = t;
  }

  let rects = '';
  const heatOriginX = PAD_X;
  const heatOriginY = 44;
  const heatW = HEATMAP_WEEKS * (cell + gap) - gap;
  const heatH = HEATMAP_DOW * (cell + gap) - gap;
  for (let i = 0; i < nDays; i++) {
    const col = Math.floor(i / HEATMAP_DOW);
    const row = i % HEATMAP_DOW;
    const x = heatOriginX + col * (cell + gap);
    const y = heatOriginY + row * (cell + gap);
    const fill = heatFillForCount(cells[i], maxCount);
    rects += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" ry="3" fill="${fill}"/>`;
  }

  const ltE = Math.max(0, Number(syncLifetimeStats.easy) || 0);
  const ltM = Math.max(0, Number(syncLifetimeStats.medium) || 0);
  const ltH = Math.max(0, Number(syncLifetimeStats.hard) || 0);
  const ltO = Math.max(0, Number(syncLifetimeStats.other) || 0);
  const totalDiff = ltE + ltM + ltH + ltO;

  const rOut = 48;
  const rIn = 34;
  const splitX = heatOriginX + heatW + 18;
  const legendX = splitX + 12;
  const donutCX = legendX + 162;
  const donutCY = heatOriginY + heatH / 2;

  let legY = donutCY - 34;
  let donutPaths = '';
  const legend = [];

  const slices = [
    { v: ltE, c: LC_EASY, lab: 'Easy' },
    { v: ltM, c: LC_MEDIUM, lab: 'Medium' },
    { v: ltH, c: LC_HARD, lab: 'Hard' },
    { v: ltO, c: LC_OTHER, lab: 'Other' },
  ];

  if (totalDiff > 0) {
    const active = slices.filter((s) => s.v > 0);
    if (active.length === 1) {
      const s = active[0];
      const rMid = (rOut + rIn) / 2;
      donutPaths = `<circle cx="${donutCX}" cy="${donutCY}" r="${rMid}" fill="none" stroke="${s.c}" stroke-width="${
        rOut - rIn
      }"/>`;
      legend.push(
        `<g transform="translate(${legendX},${legY})"><rect width="11" height="11" rx="2" fill="${s.c}"/><text x="18" y="10" fill="#1f2328" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-size="12">${svgEsc(
          `${s.lab} · ${s.v}`,
        )}</text></g>`,
      );
    } else {
      let ang = 0;
      for (const s of slices) {
        if (s.v <= 0) continue;
        const span = (s.v / totalDiff) * 360;
        const a1 = ang + span;
        donutPaths += `<path d="${donutSegment(donutCX, donutCY, rIn, rOut, ang, a1)}" fill="${s.c}"/>`;
        ang = a1;
        legend.push(
          `<g transform="translate(${legendX},${legY})"><rect width="11" height="11" rx="2" fill="${s.c}"/><text x="18" y="10" fill="#1f2328" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-size="12">${svgEsc(
            `${s.lab} · ${s.v}`,
          )}</text></g>`,
        );
        legY += 22;
      }
    }
  } else {
    const rMid = (rOut + rIn) / 2;
    donutPaths = `<circle cx="${donutCX}" cy="${donutCY}" r="${rMid}" fill="none" stroke="#d8dee4" stroke-width="${
      rOut - rIn
    }"/>`;
  }

  const displayNum = totalDiff > 0 ? String(totalDiff) : '0';
  const centerLabel = `<text x="${donutCX}" y="${donutCY - 3}" text-anchor="middle" fill="#1f2328" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-size="20" font-weight="700">${svgEsc(
    displayNum,
  )}</text><text x="${donutCX}" y="${donutCY + 20}" text-anchor="middle" fill="#24292f" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-size="12" font-weight="600">${svgEsc(
    'total',
  )}</text>`;

  const titleY = 26;
  const splitY1 = 32;
  const splitY2 = heatOriginY + heatH + 14;

  const rawLeft = heatOriginX - 8;
  const rawRight = Math.max(donutCX + rOut + 16, legendX + 118);
  const halfSpan = Math.max(splitX - rawLeft, rawRight - splitX, 100);
  const VIEW_W = Math.ceil(2 * halfSpan);
  const offsetX = splitX - VIEW_W / 2;

  const chartInner = `<text x="${heatOriginX}" y="${titleY}" fill="#1f2328" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-size="13" font-weight="600">${svgEsc(
    'Recent syncs',
  )}</text>
  ${rects}
  <line x1="${splitX}" y1="${splitY1}" x2="${splitX}" y2="${splitY2}" stroke="#dde3ea" stroke-width="1"/>
  <text x="${legendX}" y="${titleY}" fill="#1f2328" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-size="13" font-weight="600">${svgEsc(
    'Difficulty',
  )}</text>
  ${legend.join('')}
  ${donutPaths}
  ${centerLabel}`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}" role="img" aria-label="SyncLeetcode activity">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <g transform="translate(${-offsetX},0)">${chartInner}</g>
  <text x="${VIEW_W / 2}" y="${VIEW_H - 12}" text-anchor="middle" fill="#6e7781" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-size="10">${svgEsc(
    'Powered by SyncLeetcode',
  )}</text>
</svg>`;

  return { svg, width: VIEW_W };
}

async function upsertSyncFolderStatsSvg(cfg, prebuilt) {
  if (cfg.syncFolderReadme === false) return;
  const relPath = SYNCL_ACTIVITY_SVG;
  let svg;
  if (prebuilt && typeof prebuilt === 'string') {
    svg = prebuilt;
  } else {
    const { syncDailyStats = {}, syncLifetimeStats = {} } = await chrome.storage.local.get([
      'syncDailyStats',
      'syncLifetimeStats',
    ]);
    svg = buildSynclActivitySvg(syncDailyStats, syncLifetimeStats).svg;
  }
  const sha = await githubGetFileSha(cfg.token, cfg.owner, cfg.repo, relPath, cfg.branch);
  await githubPutFile(
    cfg.token,
    cfg.owner,
    cfg.repo,
    relPath,
    cfg.branch,
    svg,
    'SyncLeetcode: update activity chart',
    sha,
  );
}

function normalizeDifficultyForStats(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (/简单|easy/.test(s)) return 'easy';
  if (/中等|medium/.test(s)) return 'medium';
  if (/困难|hard/.test(s)) return 'hard';
  if (s.includes('easy')) return 'easy';
  if (s.includes('medium')) return 'medium';
  if (s.includes('hard')) return 'hard';
  return null;
}

function pruneDailyStatsMap(map, maxKeep) {
  const keys = Object.keys(map).sort();
  while (keys.length > maxKeep) {
    delete map[keys.shift()];
  }
}

/** One write: today’s difficulty counts + lifetime unique problem count (same key = one problem). */
async function recordSyncStatsAfterSuccess(question) {
  const slug = sanitizePathPart(question?.titleSlug || 'unknown');
  const fid = sanitizePathPart(question?.questionFrontendId || '0');
  const uniqueKey = `${fid}__${slug}`;
  const bucket = normalizeDifficultyForStats(question?.difficulty);
  const dayKey = localDateKey();

  const { syncDailyStats = {}, syncLifetimeStats = {} } = await chrome.storage.local.get([
    'syncDailyStats',
    'syncLifetimeStats',
  ]);

  const nextDaily = { ...syncDailyStats };
  pruneDailyStatsMap(nextDaily, SYNC_DAILY_STATS_MAX_DAYS);

  const prevDay = nextDaily[dayKey];
  const day = {
    easy: Number(prevDay?.easy) || 0,
    medium: Number(prevDay?.medium) || 0,
    hard: Number(prevDay?.hard) || 0,
    other: Number(prevDay?.other) || 0,
    seen: { ...(prevDay?.seen || {}) },
  };

  let lifetimeCount = Number(syncLifetimeStats.count) || 0;
  const lifetimeSeen = { ...(syncLifetimeStats.seen || {}) };
  let ltEasy = Number(syncLifetimeStats.easy) || 0;
  let ltMedium = Number(syncLifetimeStats.medium) || 0;
  let ltHard = Number(syncLifetimeStats.hard) || 0;
  let ltOther = Number(syncLifetimeStats.other) || 0;

  if (!lifetimeSeen[uniqueKey]) {
    lifetimeSeen[uniqueKey] = 1;
    lifetimeCount += 1;
    if (bucket === 'easy') ltEasy += 1;
    else if (bucket === 'medium') ltMedium += 1;
    else if (bucket === 'hard') ltHard += 1;
    else ltOther += 1;
  }

  if (!day.seen[uniqueKey]) {
    day.seen[uniqueKey] = 1;
    if (bucket === 'easy') day.easy += 1;
    else if (bucket === 'medium') day.medium += 1;
    else if (bucket === 'hard') day.hard += 1;
    else day.other += 1;
  }

  nextDaily[dayKey] = day;
  const finalDaily = compactDailyStatsSeen(nextDaily);

  await chrome.storage.local.set({
    syncDailyStats: finalDaily,
    syncLifetimeStats: {
      count: lifetimeCount,
      seen: lifetimeSeen,
      easy: ltEasy,
      medium: ltMedium,
      hard: ltHard,
      other: ltOther,
    },
  });
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function loadSettings() {
  const s = await chrome.storage.local.get([
    'githubToken',
    'githubOwner',
    'githubRepo',
    'githubBranch',
    'pathPrefix',
    'enabled',
    'notifyOnSyncSuccess',
    'notifyOnSyncFailure',
    'syncFolderReadme',
  ]);
  return {
    token: (s.githubToken || '').trim(),
    owner: (s.githubOwner || '').trim(),
    repo: (s.githubRepo || '').trim(),
    branch: (s.githubBranch || 'main').trim() || 'main',
    pathPrefix: (s.pathPrefix || 'leetcode').replace(/^\/+|\/+$/g, ''),
    enabled: s.enabled !== false,
    notifyOnSyncSuccess: s.notifyOnSyncSuccess !== false,
    notifyOnSyncFailure: s.notifyOnSyncFailure !== false,
    syncFolderReadme: s.syncFolderReadme !== false,
  };
}

function githubContentsPath(path) {
  return path
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

const GITHUB_RETRY_HTTP = new Set([408, 429, 500, 502, 503, 504]);

async function githubGetFileSha(token, owner, repo, path, branch) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${githubContentsPath(path)}?ref=${encodeURIComponent(branch)}`;
  const delays = [400, 900, 1800];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const res = await fetch(url, { headers: githubHeaders(token) });
    if (res.status === 404) return null;
    if (!res.ok && attempt < delays.length && GITHUB_RETRY_HTTP.has(res.status)) {
      await new Promise((r) => setTimeout(r, delays[attempt]));
      continue;
    }
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`GitHub GET ${res.status}: ${t.slice(0, 200)}`);
    }
    const j = await res.json();
    return j.sha || null;
  }
  throw new Error('GitHub GET: exhausted retries');
}

/** GET repo + branch; throws with message body on failure (for options/popup verify). */
async function githubVerifyRepoAndBranch(cfg) {
  if (!cfg.token) {
    throw new Error('No GitHub token. Add a PAT in settings.');
  }
  if (!cfg.owner || !cfg.repo) {
    throw new Error('Missing owner or repository name.');
  }
  const owner = encodeURIComponent(cfg.owner);
  const repo = encodeURIComponent(cfg.repo);
  const branch = encodeURIComponent(cfg.branch);
  const repoUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await fetch(repoUrl, { headers: githubHeaders(cfg.token) });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GitHub GET ${res.status}: ${t.slice(0, 240)}`);
  }
  const brUrl = `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`;
  const res2 = await fetch(brUrl, { headers: githubHeaders(cfg.token) });
  if (!res2.ok) {
    const t = await res2.text();
    throw new Error(`GitHub GET branch ${res2.status}: ${t.slice(0, 240)}`);
  }
}

async function githubPutFile(token, owner, repo, path, branch, content, message, sha) {
  const body = {
    message,
    content: utf8ToBase64(content),
    branch,
  };
  if (sha) body.sha = sha;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${githubContentsPath(path)}`;
  const delays = [400, 900, 1800];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok && attempt < delays.length && GITHUB_RETRY_HTTP.has(res.status)) {
      await new Promise((r) => setTimeout(r, delays[attempt]));
      continue;
    }
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`GitHub PUT ${res.status}: ${t.slice(0, 300)}`);
    }
    return res.json();
  }
  throw new Error('GitHub PUT: exhausted retries');
}

async function pushSubmission(payload) {
  const cfg = await loadSettings();
  if (!cfg.enabled) return { skipped: true, reason: 'disabled' };
  if (!cfg.token || !cfg.owner || !cfg.repo) {
    return { skipped: true, reason: 'missing-config' };
  }

  const detail = payload.detail;
  const q = detail.question || {};
  const slug = sanitizePathPart(q.titleSlug || payload.questionSlug || 'unknown');
  const fid = sanitizePathPart(q.questionFrontendId || '0');
  const title = q.title || slug;
  const ext = extFromLang(detail);
  const relPath = `${cfg.pathPrefix}/${fid}-${slug}.${ext}`;
  const code = detail.code || '';
  const msg = `SyncLeetcode: ${title} (${slug})`;

  const sha = await githubGetFileSha(cfg.token, cfg.owner, cfg.repo, relPath, cfg.branch);
  await githubPutFile(cfg.token, cfg.owner, cfg.repo, relPath, cfg.branch, code, msg, sha);

  await recordSyncStatsAfterSuccess(q);

  try {
    const { syncDailyStats = {}, syncLifetimeStats = {} } = await chrome.storage.local.get([
      'syncDailyStats',
      'syncLifetimeStats',
    ]);
    const activity = buildSynclActivitySvg(syncDailyStats, syncLifetimeStats);
    await upsertSyncFolderReadme(cfg, activity.width);
    await upsertSyncFolderStatsSvg(cfg, activity.svg);
  } catch (_) {
    /* e.g. race if two tabs created README; ignore */
  }

  await chrome.storage.local.set({
    lastSyncAt: Date.now(),
    lastSyncPath: relPath,
    lastSyncOk: true,
    lastSyncError: '',
  });

  if (cfg.notifyOnSyncSuccess) {
    const repoLabel = `${cfg.owner}/${cfg.repo}`;
    const msg = `${title} → ${relPath} (${repoLabel}, ${cfg.branch})`;
    chrome.notifications.create(`sync-ok-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'SyncLeetcode · pushed to GitHub',
      message: msg.length > 220 ? `${msg.slice(0, 217)}…` : msg,
      priority: 2,
    });
  }

  return { ok: true, path: relPath };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'sync-push-github') {
    pushSubmission(msg.payload)
      .then((r) => sendResponse(r))
      .catch(async (e) => {
        const err = e instanceof Error ? e.message : String(e);
        await chrome.storage.local.set({
          lastSyncAt: Date.now(),
          lastSyncOk: false,
          lastSyncError: err,
        });
        const { notifyOnSyncFailure } = await loadSettings();
        if (notifyOnSyncFailure) {
          chrome.notifications.create(`sync-err-${Date.now()}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            title: 'SyncLeetcode · GitHub push failed',
            message: err.slice(0, 180),
            priority: 2,
          });
        }
        sendResponse({ ok: false, error: err });
      });
    return true;
  }
  if (msg?.type === 'sync-verify-github') {
    loadSettings()
      .then((cfg) => githubVerifyRepoAndBranch(cfg))
      .then(() => sendResponse({ ok: true }))
      .catch((e) => {
        const err = e instanceof Error ? e.message : String(e);
        sendResponse({ ok: false, error: err });
      });
    return true;
  }
  return false;
});

function extractSlugFromSubmitUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/problems\/([^/]+)\/submit\/?/);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
}

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.method !== 'POST') return;
    if (!isLeetcodeProblemSubmitUrl(details.url)) return;
    const slug = extractSlugFromSubmitUrl(details.url);
    if (!slug || details.tabId == null || details.tabId < 0) return;

    setTimeout(() => {
      chrome.tabs.sendMessage(details.tabId, { type: 'sync-request-sync-slug', questionSlug: slug }, () => {
        void chrome.runtime.lastError;
      });
    }, 2200);
  },
  {
    urls: [
      'https://leetcode.com/problems/*',
      'https://leetcode.cn/problems/*',
      'https://*.lingkou.xyz/problems/*',
      'https://lingkou.xyz/problems/*',
    ],
    types: ['xmlhttprequest'],
  },
);
