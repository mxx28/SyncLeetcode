/**
 * SyncLeetcode options page — reads/writes chrome.storage.local.
 *
 * Storage keys (must stay in sync with background.js loadSettings):
 * - githubToken     — GitHub PAT (never logged or sent outside GitHub API)
 * - githubOwner     — repo owner login or org name
 * - githubRepo      — repository name (slug in github.com/owner/REPO)
 * - githubBranch    — branch to commit to (e.g. main)
 * - pathPrefix      — directory inside repo root for solution files
 * - enabled              — if false, background skips push
 * - notifyOnSyncSuccess  — show system notification after a successful push (default on)
 * - notifyOnSyncFailure  — show system notification when push fails (default on)
 * - syncFolderReadme     — repo-root README + SVG refreshed each sync (managed template, default on)
 */

const $ = (id) => document.getElementById(id);

function hideSaveSuccessScreen() {
  $('saveSuccessScreen')?.classList.remove('is-visible');
  $('settingsRoot')?.classList.remove('is-hidden');
  $('save')?.focus();
}

function showSaveSuccessScreen() {
  const owner = ($('githubOwner')?.value || '').trim();
  const repo = ($('githubRepo')?.value || '').trim();
  const repoBlock = $('saveSuccessRepoBlock');
  const repoMissing = $('saveSuccessRepoMissing');
  const repoLink = $('saveSuccessRepoLink');

  if (owner && repo && repoBlock && repoMissing && repoLink) {
    repoLink.href = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    repoLink.textContent = `${owner}/${repo}`;
    repoBlock.hidden = false;
    repoMissing.hidden = true;
  } else {
    if (repoBlock) repoBlock.hidden = true;
    if (repoMissing) repoMissing.hidden = false;
  }

  $('settingsRoot')?.classList.add('is-hidden');
  $('saveSuccessScreen')?.classList.add('is-visible');
  $('saveSuccessDismiss')?.focus();
}

/** Load saved values into the form. */
async function load() {
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
  $('githubToken').value = s.githubToken || '';
  $('githubOwner').value = s.githubOwner || '';
  $('githubRepo').value = s.githubRepo || '';
  $('githubBranch').value = s.githubBranch || 'main';
  $('pathPrefix').value = s.pathPrefix || 'leetcode';
  $('enabled').checked = s.enabled !== false;
  $('notifyOnSyncSuccess').checked = s.notifyOnSyncSuccess !== false;
  $('notifyOnSyncFailure').checked = s.notifyOnSyncFailure !== false;
  $('syncFolderReadme').checked = s.syncFolderReadme !== false;
}

function setStatus(text, cls) {
  const el = $('status');
  el.textContent = text;
  el.className = cls || '';
}

const testNotifyHint = $('testNotifyHint');

$('testDesktopNotify')?.addEventListener('click', () => {
  if (testNotifyHint) testNotifyHint.textContent = '';
  chrome.notifications.create(
    `syncl-test-${Date.now()}`,
    {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'SyncLeetcode · test',
      message: 'If you see this outside the extension popup, desktop notifications work.',
    },
    () => {
      if (chrome.runtime.lastError) {
        if (testNotifyHint) {
          testNotifyHint.textContent = chrome.runtime.lastError.message || 'Could not show notification.';
          testNotifyHint.style.color = 'var(--danger)';
        }
        return;
      }
      if (testNotifyHint) {
        testNotifyHint.textContent = 'Request sent — check screen corner or Notification Center.';
        testNotifyHint.style.color = '';
      }
    },
  );
});

$('saveSuccessDismiss')?.addEventListener('click', () => {
  hideSaveSuccessScreen();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('saveSuccessScreen')?.classList.contains('is-visible')) {
    e.preventDefault();
    hideSaveSuccessScreen();
  }
});

$('save').addEventListener('click', async () => {
  setStatus('', '');
  try {
    await chrome.storage.local.set({
      githubToken: $('githubToken').value.trim(),
      githubOwner: $('githubOwner').value.trim(),
      githubRepo: $('githubRepo').value.trim(),
      githubBranch: $('githubBranch').value.trim() || 'main',
      pathPrefix: $('pathPrefix').value.trim() || 'leetcode',
      enabled: $('enabled').checked,
      notifyOnSyncSuccess: $('notifyOnSyncSuccess').checked,
      notifyOnSyncFailure: $('notifyOnSyncFailure').checked,
      syncFolderReadme: $('syncFolderReadme').checked,
    });
    showSaveSuccessScreen();
  } catch (err) {
    setStatus(String(err), 'err');
  }
});

load().catch((e) => setStatus(String(e), 'err'));
