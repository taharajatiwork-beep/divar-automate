// ─── Background Service Worker ──────────────────────────────────────
// Handles API communication, auto-opens divar form, manages state.

const API_BASE = 'http://localhost:3000';
const OPERATOR_ID = 'op-pilot-1';

// Divar ad creation URL — adjust if the path changes
const DIVAR_AD_URL = 'https://divar.ir/v/new';

// ── State ───────────────────────────────────────────────────────────
let currentTask = null;
let currentPrefill = null;
let currentTabId = null;     // track the tab we opened for this task

// ── API helpers ─────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || response.statusText);
  }
  return response.json();
}

// ── Open divar tab ──────────────────────────────────────────────────
async function openDivarTab() {
  // Check if we already have a tab open for this task
  if (currentTabId !== null) {
    try {
      const tab = await chrome.tabs.get(currentTabId);
      if (tab && !tab.discarded) {
        // Tab still exists — focus it
        await chrome.tabs.update(currentTabId, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        return currentTabId;
      }
    } catch {
      // Tab was closed, open a new one
    }
  }

  const tab = await chrome.tabs.create({ url: DIVAR_AD_URL, active: true });
  currentTabId = tab.id;
  return tab.id;
}

// ── Core operations ─────────────────────────────────────────────────
async function claimNextTask() {
  const data = await apiFetch('/api/tasks/claim-next', {
    method: 'POST',
    body: JSON.stringify({ operatorId: OPERATOR_ID }),
  });
  currentTask = data.task;

  if (currentTask) {
    // Load prefill data
    await loadPrefill(currentTask.id);

    // Auto-open divar ad creation page
    const tabId = await openDivarTab();
    return { task: currentTask, tabId };
  }

  return { task: null, tabId: null };
}

async function loadPrefill(taskId) {
  const data = await apiFetch(`/api/tasks/${taskId}/prefill?operatorId=${OPERATOR_ID}`);
  currentPrefill = data.prefill;
  return currentPrefill;
}

async function submitTask(taskId) {
  const data = await apiFetch(`/api/tasks/${taskId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ operatorId: OPERATOR_ID }),
  });
  currentTask = null;
  currentPrefill = null;
  currentTabId = null;
  return data.task;
}

async function editField(taskId, field, newValue) {
  const data = await apiFetch(`/api/tasks/${taskId}/field`, {
    method: 'PUT',
    body: JSON.stringify({ operatorId: OPERATOR_ID, field, newValue }),
  });
  currentTask = data.task;
  await loadPrefill(taskId);
  return currentTask;
}

async function getStats() {
  return apiFetch('/api/stats');
}

async function listTasks() {
  return apiFetch('/api/tasks');
}

// ── Tab lifecycle ───────────────────────────────────────────────────
// If the user closes the divar tab, clear the reference
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === currentTabId) {
    currentTabId = null;
  }
});

// When content script loads on divar, send it the prefill data
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    tabId === currentTabId &&
    changeInfo.status === 'complete' &&
    currentPrefill
  ) {
    // Small delay to ensure content script is ready
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, {
        action: 'fillReady',
        prefill: currentPrefill,
        taskId: currentTask?.id,
      }).catch(() => {}); // content script might not be loaded yet
    }, 1000);
  }
});

// ── Message handler ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    try {
      switch (message.action) {
        case 'claimNext': {
          const result = await claimNextTask();
          return { success: true, task: result.task, tabId: result.tabId };
        }
        case 'loadPrefill':
          return { success: true, prefill: await loadPrefill(message.taskId) };
        case 'submit':
          return { success: true, task: await submitTask(message.taskId) };
        case 'editField':
          return { success: true, task: await editField(message.taskId, message.field, message.newValue) };
        case 'getStatus':
          return {
            success: true,
            task: currentTask,
            prefill: currentPrefill,
            tabId: currentTabId,
          };
        case 'getStats':
          return { success: true, stats: await getStats() };
        case 'listTasks':
          return { success: true, tasks: (await listTasks()).tasks };
        case 'openDivar': {
          const tabId = await openDivarTab();
          return { success: true, tabId };
        }
        default:
          return { success: false, error: `اکشن ناشناخته: ${message.action}` };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  handle().then(sendResponse);
  return true; // keep channel open for async
});
