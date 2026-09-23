// ─── Background Service Worker v2 ───────────────────────────────────
// Auth + auto-open + smart assign + multi-role support.

const API_BASE = 'http://localhost:3000';
const DIVAR_AD_URL = 'https://divar.ir/new';

// ── State ───────────────────────────────────────────────────────────
let currentTask = null;
let currentPrefill = null;
let currentTabId = null;
let currentUser = null;

// ── Storage helpers ─────────────────────────────────────────────────
async function getToken() {
  const data = await chrome.storage.local.get('authToken');
  return data.authToken || null;
}

async function setToken(token) {
  await chrome.storage.local.set({ authToken: token });
}

// ── API helpers ─────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = await getToken();
  const headers = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, { headers, ...options });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || response.statusText);
  }
  return response.json();
}

// ── Auth ────────────────────────────────────────────────────────────
async function login(token) {
  await setToken(token);
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  currentUser = data.user;
  return currentUser;
}

async function logout() {
  await chrome.storage.local.remove('authToken');
  currentUser = null;
  currentTask = null;
  currentPrefill = null;
  currentTabId = null;
}

async function getCurrentUser() {
  if (currentUser) return currentUser;
  const token = await getToken();
  if (!token) return null;
  try {
    const data = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ token }) });
    currentUser = data.user;
    return currentUser;
  } catch { return null; }
}

// ── Open divar tab ──────────────────────────────────────────────────
async function openDivarTab() {
  if (currentTabId !== null) {
    try {
      const tab = await chrome.tabs.get(currentTabId);
      if (tab && !tab.discarded) {
        await chrome.tabs.update(currentTabId, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        return currentTabId;
      }
    } catch { /* tab closed */ }
  }
  const tab = await chrome.tabs.create({ url: DIVAR_AD_URL, active: true });
  currentTabId = tab.id;
  return tab.id;
}

// ── Core operations ─────────────────────────────────────────────────
async function claimNextTask() {
  const data = await apiFetch('/api/tasks/smart-assign', { method: 'POST', body: '{}' });
  currentTask = data.task;
  if (currentTask) {
    await loadPrefill(currentTask.id);
    const tabId = await openDivarTab();
    return { task: currentTask, tabId };
  }
  return { task: null, tabId: null };
}

async function loadPrefill(taskId) {
  const data = await apiFetch(`/api/tasks/${taskId}/prefill`);
  currentPrefill = data.prefill;
  return currentPrefill;
}

async function submitTask(taskId) {
  const data = await apiFetch(`/api/tasks/${taskId}/submit`, { method: 'POST', body: '{}' });
  currentTask = null; currentPrefill = null; currentTabId = null;
  return data.task;
}

async function editField(taskId, field, newValue) {
  const data = await apiFetch(`/api/tasks/${taskId}/field`, {
    method: 'PUT', body: JSON.stringify({ field, newValue }),
  });
  currentTask = data.task;
  await loadPrefill(taskId);
  return currentTask;
}

async function getStats() { return apiFetch('/api/stats'); }
async function listTasks() { return apiFetch('/api/tasks'); }
async function getUsers() { return apiFetch('/api/users'); }

// ── Tab lifecycle ───────────────────────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => { if (tabId === currentTabId) currentTabId = null; });

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === currentTabId && changeInfo.status === 'complete' && currentPrefill) {
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { action: 'fillReady', prefill: currentPrefill, taskId: currentTask?.id }).catch(() => {});
    }, 1000);
  }
});

// ── Message handler ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    try {
      switch (message.action) {
        case 'login': return { success: true, user: await login(message.token) };
        case 'logout': await logout(); return { success: true };
        case 'getCurrentUser': return { success: true, user: await getCurrentUser() };
        case 'claimNext': { const r = await claimNextTask(); return { success: true, task: r.task, tabId: r.tabId }; }
        case 'loadPrefill': return { success: true, prefill: await loadPrefill(message.taskId) };
        case 'submit': return { success: true, task: await submitTask(message.taskId) };
        case 'editField': return { success: true, task: await editField(message.taskId, message.field, message.newValue) };
        case 'getStatus': return { success: true, task: currentTask, prefill: currentPrefill, tabId: currentTabId, user: currentUser };
        case 'getStats': return { success: true, stats: await getStats() };
        case 'listTasks': return { success: true, tasks: (await listTasks()).tasks };
        case 'getUsers': return { success: true, users: (await getUsers()).users };
        case 'openDivar': {
          if (message.prefill) {
            currentPrefill = message.prefill;
          }
          const tabId = await openDivarTab();
          return { success: true, tabId };
        }
        case 'cdpClick': {
          // Trusted click via CDP — only affects the specific tab, nothing else
          const cdpTabId = sender.tab?.id;
          if (!cdpTabId) return { success: false, error: 'no tab' };
          const { x, y } = message;
          try {
            await new Promise((res, rej) => {
              chrome.debugger.attach({ tabId: cdpTabId }, '1.0', () => {
                if (chrome.runtime.lastError) { rej(chrome.runtime.lastError); return; }
                const send = (method, params) => new Promise((r, e) => {
                  chrome.debugger.sendCommand({ tabId: cdpTabId }, method, params, () => {
                    if (chrome.runtime.lastError) e(chrome.runtime.lastError); else r();
                  });
                });
                (async () => {
                  try {
                    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
                    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
                    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
                    res();
                  } catch (e) { rej(e); }
                })();
              });
            });
            chrome.debugger.detach({ tabId: cdpTabId }, () => {});
            return { success: true };
          } catch (err) {
            try { chrome.debugger.detach({ tabId: cdpTabId }, () => {}); } catch {}
            return { success: false, error: err.message || String(err) };
          }
        }
        default: return { success: false, error: `اکشن ناشناخته: ${message.action}` };
      }
    } catch (err) { return { success: false, error: err.message }; }
  };
  handle().then(sendResponse);
  return true;
});
