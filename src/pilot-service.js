// ─── Task Lifecycle States ───────────────────────────────────────────
export const TASK_STATUS = Object.freeze({
  NEEDS_REVIEW:       'needs_review',
  READY_FOR_ASSIGNMENT: 'ready_for_assignment',
  ASSIGNED:           'assigned',
  PREFILL_READY:      'prefill_ready',
  SUBMITTED:          'submitted',
  CONFIRMED:          'confirmed',
  REJECTED:           'rejected',
});

const STATUS_ORDER = [
  TASK_STATUS.NEEDS_REVIEW,
  TASK_STATUS.READY_FOR_ASSIGNMENT,
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.PREFILL_READY,
  TASK_STATUS.SUBMITTED,
  TASK_STATUS.CONFIRMED,
  TASK_STATUS.REJECTED,
];

// ─── Mapping Templates ──────────────────────────────────────────────
const activeMobilePhoneMapping = Object.freeze({
  version: 1,
  targetCategory: 'mobile-phones',
  label: 'موبایل',
  fields: [
    { target: 'title',             source: 'title',             label: 'عنوان',     required: true  },
    { target: 'description',       source: 'description',       label: 'توضیحات',   required: true  },
    { target: 'price',             source: 'price',             label: 'قیمت',      required: true  },
    { target: 'category',          source: 'category',          label: 'دسته‌بندی',  required: true  },
    { target: 'attributes.brand',  source: 'attributes.brand',  label: 'برند',      required: true  },
    { target: 'attributes.model',  source: 'attributes.model',  label: 'مدل',       required: true  },
    { target: 'attributes.storage', source: 'attributes.storage', label: 'حافظه',   required: false },
    { target: 'images',            source: 'images',            label: 'تصاویر',    required: true  },
  ],
});

// ─── Helpers ────────────────────────────────────────────────────────
function getValue(source, path) {
  return path.split('.').reduce((v, k) => v?.[k], source);
}

function setValue(target, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const container = keys.reduce((t, k) => { t[k] ??= {}; return t[k]; }, target);
  container[lastKey] = value;
}

function isMissing(value) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function buildPayload(product, mapping) {
  const payload = {};
  const validationErrors = [];
  for (const field of mapping.fields) {
    const value = getValue(product, field.source);
    setValue(payload, field.target, value);
    if (field.required && isMissing(value)) {
      validationErrors.push({ field: field.target, message: `مقدار الزامی «${field.label}» وارد نشده است.` });
    }
  }
  return { payload, validationErrors };
}

