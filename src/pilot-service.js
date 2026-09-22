export const TASK_STATUS = Object.freeze({
  READY_FOR_ASSIGNMENT: 'ready_for_assignment',
  ASSIGNED: 'assigned',
  NEEDS_REVIEW: 'needs_review',
});

const activeMobilePhoneMapping = Object.freeze({
  version: 1,
  targetCategory: 'mobile-phones',
  fields: [
    { target: 'title', source: 'title', label: 'عنوان', required: true },
    { target: 'description', source: 'description', label: 'توضیحات', required: true },
    { target: 'price', source: 'price', label: 'قیمت', required: true },
    { target: 'category', source: 'category', label: 'دسته‌بندی', required: true },
    { target: 'attributes.brand', source: 'attributes.brand', label: 'برند', required: true },
    { target: 'attributes.model', source: 'attributes.model', label: 'مدل', required: true },
    { target: 'attributes.storage', source: 'attributes.storage', label: 'حافظه', required: false },
    { target: 'images', source: 'images', label: 'تصاویر', required: true },
  ],
});

function getValue(source, path) {
  return path.split('.').reduce((value, key) => value?.[key], source);
}

function setValue(target, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const container = keys.reduce((value, key) => {
    value[key] ??= {};
    return value[key];
  }, target);
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
      validationErrors.push({
        field: field.target,
        message: `مقدار الزامی «${field.label}» وارد نشده است.`,
      });
    }
  }

  return { payload, validationErrors };
}

export function createPilotService({ products = [] } = {}) {
  const productsById = new Map(products.map((product) => [product.id, structuredClone(product)]));
  const tasks = [];
  let taskSequence = 0;

  function getTaskOrThrow(taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) throw new Error('وظیفه پیدا نشد.');
    return task;
  }

  return {
    createTask({ productId, createdBy }) {
      const product = productsById.get(productId);
      if (!product) throw new Error('محصول پیدا نشد.');
      if (product.category !== activeMobilePhoneMapping.targetCategory) {
        throw new Error('این پایلوت فقط از دسته‌بندی موبایل پشتیبانی می‌کند.');
      }

      const { payload, validationErrors } = buildPayload(product, activeMobilePhoneMapping);
      const id = `TASK-PILOT-${String(++taskSequence).padStart(4, '0')}`;
      const task = {
        id,
        productId,
        createdBy,
        createdAt: new Date().toISOString(),
        mappingVersion: activeMobilePhoneMapping.version,
        payload: structuredClone(payload),
        validationErrors,
        assignedOperatorId: null,
        assignedAt: null,
        status: validationErrors.length > 0 ? TASK_STATUS.NEEDS_REVIEW : TASK_STATUS.READY_FOR_ASSIGNMENT,
      };
      tasks.push(task);
      return structuredClone(task);
    },

    claimNextTask({ operatorId }) {
      const task = tasks.find((item) => item.status === TASK_STATUS.READY_FOR_ASSIGNMENT);
      if (!task) return null;

      task.status = TASK_STATUS.ASSIGNED;
      task.assignedOperatorId = operatorId;
      task.assignedAt = new Date().toISOString();
      return structuredClone(task);
    },

    getPrefillPayload({ taskId, operatorId }) {
      const task = getTaskOrThrow(taskId);
      if (task.assignedOperatorId !== operatorId) throw new Error('به این وظیفه دسترسی ندارید.');

      const { title, description, price, category, attributes, images } = task.payload;
      return {
        taskId: task.id,
        status: task.status,
        fields: { title, description, price, category, attributes: structuredClone(attributes ?? {}) },
        images: structuredClone(images ?? []),
      };
    },

    listTasks() {
      return structuredClone(tasks);
    },
  };
}

export const PILOT_MAPPING = activeMobilePhoneMapping;
