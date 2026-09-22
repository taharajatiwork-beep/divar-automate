// ─── Background Service Worker ──────────────────────────────────────
// Handles API communication with the pilot server and manages state.

const API_BASE = 'http://localhost:3000';
const OPERATOR_ID = 'op-pilot-1';

// ── State ───────────────────────────────────────────────────────────
let currentTask = null;
let currentPrefill = null;

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

// ── Core operations ─────────────────────────────────────────────────
async function claimNextTask() {
  const data = await apiFetch('/api/tasks/claim-next', {
    method: 'POST',
    body: JSON.stringify({ operatorId: OPERATOR_ID }),
  });
  currentTask = data.task;
  if (currentTask) {
    await loadPrefill(currentTask.id);
  }
  return currentTask;
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

// ── Message handler ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    try {
      switch (message.action) {
        case 'claimNext':
          return { success: true, task: await claimNextTask() };
        case 'loadPrefill':
          return { success: true, prefill: await loadPrefill(message.taskId) };
        case 'submit':
          return { success: true, task: await submitTask(message.taskId) };
        case 'editField':
          return { success: true, task: await editField(message.taskId, message.field, message.newValue) };
        case 'getStatus':
          return { success: true, task: currentTask, prefill: currentPrefill };
        case 'getStats':
          return { success: true, stats: await getStats() };
        case 'listTasks':
          return { success: true, tasks: (await listTasks()).tasks };
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
