const state = document.getElementById('state');
const openOptions = document.getElementById('openOptions');
const popupSyncEnabled = document.getElementById('popupSyncEnabled');

openOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

const POPUP_STORAGE_KEYS = [
  'enabled',
  'githubOwner',
  'githubRepo',
  'lastSyncAt',
  'lastSyncPath',
  'lastSyncOk',
  'lastSyncError',
  'syncDailyStats',
  'syncLifetimeStats',
];

function renderPopupFromStorage(s) {
  if (popupSyncEnabled) {
    popupSyncEnabled.checked = s.enabled !== false;
  }

  if (!s.githubOwner || !s.githubRepo) {
    state.innerHTML =
      '<p class="hint-warn">Add your GitHub token and repository in settings first.</p>';
    return;
  }

  const repo = `${escapeHtml(s.githubOwner)}/${escapeHtml(s.githubRepo)}`;
  let inner = '';

  if (s.enabled === false) {
    inner += `<div class="sync-paused-banner">Sync is <strong>off</strong> — <strong>Accepted</strong> submissions won’t be pushed.</div>`;
  }

  inner += `<div class="repo-pill">${iconRepo}<span>${repo}</span></div>`;

  if (s.lastSyncAt) {
    const t = formatLocalDateTime24h(s.lastSyncAt);
    if (s.lastSyncOk) {
      const path = escapeHtml(s.lastSyncPath || '');
      inner += `<div class="status-block ok">${iconOk}<div><div class="time">Last sync · ${escapeHtml(t)}</div><div class="path">${path}</div></div></div>`;
    } else {
      const { friendly, detail } = parseGithubError(s.lastSyncError);
      inner += `<div class="status-block err">${iconErr}<div><div class="time">${escapeHtml(t)}</div><div class="friendly">${escapeHtml(friendly)}</div><div class="detail">${detail}</div></div></div>`;
    }
  } else {
    inner +=
      '<p class="hint-muted">No sync yet. Solve a problem and get <strong>Accepted</strong>.</p>';
    inner += '<p id="sync-verify" class="hint-sub">Checking GitHub…</p>';
  }

  inner += todaySyncBlock(s.syncDailyStats);
  inner += totalSyncBlock(s.syncLifetimeStats, s.syncDailyStats);

  state.innerHTML = inner;

  if (s.enabled !== false && s.githubOwner && s.githubRepo && !s.lastSyncAt) {
    chrome.runtime.sendMessage({ type: 'sync-verify-github' }, (resp) => {
      const line = document.getElementById('sync-verify');
      if (!line) return;
      if (chrome.runtime.lastError) {
        line.textContent = 'Could not check GitHub. Try again or open settings.';
        line.className = 'hint-warn hint-below';
        return;
      }
      if (resp?.ok) {
        line.remove();
        return;
      }
      const { friendly } = parseGithubError(resp?.error || '');
      line.textContent = friendly;
      line.className = 'hint-warn hint-below';
    });
  }
}

function refreshPopup() {
  chrome.storage.local.get(POPUP_STORAGE_KEYS).then(renderPopupFromStorage);
}

popupSyncEnabled?.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: popupSyncEnabled.checked }, () => refreshPopup());
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || changes.enabled === undefined) return;
  refreshPopup();
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const iconRepo =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="4"/><path d="M2 12v4c0 2.2 4.5 4 10 4s10-1.8 10-4v-4M2 8v4c0 2.2 4.5 4 10 4s10-1.8 10-4V8"/></svg>';

const iconOk =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';

const iconErr =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>';

/** Turn raw GitHub API errors into a short line + optional truncated detail */
function parseGithubError(raw) {
  const str = String(raw || '');
  let friendly = 'Could not reach GitHub or write the file.';
  let detail = str.trim();

  const jsonMatch = str.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const j = JSON.parse(jsonMatch[0]);
      if (j.message) friendly = j.message;
    } catch (_) {
      /* keep default */
    }
  }

  if (/PUT 404|GET 404|GET branch 404|status["']?\s*:\s*["']?404|404:/i.test(str)) {
    friendly =
      'Repository or branch not found (404). Create an empty repository on GitHub yourself first — this extension does not create repos. Then check owner, repo name, and branch in settings.';
  } else if (/403|Forbidden/i.test(str)) {
    friendly = 'Permission denied (403). Check that your token can write to this repository.';
  } else if (/401|Unauthorized/i.test(str)) {
    friendly = 'Unauthorized (401). Your token may be expired or revoked.';
  } else if (/No GitHub token/i.test(str)) {
    friendly = 'No GitHub token. Add a PAT in settings.';
  }

  if (detail.length > 140) {
    detail = `${detail.slice(0, 140)}…`;
  }

  return { friendly, detail: escapeHtml(detail) };
}