// ─── Service Factory ────────────────────────────────────────────────
export function createPilotService({ products = [] } = {}) {
  const productsById = new Map(products.map(p => [p.id, structuredClone(p)]));
  const tasks = [];
  const auditLogs = [];      // global audit trail
  let taskSequence = 0;

  function getTaskOrThrow(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) throw new Error(`وظیفه «${taskId}» پیدا نشد.`);
    return task;
  }

  function addAuditEntry({ taskId, operatorId, field, oldValue, newValue, action }) {
    const entry = {
      id: `LOG-${auditLogs.length + 1}`,
      taskId,
      operatorId,
      action,
      field,
      oldValue: structuredClone(oldValue),
      newValue: structuredClone(newValue),
      timestamp: new Date().toISOString(),
    };
    auditLogs.push(entry);
    return entry;
  }

  function countActiveTasks(operatorId) {
    return tasks.filter(t =>
      t.assignedOperatorId === operatorId &&
      (t.status === TASK_STATUS.ASSIGNED || t.status === TASK_STATUS.PREFILL_READY)
    ).length;
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    // Create a new task from a product
    createTask({ productId, createdBy }) {
      const product = productsById.get(productId);
      if (!product) throw new Error('محصول پیدا نشد.');
      if (product.category !== activeMobilePhoneMapping.targetCategory) {
        throw new Error('این پایلوت فقط از دسته‌بندی موبایل پشتیبانی می‌کند.');
      }
      const { payload, validationErrors } = buildPayload(product, activeMobilePhoneMapping);
      const id = `TASK-${String(++taskSequence).padStart(4, '0')}`;
      const task = {
        id,
        productId,
        createdBy,
        createdAt: new Date().toISOString(),
        mappingVersion: activeMobilePhoneMapping.version,
        originalProduct: structuredClone(product),
        payload: structuredClone(payload),
        validationErrors,
        assignedOperatorId: null,
        assignedAt: null,
        submittedAt: null,
        confirmedAt: null,
        rejectionReason: null,
        fieldEdits: [],       // track which fields operator changed
        status: validationErrors.length > 0
          ? TASK_STATUS.NEEDS_REVIEW
          : TASK_STATUS.READY_FOR_ASSIGNMENT,
      };
      tasks.push(task);

      addAuditEntry({
        taskId: id,
        operatorId: createdBy,
        action: 'task_created',
        field: null,
        oldValue: null,
        newValue: { productId, mappingVersion: task.mappingVersion },
      });

      return structuredClone(task);
    },

    // Assign the next ready task to an operator
    claimNextTask({ operatorId }) {
      const task = tasks.find(t => t.status === TASK_STATUS.READY_FOR_ASSIGNMENT);
      if (!task) return null;

      task.status = TASK_STATUS.ASSIGNED;
      task.assignedOperatorId = operatorId;
      task.assignedAt = new Date().toISOString();

      addAuditEntry({
        taskId: task.id,
        operatorId,
        action: 'task_assigned',
        field: null,
        oldValue: null,
        newValue: { operatorId },
      });

      return structuredClone(task);
    },

    // Get prefill payload for a specific task
    getPrefillPayload({ taskId, operatorId }) {
      const task = getTaskOrThrow(taskId);
      if (operatorId && task.assignedOperatorId !== operatorId) {
        throw new Error('به این وظیفه دسترسی ندارید.');
      }
      const { title, description, price, category, attributes, images } = task.payload;
      return {
        taskId: task.id,
        status: task.status,
        fields: { title, description, price, category, attributes: structuredClone(attributes ?? {}) },
        images: structuredClone(images ?? []),
        validationErrors: task.validationErrors,
        fieldEdits: structuredClone(task.fieldEdits),
      };
    },

    // Edit a field before submission (operator adjusting prefill)
    editTaskField({ taskId, operatorId, field, newValue }) {
      const task = getTaskOrThrow(taskId);
      if (task.assignedOperatorId !== operatorId) {
        throw new Error('به این وظیفه دسترسی ندارید.');
      }
      if (task.status !== TASK_STATUS.ASSIGNED && task.status !== TASK_STATUS.PREFILL_READY) {
        throw new Error('فقط وظایف اختصاص‌یافته یا آماده قابل ویرایش‌اند.');
      }

      const oldValue = getValue(task.payload, field);
      if (oldValue === newValue) return structuredClone(task);

      setValue(task.payload, field, newValue);
      task.status = TASK_STATUS.PREFILL_READY;

      const editRecord = { field, oldValue, newValue, editedAt: new Date().toISOString(), operatorId };
      task.fieldEdits.push(editRecord);

      addAuditEntry({
        taskId: task.id,
        operatorId,
        action: 'field_edited',
        field,
        oldValue,
        newValue,
      });

      return structuredClone(task);
    },

    // Mark task as submitted by operator (human confirmed the form is ready)
    markSubmitted({ taskId, operatorId }) {
      const task = getTaskOrThrow(taskId);
      if (task.assignedOperatorId !== operatorId) {
        throw new Error('به این وظیفه دسترسی ندارید.');
      }
      if (task.status !== TASK_STATUS.ASSIGNED && task.status !== TASK_STATUS.PREFILL_READY) {
        throw new Error('فقط وظایف اختصاص‌یافته یا آماده قابل ثبت‌اند.');
      }
      task.status = TASK_STATUS.SUBMITTED;
      task.submittedAt = new Date().toISOString();

      addAuditEntry({
        taskId: task.id,
        operatorId,
        action: 'task_submitted',
        field: null,
        oldValue: null,
        newValue: { submittedAt: task.submittedAt },
      });

      return structuredClone(task);
    },

    // Supervisor confirms a submission (ad was posted successfully)
    confirmTask({ taskId, supervisorId }) {
      const task = getTaskOrThrow(taskId);
      if (task.status !== TASK_STATUS.SUBMITTED) {
        throw new Error('فقط وظایف ثبت‌شده قابل تأییدند.');
      }
      task.status = TASK_STATUS.CONFIRMED;
      task.confirmedAt = new Date().toISOString();

      addAuditEntry({
        taskId: task.id,
        operatorId: supervisorId,
        action: 'task_confirmed',
        field: null,
        oldValue: null,
        newValue: { confirmedAt: task.confirmedAt },
      });

      return structuredClone(task);
    },

    // Supervisor rejects a submission (something was wrong)
    rejectTask({ taskId, supervisorId, reason }) {
      const task = getTaskOrThrow(taskId);
      if (task.status !== TASK_STATUS.SUBMITTED) {
        throw new Error('فقط وظایف ثبت‌شده قابل رد هستند.');
      }
      task.status = TASK_STATUS.REJECTED;
      task.rejectionReason = reason || 'دلیل مشخص نشده';

      addAuditEntry({
        taskId: task.id,
        operatorId: supervisorId,
        action: 'task_rejected',
        field: null,
        oldValue: null,
        newValue: { reason: task.rejectionReason },
      });

      return structuredClone(task);
    },

    // Reassign a task to a different operator
    reassignTask({ taskId, newOperatorId, supervisorId }) {
      const task = getTaskOrThrow(taskId);
      if (task.status !== TASK_STATUS.ASSIGNED && task.status !== TASK_STATUS.PREFILL_READY) {
        throw new Error('فقط وظایف اختصاص‌یافته یا آماده قابل تخصیص مجدد‌اند.');
      }
      const oldOperatorId = task.assignedOperatorId;
      task.assignedOperatorId = newOperatorId;
      task.status = TASK_STATUS.ASSIGNED;
      task.assignedAt = new Date().toISOString();

      addAuditEntry({
        taskId: task.id,
        operatorId: supervisorId,
        action: 'task_reassigned',
        field: null,
        oldValue: { operatorId: oldOperatorId },
        newValue: { operatorId: newOperatorId },
      });

      return structuredClone(task);
    },

    // Get all tasks (with optional filters)
    listTasks({ status, operatorId } = {}) {
      let result = tasks;
      if (status) result = result.filter(t => t.status === status);
      if (operatorId) result = result.filter(t => t.assignedOperatorId === operatorId);
      return structuredClone(result);
    },

    // Get audit logs for a task
    getAuditLog({ taskId } = {}) {
      let result = auditLogs;
      if (taskId) result = result.filter(e => e.taskId === taskId);
      return structuredClone(result);
    },

    // Dashboard statistics
    getStats() {
      const byStatus = {};
      for (const s of STATUS_ORDER) byStatus[s] = 0;
      for (const t of tasks) byStatus[t.status] = (byStatus[t.status] || 0) + 1;

      const operators = {};
      for (const t of tasks) {
        if (t.assignedOperatorId) {
          operators[t.assignedOperatorId] = (operators[t.assignedOperatorId] || 0) + 1;
        }
      }

      const totalEdits = tasks.reduce((sum, t) => sum + t.fieldEdits.length, 0);
      const confirmed = byStatus[TASK_STATUS.CONFIRMED] || 0;
      const rejected = byStatus[TASK_STATUS.REJECTED] || 0;
      const totalCompleted = confirmed + rejected;

      return {
        total: tasks.length,
        byStatus,
        operators,
        totalEdits,
        confirmationRate: totalCompleted > 0 ? Math.round((confirmed / totalCompleted) * 100) : null,
        totalAuditEntries: auditLogs.length,
      };
    },

    // Get active mapping info
    getMapping() {
      return structuredClone(activeMobilePhoneMapping);
    },

    // Get a product by ID
    getProduct(productId) {
      const product = productsById.get(productId);
      return product ? structuredClone(product) : null;
    },

    // List all products
    listProducts() {
      return Array.from(productsById.values()).map(p => structuredClone(p));
    },

    // ── Phase 2: Batch create tasks from all products ──────────────
    batchCreateTasks({ createdBy }) {
      const results = [];
      for (const product of productsById.values()) {
        if (product.category !== activeMobilePhoneMapping.targetCategory) continue;
        // Skip if task already exists for this product
        const existing = tasks.find(t => t.productId === product.id);
        if (existing) continue;
        const result = this.createTask({ productId: product.id, createdBy });
        results.push(result);
      }
      return results;
    },

    // ── Phase 2: Smart assign — pick operator with fewest active tasks ─
    smartAssign({ operators }) {
      if (!operators || operators.length === 0) throw new Error('اپراتوری برای تخصیص مشخص نشده.');

      // Find operator with fewest active (assigned/prefill_ready) tasks
      let bestOperator = null;
      let bestCount = Infinity;
      for (const op of operators) {
        const count = countActiveTasks(op.id);
        if (count < bestCount) {
          bestCount = count;
          bestOperator = op;
        }
      }

      if (!bestOperator) return null;
      return this.claimNextTask({ operatorId: bestOperator.id });
    },

    // ── Phase 2: Get workload for all operators ────────────────────
    getWorkload() {
      const workload = {};
      for (const t of tasks) {
        if (t.assignedOperatorId) {
          if (!workload[t.assignedOperatorId]) {
            workload[t.assignedOperatorId] = { active: 0, completed: 0, total: 0 };
          }
          workload[t.assignedOperatorId].total++;
          if (t.status === TASK_STATUS.CONFIRMED || t.status === TASK_STATUS.REJECTED) {
            workload[t.assignedOperatorId].completed++;
          }
          if (t.status === TASK_STATUS.ASSIGNED || t.status === TASK_STATUS.PREFILL_READY) {
            workload[t.assignedOperatorId].active++;
          }
        }
      }
      return workload;
    },

    // ── Phase 2: Enhanced stats ────────────────────────────────────
    getStatsV2() {
      const base = this.getStats();
      return {
        ...base,
        workload: this.getWorkload(),
        queueDepth: tasks.filter(t => t.status === TASK_STATUS.READY_FOR_ASSIGNMENT).length,
        needsReviewCount: tasks.filter(t => t.status === TASK_STATUS.NEEDS_REVIEW).length,
      };
    },
  };
}

export const PILOT_MAPPING = activeMobilePhoneMapping;
