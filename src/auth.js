// ─── Simple Token Auth + Role Management ────────────────────────────
// Phase 2: role-based access control for the pilot.

export const ROLES = Object.freeze({
  OPERATOR:   'operator',    // fills forms, submits
  SUPERVISOR: 'supervisor',  // manages tasks, confirms/rejects
  MANAGER:    'manager',     // full access, reports
});

// ── Permissions per role ────────────────────────────────────────────
const PERMISSIONS = Object.freeze({
  [ROLES.OPERATOR]: [
    'products:read',
    'task:create',
    'task:claim',
    'task:read_own',
    'task:edit_own',
    'task:submit_own',
    'prefill:read_own',
  ],
  [ROLES.SUPERVISOR]: [
    'task:read_all',
    'task:create',
    'task:assign',
    'task:reassign',
    'task:confirm',
    'task:reject',
    'prefill:read_all',
    'audit:read',
    'stats:read',
    'users:read',
  ],
  [ROLES.MANAGER]: [
    'task:read_all',
    'task:create',
    'task:batch_create',
    'task:assign',
    'task:reassign',
    'task:confirm',
    'task:reject',
    'prefill:read_all',
    'audit:read',
    'stats:read',
    'users:read',
    'users:manage',
    'mapping:read',
  ],
});

// ── Default users (demo) ───────────────────────────────────────────
const DEFAULT_USERS = [
  { id: 'op-ali',     name: 'علی',       role: ROLES.OPERATOR,   token: 'tok-ali-1234' },
  { id: 'op-sara',    name: 'سارا',      role: ROLES.OPERATOR,   token: 'tok-sara-5678' },
  { id: 'sup-reza',   name: 'رضا',       role: ROLES.SUPERVISOR, token: 'tok-reza-abcd' },
  { id: 'mgr-admin',  name: 'مدیر سیستم', role: ROLES.MANAGER,   token: 'tok-admin-xyz' },
];

// ── Auth Service Factory ────────────────────────────────────────────
export function createAuthService() {
  const users = new Map(DEFAULT_USERS.map(u => [u.id, { ...u }]));
  const tokens = new Map(DEFAULT_USERS.map(u => [u.token, u.id]));

  return {
    // Authenticate by token, return user or null
    authenticate(token) {
      if (!token) return null;
      const userId = tokens.get(token);
      if (!userId) return null;
      return structuredClone(users.get(userId));
    },

    // Check if user has a specific permission
    hasPermission(user, permission) {
      if (!user) return false;
      const perms = PERMISSIONS[user.role] || [];
      return perms.includes(permission);
    },

    // Get all users (for management)
    listUsers() {
      return Array.from(users.values()).map(u => ({
        id: u.id,
        name: u.name,
        role: u.role,
      }));
    },

    // Get a user by ID
    getUser(userId) {
      const user = users.get(userId);
      return user ? { id: user.id, name: user.name, role: user.role } : null;
    },

    // Get operators only
    getOperators() {
      return Array.from(users.values())
        .filter(u => u.role === ROLES.OPERATOR)
        .map(u => ({ id: u.id, name: u.name, role: u.role }));
    },

    // Add a new user (manager only)
    addUser({ id, name, role, token }) {
      if (users.has(id)) throw new Error('کاربر با این شناسه وجود دارد.');
      if (!Object.values(ROLES).includes(role)) throw new Error('نقش نامعتبر.');
      users.set(id, { id, name, role, token });
      tokens.set(token, id);
      return { id, name, role };
    },

    // Remove a user
    removeUser(userId) {
      const user = users.get(userId);
      if (!user) throw new Error('کاربر پیدا نشد.');
      tokens.delete(user.token);
      users.delete(userId);
      return { id: userId };
    },
  };
}

// ── Auth middleware for HTTP server ──────────────────────────────────
export function authMiddleware(authService) {
  return function authenticate(request) {
    const authHeader = request.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    return authService.authenticate(token);
  };
}
