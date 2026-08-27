const refreshIntervals = [0, 15, 30, 60, 300];
const savedRefreshIntervalValue = window.localStorage.getItem('fleet-webui.refreshIntervalSeconds');
const savedRefreshInterval = savedRefreshIntervalValue === null ? undefined : Number(savedRefreshIntervalValue);
const browserNotificationStorageKey = 'fleet-webui.browserNotificationsEnabled';
const savedBrowserNotificationsEnabled = window.localStorage.getItem(browserNotificationStorageKey) === 'true';
const reconcileTokenStorageKey = 'fleet-webui.reconcileToken';
const bundleDeepLink = new URL(window.location.href).searchParams.get('bundle') || '';
const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const browserDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: browserTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const state = {
  bundles: [],
  bundleQuery: '',
  bundlePage: 1,
  bundlesPerPage: 10,
  refreshIntervalSeconds: refreshIntervals.includes(savedRefreshInterval) ? savedRefreshInterval : 15,
  refreshTimer: null,
  refreshCountdownTimer: null,
  nextRefreshAt: null,
  isRefreshing: false,
  repositories: [],
  health: { mode: 'unconfigured', notificationConfigured: false, connectionError: '', reconcileEnabled: false, reconcileAuthRequired: true },
  loadErrors: { health: '', bundles: '', repositories: '' },
  selectedBundle: null,
  detailBundle: null,
  detailGitRepo: null,
  bundleDetailRequestId: 0,
  gitRepoDetailRequestId: 0,
  pendingBundleDeepLink: bundleDeepLink,
  reconcileToken: readReconcileToken(),
  browserNotificationsEnabled: savedBrowserNotificationsEnabled,
};

const elements = {
  bundlesBody: document.querySelector('#bundles-body'),
  repositoriesBody: document.querySelector('#repositories-body'),
  bundleEmpty: document.querySelector('#bundle-empty'),
  repositoriesEmpty: document.querySelector('#repositories-empty'),
  attentionCount: document.querySelector('#attention-count'),
  healthyCount: document.querySelector('#healthy-count'),
  healthyPercent: document.querySelector('#healthy-percent'),
  attentionSummaryCount: document.querySelector('#attention-summary-count'),
  attentionPercent: document.querySelector('#attention-percent'),
  totalCount: document.querySelector('#total-count'),
  repositoryCount: document.querySelector('#repository-count'),
  bundleCountLabel: document.querySelector('#bundle-count-label'),
  bundleSearch: document.querySelector('#bundle-search'),
  bundlePagination: document.querySelector('#bundle-pagination'),
  bundlePageSummary: document.querySelector('#bundle-page-summary'),
  bundlePageLabel: document.querySelector('#bundle-page-label'),
  bundlePagePrevious: document.querySelector('#bundle-page-previous'),
  bundlePageNext: document.querySelector('#bundle-page-next'),
  repositoryCountLabel: document.querySelector('#repository-count-label'),
  notificationDetail: document.querySelector('#notification-detail'),
  browserNotificationDetail: document.querySelector('#browser-notification-detail'),
  browserNotificationButton: document.querySelector('#browser-notification-button'),
  modeLabel: document.querySelector('#mode-label'),
  loadErrorBanner: document.querySelector('#load-error-banner'),
  modalRoot: document.querySelector('#modal-root'),
  summary: document.querySelector('#reconcile-summary'),
  confirm: document.querySelector('#confirm-reconcile'),
  reconcileToken: document.querySelector('#reconcile-token'),
  reconcileTokenHint: document.querySelector('#reconcile-token-hint'),
  detailRoot: document.querySelector('#detail-root'),
  detailTitle: document.querySelector('#detail-title'),
  detailNamespace: document.querySelector('#detail-namespace'),
  detailLoading: document.querySelector('#detail-loading'),
  detailContent: document.querySelector('#detail-content'),
  detailHealth: document.querySelector('#detail-health'),
  detailState: document.querySelector('#detail-state'),
  detailOverview: document.querySelector('#detail-overview'),
  detailSummary: document.querySelector('#detail-summary'),
  detailConditions: document.querySelector('#detail-conditions'),
  detailReconcile: document.querySelector('#detail-reconcile'),
  gitRepoDetailRoot: document.querySelector('#gitrepo-detail-root'),
  gitRepoDetailTitle: document.querySelector('#gitrepo-detail-title'),
  gitRepoDetailNamespace: document.querySelector('#gitrepo-detail-namespace'),
  gitRepoDetailLoading: document.querySelector('#gitrepo-detail-loading'),
  gitRepoDetailContent: document.querySelector('#gitrepo-detail-content'),
  gitRepoDetailHealth: document.querySelector('#gitrepo-detail-health'),
  gitRepoDetailState: document.querySelector('#gitrepo-detail-state'),
  gitRepoDetailOverview: document.querySelector('#gitrepo-detail-overview'),
  gitRepoDetailSummary: document.querySelector('#gitrepo-detail-summary'),
  gitRepoDetailConditions: document.querySelector('#gitrepo-detail-conditions'),
  refreshInterval: document.querySelector('#refresh-interval'),
  autoRefreshStatus: document.querySelector('#auto-refresh-status'),
  refresh: document.querySelector('#refresh-button'),
  toastRegion: document.querySelector('#toast-region'),
};

