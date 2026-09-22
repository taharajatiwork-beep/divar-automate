// ─── Quota Monitor ──────────────────────────────────────────────────
// Tracks daily ad posting limits per business account on Divar.
// Protects accounts from hitting platform limits.

export function createQuotaService() {
  // Per-account quota tracking
  // In production, this would persist to DB; in-memory for pilot.
  const accounts = new Map();

  const DEFAULT_DAILY_LIMIT = 20;  // conservative default
  const SAFE_THRESHOLD = 0.8;      // stop at 80% of limit

  function getOrCreateAccount(accountId) {
    if (!accounts.has(accountId)) {
      accounts.set(accountId, {
        id: accountId,
        dailyLimit: DEFAULT_DAILY_LIMIT,
        postedToday: 0,
        lastResetDate: todayStr(),
        status: 'active',  // active | quota_reached | paused
      });
    }
    const acc = accounts.get(accountId);
    // Auto-reset at midnight
    if (acc.lastResetDate !== todayStr()) {
      acc.postedToday = 0;
      acc.lastResetDate = todayStr();
      if (acc.status === 'quota_reached') acc.status = 'active';
    }
    return acc;
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  return {
    // Set daily limit for an account (supervisor/manager action)
    setDailyLimit({ accountId, limit }) {
      const acc = getOrCreateAccount(accountId);
      acc.dailyLimit = limit;
      return structuredClone(acc);
    },

    // Record a successful post
    recordPost({ accountId }) {
      const acc = getOrCreateAccount(accountId);
      acc.postedToday++;
      if (acc.postedToday >= acc.dailyLimit) {
        acc.status = 'quota_reached';
      }
      return structuredClone(acc);
    },

    // Check if account can accept more posts
    canPost({ accountId }) {
      const acc = getOrCreateAccount(accountId);
      if (acc.status === 'paused') return { allowed: false, reason: 'حساب متوقف شده.' };
      if (acc.status === 'quota_reached') return { allowed: false, reason: 'سهمیه روزانه تمام شده.' };
      if (acc.postedToday >= Math.floor(acc.dailyLimit * SAFE_THRESHOLD)) {
        return {
          allowed: true,
          warning: true,
          reason: `نزدیک سقف (${acc.postedToday}/${acc.dailyLimit}) — ادامه با احتیاط.`,
        };
      }
      return { allowed: true, warning: false };
    },

    // Get status for an account
    getStatus({ accountId }) {
      const acc = getOrCreateAccount(accountId);
      const remaining = Math.max(0, acc.dailyLimit - acc.postedToday);
      return {
        accountId: acc.id,
        dailyLimit: acc.dailyLimit,
        postedToday: acc.postedToday,
        remaining,
        safeRemaining: Math.max(0, Math.floor(acc.dailyLimit * SAFE_THRESHOLD) - acc.postedToday),
        status: acc.status,
        utilizationPercent: acc.dailyLimit > 0 ? Math.round((acc.postedToday / acc.dailyLimit) * 100) : 0,
      };
    },

    // Get all accounts status
    getAllStatus() {
      return Array.from(accounts.values()).map(acc => ({
        accountId: acc.id,
        dailyLimit: acc.dailyLimit,
        postedToday: acc.postedToday,
        remaining: Math.max(0, acc.dailyLimit - acc.postedToday),
        status: acc.status,
        utilizationPercent: acc.dailyLimit > 0 ? Math.round((acc.postedToday / acc.dailyLimit) * 100) : 0,
      }));
    },

    // Pause/unpause an account
    setAccountStatus({ accountId, status }) {
      const acc = getOrCreateAccount(accountId);
      if (!['active', 'paused'].includes(status)) throw new Error('وضعیت نامعتبر.');
      acc.status = status;
      return structuredClone(acc);
    },
  };
}