function localDateKey(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const LOCALE_TIME_24H = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
};

function formatLocalDateTime24h(ms) {
  return new Date(ms).toLocaleString(undefined, LOCALE_TIME_24H);
}

/** Today’s unique-problem sync counts (local calendar day, same as background). */
function todaySyncBlock(syncDailyStats) {
  const dayKey = localDateKey();
  const row = syncDailyStats?.[dayKey];
  const easy = row ? Number(row.easy) || 0 : 0;
  const medium = row ? Number(row.medium) || 0 : 0;
  const hard = row ? Number(row.hard) || 0 : 0;
  const other = row ? Number(row.other) || 0 : 0;
  const total = easy + medium + hard + other;
  if (total === 0) {
    return `<div class="today-stats"><div class="today-label">Today</div><div class="today-muted">No problems synced yet today.</div></div>`;
  }
  const chips = [];
  if (easy) chips.push(`<span class="d-easy">${easy} Easy</span>`);
  if (medium) chips.push(`<span class="d-med">${medium} Medium</span>`);
  if (hard) chips.push(`<span class="d-hard">${hard} Hard</span>`);
  if (other) chips.push(`<span class="d-other">${other} unknown</span>`);
  const glue = ' <span class="today-dot">·</span> ';
  return `<div class="today-stats"><div class="today-label">Today synced</div><div class="today-chips">${chips.join(
    glue,
  )}</div><div class="today-total">${total} unique problem${total === 1 ? '' : 's'}</div></div>`;
}

function lastThreeDayKeys() {
  const keys = [];
  for (let i = 2; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(localDateKey(d.getTime()));
  }
  return keys;
}

function daySyncTotal(syncDailyStats, dayKey) {
  const row = syncDailyStats?.[dayKey];
  if (!row) return 0;
  return (
    (Number(row.easy) || 0) +
    (Number(row.medium) || 0) +
    (Number(row.hard) || 0) +
    (Number(row.other) || 0)
  );
}

function sparkDayLabel(dayKey) {
  const todayK = localDateKey();
  if (dayKey === todayK) return 'Today';
  const parts = dayKey.split('-').map(Number);
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return dt.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
}

/** Mini bar chart: unique problems synced per day, last 3 local calendar days. */
function lastThreeDaysSparkHtml(syncDailyStats) {
  const keys = lastThreeDayKeys();
  const counts = keys.map((k) => daySyncTotal(syncDailyStats, k));
  const max = Math.max(1, ...counts);
  const maxH = 32; /* keep within .spark-bar-track height (popup.html) */
  const cols = keys
    .map((key, i) => {
      const c = counts[i];
      const hPx = c === 0 ? 4 : Math.max(5, Math.round((c / max) * maxH));
      const zeroClass = c === 0 ? ' is-zero' : '';
      const lab = sparkDayLabel(key);
      return `<div class="spark-col"><div class="spark-bar-track"><div class="spark-bar-fill${zeroClass}" style="height:${hPx}px"></div></div><div class="spark-count">${c}</div><div class="spark-day">${escapeHtml(lab)}</div></div>`;
    })
    .join('');
  return `<div class="spark-section"><div class="spark-heading">Last 3 days · synced</div><div class="spark-bars">${cols}</div></div>`;
}

function totalSyncBlock(syncLifetimeStats, syncDailyStats) {
  const n = Math.max(0, Number(syncLifetimeStats?.count) || 0);
  return `<div class="today-stats total-alltime"><div class="today-label">Total sync</div><div class="total-sync-value">${n} unique problem${n === 1 ? '' : 's'}</div><div class="today-muted total-sync-hint">All-time · once per problem</div>${lastThreeDaysSparkHtml(syncDailyStats)}</div>`;
}

refreshPopup();