async function api(path, options = {}) {
  const { headers = {}, ...requestOptions } = options;
  const response = await fetch(path, { ...requestOptions, headers: { Accept: 'application/json', ...headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function readReconcileToken() {
  try {
    return window.sessionStorage.getItem(reconcileTokenStorageKey) || '';
  } catch {
    return '';
  }
}

function rememberReconcileToken(token) {
  try {
    if (token) window.sessionStorage.setItem(reconcileTokenStorageKey, token);
    else window.sessionStorage.removeItem(reconcileTokenStorageKey);
  } catch {
    // The token remains available in memory when session storage is blocked.
  }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function dateLabel(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  const parts = Object.fromEntries(browserDateTimeFormatter.formatToParts(parsed)
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function statusClass(value = '') {
  const normalized = value.toLowerCase().replace(/\s+/g, '-');
  if (['healthy', 'ready', 'current'].includes(normalized)) return 'healthy';
  if (['error', 'errapplied', 'failed', 'notready'].includes(normalized)) return 'error';
  if (['out-of-sync', 'outofsync', 'modified', 'pending'].includes(normalized)) return 'warning';
  if (['reconciling', 'inprogress', 'in-progress', 'waitapplied'].includes(normalized)) return 'reconciling';
  return 'unknown';
}

function statusText(value = '') {
  const normalized = String(value).toLowerCase();
  const labels = { current: 'Synced', inprogress: 'Syncing', 'in-progress': 'Syncing', failed: 'Error', outofsync: 'Out of sync', errapplied: 'Error', notready: 'Not ready', waitapplied: 'Reconciling' };
  return labels[normalized] || value || 'Unknown';
}

function refreshIntervalLabel(seconds) {
  if (seconds === 60) return '1 min';
  if (seconds === 300) return '5 min';
  return `${seconds} sec`;
}

function browserNotificationPermission() {
  return 'Notification' in window ? window.Notification.permission : 'unsupported';
}

function browserNotificationsActive() {
  return state.browserNotificationsEnabled && browserNotificationPermission() === 'granted';
}

function renderBrowserNotifications() {
  const permission = browserNotificationPermission();
  const active = browserNotificationsActive();
  elements.browserNotificationButton.disabled = permission === 'unsupported' || permission === 'denied';
  elements.browserNotificationButton.setAttribute('aria-pressed', String(active));

  if (permission === 'unsupported') {
    elements.browserNotificationButton.textContent = 'Browser alerts unavailable';
    elements.browserNotificationDetail.textContent = 'This browser does not support system notifications.';
  } else if (permission === 'denied') {
    elements.browserNotificationButton.textContent = 'Browser alerts blocked';
    elements.browserNotificationDetail.textContent = 'Allow notifications for this site in your browser settings, then reload Fleet Console.';
  } else if (active) {
    elements.browserNotificationButton.textContent = 'Turn off browser alerts';
    elements.browserNotificationDetail.textContent = 'System alerts are enabled for manual reconcile requests on this device.';
  } else {
    elements.browserNotificationButton.textContent = 'Enable browser alerts';
    elements.browserNotificationDetail.textContent = 'Enable a system alert when a manual reconcile is accepted or cannot be requested.';
  }
}

function notifyBrowser(title, body, tag) {
  if (!browserNotificationsActive()) return;
  try {
    new window.Notification(title, { body, tag });
  } catch {
    state.browserNotificationsEnabled = false;
    window.localStorage.setItem(browserNotificationStorageKey, 'false');
    renderBrowserNotifications();
  }
}

async function toggleBrowserNotifications() {
  if (browserNotificationsActive()) {
    state.browserNotificationsEnabled = false;
    window.localStorage.setItem(browserNotificationStorageKey, 'false');
    renderBrowserNotifications();
    toast('Browser alerts turned off.');
    return;
  }

  if (browserNotificationPermission() === 'unsupported') {
    toast('Browser alerts are not supported by this browser.', 'warning');
    return;
  }
  if (browserNotificationPermission() === 'denied') {
    toast('Allow browser notifications for this site, then reload Fleet Console.', 'warning');
    return;
  }

  try {
    const permission = await window.Notification.requestPermission();
    if (permission !== 'granted') {
      renderBrowserNotifications();
      toast('Browser alerts were not enabled.', 'warning');
      return;
    }
    state.browserNotificationsEnabled = true;
    window.localStorage.setItem(browserNotificationStorageKey, 'true');
    renderBrowserNotifications();
    toast('Browser alerts enabled for manual reconciles.');
    notifyBrowser('Fleet Console alerts enabled', 'You will receive alerts when a manual reconcile is accepted or cannot be requested.', 'fleet-browser-alerts-enabled');
  } catch {
    renderBrowserNotifications();
    toast('Browser alerts could not be enabled in this context.', 'warning');
  }
}

function updateAutoRefreshStatus() {
  if (state.isRefreshing) {
    elements.autoRefreshStatus.textContent = 'Refreshing…';
    return;
  }
  if (!state.refreshIntervalSeconds || !state.nextRefreshAt) {
    elements.autoRefreshStatus.textContent = 'Manual';
    return;
  }
  const seconds = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
  elements.autoRefreshStatus.textContent = `in ${seconds}s`;
}

function scheduleAutoRefresh() {
  window.clearTimeout(state.refreshTimer);
  window.clearInterval(state.refreshCountdownTimer);
  state.refreshTimer = null;
  state.refreshCountdownTimer = null;
  state.nextRefreshAt = null;
  if (!state.refreshIntervalSeconds) {
    updateAutoRefreshStatus();
    return;
  }
  state.nextRefreshAt = Date.now() + state.refreshIntervalSeconds * 1000;
  updateAutoRefreshStatus();
  state.refreshCountdownTimer = window.setInterval(updateAutoRefreshStatus, 1000);
  state.refreshTimer = window.setTimeout(() => loadData({ quiet: true }), state.refreshIntervalSeconds * 1000);
}

function matchingBundles() {
  const query = state.bundleQuery.trim().toLocaleLowerCase();
  if (!query) return state.bundles;
  return state.bundles.filter(bundle => [bundle.name, bundle.namespace, bundle.gitRepo, bundle.commit]
    .some(value => String(value || '').toLocaleLowerCase().includes(query)));
}

function renderBundles() {
  const matching = matchingBundles();
  const pageCount = Math.max(1, Math.ceil(matching.length / state.bundlesPerPage));
  state.bundlePage = Math.min(state.bundlePage, pageCount);
  const first = (state.bundlePage - 1) * state.bundlesPerPage;
  const visible = matching.slice(first, first + state.bundlesPerPage);
  const rows = visible.map(bundle => `
    <tr title="${escapeHtml(bundle.message || '')}">
      <td><button class="bundle-name-button" type="button" data-bundle-detail="${escapeHtml(bundle.namespace)}/${escapeHtml(bundle.name)}">${escapeHtml(bundle.name)}</button></td>
      <td>${escapeHtml(bundle.namespace)}</td>
      <td>${escapeHtml(bundle.gitRepo || '—')}</td>
      <td>${escapeHtml(bundle.commit || '—')}</td>
      <td><span class="status ${statusClass(bundle.health)}">${escapeHtml(statusText(bundle.health))}</span></td>
      <td>${escapeHtml(bundle.targets || '—')}</td>
      <td>${escapeHtml(dateLabel(bundle.lastActivity))}</td>
      <td><button class="action-button" type="button" data-reconcile="${escapeHtml(bundle.namespace)}/${escapeHtml(bundle.name)}" ${state.health.reconcileEnabled ? '' : 'disabled title="Manual reconcile is disabled by the server"'}>${state.health.reconcileEnabled ? 'Reconcile' : 'Read only'}</button></td>
    </tr>`).join('');
  elements.bundlesBody.innerHTML = rows;
  elements.bundleEmpty.hidden = matching.length > 0;
  elements.bundleEmpty.textContent = state.loadErrors.bundles && state.bundles.length === 0
    ? `Bundles could not be loaded: ${state.loadErrors.bundles}`
    : state.bundleQuery.trim() ? `No bundles match “${state.bundleQuery.trim()}”.` : 'No bundles found.';
  const showingFrom = matching.length ? first + 1 : 0;
  const showingTo = Math.min(first + state.bundlesPerPage, matching.length);
  elements.bundleCountLabel.textContent = state.bundleQuery.trim()
    ? `${matching.length} of ${state.bundles.length} bundles`
    : `${state.bundles.length} bundle${state.bundles.length === 1 ? '' : 's'}`;
  elements.bundlePagination.hidden = matching.length === 0;
  elements.bundlePageSummary.textContent = matching.length ? `Showing ${showingFrom}–${showingTo} of ${matching.length}` : '';
  elements.bundlePageLabel.textContent = `Page ${state.bundlePage} of ${pageCount}`;
  elements.bundlePagePrevious.disabled = state.bundlePage === 1;
  elements.bundlePageNext.disabled = state.bundlePage === pageCount;
  document.querySelectorAll('[data-reconcile]').forEach(button => button.addEventListener('click', () => openReconcile(button.dataset.reconcile)));
  document.querySelectorAll('[data-bundle-detail]').forEach(button => button.addEventListener('click', () => openBundleDetail(button.dataset.bundleDetail)));
}

function renderRepositories() {
  const rows = state.repositories.map(repository => `
    <tr title="${escapeHtml(repository.message || '')}">
      <td><button class="gitrepo-name-button" type="button" data-gitrepo-detail="${escapeHtml(repository.namespace)}/${escapeHtml(repository.name)}">${escapeHtml(repository.repo || repository.name)}</button></td>
      <td>${escapeHtml(repository.branch || '—')}</td>
      <td>${escapeHtml(repository.syncedCommit || '—')}</td>
      <td>${escapeHtml(dateLabel(repository.latestActivity))}</td>
      <td><span class="status ${statusClass(repository.syncState)}">${escapeHtml(statusText(repository.syncState))}</span></td>
    </tr>`).join('');
  elements.repositoriesBody.innerHTML = rows;
  elements.repositoriesEmpty.hidden = state.repositories.length > 0;
  elements.repositoriesEmpty.textContent = state.loadErrors.repositories && state.repositories.length === 0
    ? `Git repositories could not be loaded: ${state.loadErrors.repositories}`
    : 'No Git repositories found.';
  document.querySelectorAll('[data-gitrepo-detail]').forEach(button => button.addEventListener('click', () => openGitRepoDetail(button.dataset.gitrepoDetail)));
}

function renderChrome() {
  const total = state.bundles.length;
  const healthy = state.bundles.filter(bundle => ['healthy', 'ready', 'current'].includes(String(bundle.health).toLowerCase())).length;
  const attention = total - healthy;
  const percent = count => total ? Math.round((count / total) * 100) : 0;
  elements.attentionCount.textContent = attention;
  elements.healthyCount.textContent = healthy;
  elements.healthyPercent.textContent = `${percent(healthy)}% healthy`;
  elements.attentionSummaryCount.textContent = attention;
  elements.attentionPercent.textContent = attention ? `${percent(attention)}% of bundles` : 'All clear';
  elements.totalCount.textContent = total;
  elements.repositoryCount.textContent = `${state.repositories.length} Git repositories`;
  elements.repositoryCountLabel.textContent = `${state.repositories.length} repositor${state.repositories.length === 1 ? 'y' : 'ies'}`;
  const connection = state.health.mode === 'kubeconfig' ? 'Kubernetes · kubeconfig'
    : state.health.mode === 'in-cluster' ? 'Kubernetes · in-cluster'
      : state.health.mode === 'direct' ? 'Live Fleet · direct API'
        : 'Fleet connection unavailable';
  elements.modeLabel.textContent = state.health.connectionError
    ? 'Fleet connection unavailable'
    : state.health.notificationConfigured ? `${connection} · ntfy enabled` : connection;
  const loadIssues = [];
  if (state.loadErrors.health) loadIssues.push(`Health: ${state.loadErrors.health}`);
  if (state.health.connectionError) loadIssues.push(state.health.connectionError);
  if (state.loadErrors.bundles) loadIssues.push(`Bundles: ${state.loadErrors.bundles}`);
  if (state.loadErrors.repositories) loadIssues.push(`Git repositories: ${state.loadErrors.repositories}`);
  elements.loadErrorBanner.hidden = loadIssues.length === 0;
  elements.loadErrorBanner.textContent = loadIssues.length ? `Some Fleet data is unavailable. ${loadIssues.join(' · ')}` : '';
  elements.notificationDetail.textContent = !state.health.reconcileEnabled
    ? 'Manual reconcile is disabled until a server-side authorization token is configured.'
    : state.health.notificationConfigured
      ? 'Every authorized manual reconcile posts to the configured ntfy channel.'
      : 'ntfy is not configured; authorized reconciles run without delivery notifications.';
  elements.detailReconcile.disabled = !state.health.reconcileEnabled;
  renderBrowserNotifications();
}

function openReconcile(id) {
  if (!state.health.reconcileEnabled) {
    toast('Manual reconcile is disabled by the server.', 'warning');
    return;
  }
  const [namespace, name] = id.split('/');
  state.selectedBundle = state.bundles.find(bundle => bundle.namespace === namespace && bundle.name === name);
  if (!state.selectedBundle) return;
  const bundle = state.selectedBundle;
  elements.summary.innerHTML = [
    ['Bundle', `${bundle.namespace}/${bundle.name}`],
    ['GitRepo', bundle.gitRepo || '—'],
    ['Commit', bundle.commit || '—'],
    ['Targets', bundle.targets || '—'],
  ].map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join('');
  elements.reconcileToken.value = state.reconcileToken;
  elements.reconcileTokenHint.textContent = 'Required for this write action. Saved only for this browser tab after a successful request.';
  elements.modalRoot.hidden = false;
  updateConfirmReconcileState();
  (elements.reconcileToken.value ? elements.confirm : elements.reconcileToken).focus();
}

function closeModal() {
  elements.modalRoot.hidden = true;
  state.selectedBundle = null;
  updateConfirmReconcileState();
}

function updateConfirmReconcileState() {
  elements.confirm.disabled = !state.selectedBundle || !state.health.reconcileEnabled || !elements.reconcileToken.value.trim();
}

async function openBundleDetail(id) {
  const [namespace, name] = id.split('/');
  const listItem = state.bundles.find(bundle => bundle.namespace === namespace && bundle.name === name);
  if (!listItem) return;
  const requestId = ++state.bundleDetailRequestId;
  state.detailBundle = listItem;
  elements.detailTitle.textContent = name;
  elements.detailNamespace.textContent = namespace;
  elements.detailLoading.hidden = false;
  elements.detailLoading.textContent = 'Loading latest Fleet status…';
  elements.detailContent.hidden = true;
  elements.detailRoot.hidden = false;
  try {
    const detail = await api(`/api/bundles/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
    if (requestId !== state.bundleDetailRequestId || elements.detailRoot.hidden) return;
    state.detailBundle = detail;
    renderBundleDetail(detail);
    elements.detailLoading.hidden = true;
    elements.detailContent.hidden = false;
    elements.detailReconcile.focus();
  } catch (error) {
    if (requestId !== state.bundleDetailRequestId || elements.detailRoot.hidden) return;
    elements.detailLoading.textContent = error.message;
    toast(`Could not load ${name} detail: ${error.message}`, 'error');
  }
}

function renderBundleDetail(bundle) {
  elements.detailTitle.textContent = bundle.name;
  elements.detailNamespace.textContent = bundle.namespace;
  elements.detailHealth.className = `status ${statusClass(bundle.health)}`;
  elements.detailHealth.textContent = statusText(bundle.health);
  elements.detailState.textContent = bundle.state || 'Unknown';
  elements.detailOverview.innerHTML = [
    ['GitRepo', bundle.gitRepo || '—'],
    ['Commit', bundle.commit || '—'],
    ['Target clusters', bundle.targets || '—'],
    ['Last activity', dateLabel(bundle.lastActivity)],
    ['Force sync', bundle.forceGeneration ?? '—'],
    ['Observed generation', bundle.observedGeneration ?? '—'],
    ['Created', dateLabel(bundle.createdAt)],
    ['Resource version', bundle.resourceVersion || '—'],
  ].map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd>`).join('');
  const summary = bundle.summary || {};
  elements.detailSummary.innerHTML = [
    ['Ready', summary.ready],
    ['Desired', summary.desiredReady],
    ['Out of sync', summary.outOfSync],
    ['Modified', summary.modified],
    ['Waiting', summary.waitApplied],
    ['Errors', (summary.errApplied || 0) + (summary.notReady || 0)],
  ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? 0)}</strong></div>`).join('');
  elements.detailConditions.innerHTML = renderConditions(bundle.conditions);
}

function renderConditions(conditions = []) {
  return conditions.length ? conditions.map(condition => {
    const kind = String(condition.status).toLowerCase() === 'true' ? 'healthy' : String(condition.status).toLowerCase() === 'false' ? 'error' : 'warning';
    const note = [condition.reason, condition.message].filter(Boolean).join(' · ');
    return `<article class="condition-row ${kind}"><header><span>${escapeHtml(condition.type || 'Condition')}</span><span>${escapeHtml(condition.status || 'Unknown')}</span></header>${note ? `<p>${escapeHtml(note)}</p>` : ''}${condition.lastUpdated ? `<p>${escapeHtml(dateLabel(condition.lastUpdated))}</p>` : ''}</article>`;
  }).join('') : '<div class="empty-state">No Fleet conditions reported.</div>';
}

function closeDetail() {
  state.bundleDetailRequestId += 1;
  elements.detailRoot.hidden = true;
  state.detailBundle = null;
}

async function openGitRepoDetail(id) {
  const [namespace, name] = id.split('/');
  const listItem = state.repositories.find(repo => repo.namespace === namespace && repo.name === name);
  if (!listItem) return;
  const requestId = ++state.gitRepoDetailRequestId;
  state.detailGitRepo = listItem;
  elements.gitRepoDetailTitle.textContent = name;
  elements.gitRepoDetailNamespace.textContent = namespace;
  elements.gitRepoDetailLoading.hidden = false;
  elements.gitRepoDetailLoading.textContent = 'Loading latest Fleet status…';
  elements.gitRepoDetailContent.hidden = true;
  elements.gitRepoDetailRoot.hidden = false;
  try {
    const detail = await api(`/api/gitrepos/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
    if (requestId !== state.gitRepoDetailRequestId || elements.gitRepoDetailRoot.hidden) return;
    state.detailGitRepo = detail;
    renderGitRepoDetail(detail);
    elements.gitRepoDetailLoading.hidden = true;
    elements.gitRepoDetailContent.hidden = false;
  } catch (error) {
    if (requestId !== state.gitRepoDetailRequestId || elements.gitRepoDetailRoot.hidden) return;
    elements.gitRepoDetailLoading.textContent = error.message;
    toast(`Could not load ${name} detail: ${error.message}`, 'error');
  }
}

function renderGitRepoDetail(repo) {
  elements.gitRepoDetailTitle.textContent = repo.name;
  elements.gitRepoDetailNamespace.textContent = `${repo.namespace} / ${repo.name}`;
  elements.gitRepoDetailHealth.className = `status ${statusClass(repo.syncState)}`;
  elements.gitRepoDetailHealth.textContent = statusText(repo.syncState);
  elements.gitRepoDetailState.textContent = repo.syncState || repo.gitJobStatus || 'Unknown';
  elements.gitRepoDetailOverview.innerHTML = [
    ['Repository', repo.repo || '—'],
    ['Branch', repo.branch || '—'],
    ['Revision', repo.revision || '—'],
    ['Paths', (repo.paths || []).join(', ') || '—'],
    ['Polling interval', repo.pollingInterval || '—'],
    ['Image scan interval', repo.imageScanInterval || '—'],
    ['Synced commit', repo.syncedCommit || '—'],
    ['Webhook commit', repo.webhookCommit || '—'],
    ['Polling commit', repo.pollingCommit || '—'],
    ['Last poll', dateLabel(repo.lastPollingTriggered)],
    ['Last webhook', dateLabel(repo.lastWebhookTime)],
    ['Last image scan', dateLabel(repo.lastSyncedImageScanTime)],
    ['Ready deployments', repo.readyBundleDeployments || '—'],
    ['Observed generation', repo.observedGeneration ?? '—'],
    ['Created', dateLabel(repo.createdAt)],
    ['Resource version', repo.resourceVersion || '—'],
  ].map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd>`).join('');
  const counts = repo.resourceCounts || {};
  elements.gitRepoDetailSummary.innerHTML = [
    ['Ready', counts.ready],
    ['Desired', counts.desiredReady],
    ['Waiting', counts.waitApplied],
    ['Not ready', counts.notReady],
    ['Missing', counts.missing],
    ['Modified', counts.modified],
  ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? 0)}</strong></div>`).join('');
  elements.gitRepoDetailConditions.innerHTML = renderConditions(repo.conditions);
}

function closeGitRepoDetail() {
  state.gitRepoDetailRequestId += 1;
  elements.gitRepoDetailRoot.hidden = true;
  state.detailGitRepo = null;
}

function toast(message, kind = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${kind}`;
  item.textContent = message;
  elements.toastRegion.append(item);
  window.setTimeout(() => item.remove(), 5200);
}

async function loadData({ quiet = false } = {}) {
  if (state.isRefreshing) return;
  state.isRefreshing = true;
  try {
    const [healthResult, bundlesResult, repositoriesResult] = await Promise.allSettled([
      api('/api/health'),
      api('/api/bundles'),
      api('/api/gitrepos'),
    ]);
    if (healthResult.status === 'fulfilled') {
      state.health = healthResult.value;
      state.loadErrors.health = '';
    } else {
      state.loadErrors.health = healthResult.reason.message;
    }
    if (bundlesResult.status === 'fulfilled') {
      state.bundles = bundlesResult.value.items || [];
      state.loadErrors.bundles = '';
    } else {
      state.loadErrors.bundles = bundlesResult.reason.message;
    }
    if (repositoriesResult.status === 'fulfilled') {
      state.repositories = repositoriesResult.value.items || [];
      state.loadErrors.repositories = '';
    } else {
      state.loadErrors.repositories = repositoriesResult.reason.message;
    }
    renderBundles(); renderRepositories(); renderChrome();
    if (bundlesResult.status === 'fulfilled') consumeBundleDeepLink();
    const failures = Object.values(state.loadErrors).filter(Boolean);
    if (!quiet) {
      toast(failures.length ? `Refresh completed with ${failures.length} error${failures.length === 1 ? '' : 's'}.` : 'Fleet data refreshed.', failures.length ? 'error' : 'success');
    }
  } finally {
    state.isRefreshing = false;
    scheduleAutoRefresh();
  }
}

function consumeBundleDeepLink() {
  const id = state.pendingBundleDeepLink;
  if (!id) return;
  state.pendingBundleDeepLink = '';
  const parts = id.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    toast('The notification link does not contain a valid bundle name.', 'warning');
    return;
  }
  const exists = state.bundles.some(bundle => bundle.namespace === parts[0] && bundle.name === parts[1]);
  if (!exists) {
    toast(`Bundle ${id} was not found.`, 'warning');
    return;
  }
  openBundleDetail(id);
}

async function confirmReconcile() {
  const bundle = state.selectedBundle;
  const token = elements.reconcileToken.value.trim();
  if (!bundle || !token) return;
  state.reconcileToken = token;
  elements.confirm.disabled = true;
  elements.confirm.textContent = 'Reconciling…';
  try {
    const result = await api(`/api/bundles/${encodeURIComponent(bundle.namespace)}/${encodeURIComponent(bundle.name)}/reconcile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    rememberReconcileToken(token);
    closeModal();
    const suffix = result.notification === 'sent' ? ' ntfy notified.' : result.notification === 'failed' ? ' Reconcile started, but ntfy delivery failed.' : ' Reconcile started; ntfy is not configured.';
    toast(`${bundle.name} reconcile requested (generation ${result.generation}).${suffix}`, result.notification === 'failed' ? 'warning' : 'success');
    const notificationIssue = result.notification === 'failed';
    notifyBrowser(
      notificationIssue ? 'Fleet reconcile requested with ntfy warning' : 'Fleet reconcile requested',
      `${bundle.namespace}/${bundle.name} was accepted at generation ${result.generation}.${notificationIssue ? ' ntfy delivery failed.' : ''}`,
      `fleet-reconcile-${bundle.namespace}-${bundle.name}`,
    );
    await loadData({ quiet: true });
  } catch (error) {
    if (error.status === 401) {
      state.reconcileToken = '';
      rememberReconcileToken('');
      elements.reconcileToken.value = '';
      elements.reconcileTokenHint.textContent = 'That token was rejected. Enter the token configured on the server.';
      elements.reconcileToken.focus();
    } else if (error.status === 503) {
      state.health.reconcileEnabled = false;
      closeModal();
      renderBundles();
      renderChrome();
    }
    toast(error.message, 'error');
    notifyBrowser('Fleet reconcile request failed', `${bundle.namespace}/${bundle.name}: ${error.message}`, `fleet-reconcile-${bundle.namespace}-${bundle.name}`);
  } finally {
    elements.confirm.textContent = 'Reconcile';
    updateConfirmReconcileState();
  }
}

elements.confirm.addEventListener('click', confirmReconcile);
elements.reconcileToken.addEventListener('input', updateConfirmReconcileState);
elements.browserNotificationButton.addEventListener('click', toggleBrowserNotifications);
elements.refresh.addEventListener('click', () => loadData());
elements.refreshInterval.value = String(state.refreshIntervalSeconds);
elements.refreshInterval.addEventListener('change', event => {
  const seconds = Number(event.target.value);
  state.refreshIntervalSeconds = refreshIntervals.includes(seconds) ? seconds : 15;
  window.localStorage.setItem('fleet-webui.refreshIntervalSeconds', String(state.refreshIntervalSeconds));
  scheduleAutoRefresh();
  toast(state.refreshIntervalSeconds ? `Auto refresh set to every ${refreshIntervalLabel(state.refreshIntervalSeconds)}.` : 'Auto refresh turned off.');
});
elements.bundleSearch.addEventListener('input', event => {
  state.bundleQuery = event.target.value;
  state.bundlePage = 1;
  renderBundles();
});
elements.bundlePagePrevious.addEventListener('click', () => {
  if (state.bundlePage <= 1) return;
  state.bundlePage -= 1;
  renderBundles();
});
elements.bundlePageNext.addEventListener('click', () => {
  const pageCount = Math.max(1, Math.ceil(matchingBundles().length / state.bundlesPerPage));
  if (state.bundlePage >= pageCount) return;
  state.bundlePage += 1;
  renderBundles();
});
document.querySelectorAll('[data-close-modal]').forEach(element => element.addEventListener('click', closeModal));
document.querySelectorAll('[data-close-detail]').forEach(element => element.addEventListener('click', closeDetail));
document.querySelectorAll('[data-close-gitrepo-detail]').forEach(element => element.addEventListener('click', closeGitRepoDetail));
elements.detailReconcile.addEventListener('click', () => {
  const bundle = state.detailBundle;
  if (!bundle) return;
  closeDetail();
  openReconcile(`${bundle.namespace}/${bundle.name}`);
});
window.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!elements.modalRoot.hidden) closeModal();
  else if (!elements.detailRoot.hidden) closeDetail();
  else if (!elements.gitRepoDetailRoot.hidden) closeGitRepoDetail();
});

renderBrowserNotifications();
loadData({ quiet: true });
