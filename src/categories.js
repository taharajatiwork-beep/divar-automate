// ─── Category & Mapping Template Registry ───────────────────────────
// Phase 4: Multi-category support with versioned, reviewable templates.

const builtInTemplates = [
  {
    id: 'mobile-phones',
    label: 'موبایل',
    icon: '📱',
    version: 1,
    status: 'active', // active | pending_review | archived
    lastReviewedAt: null,
    lastReviewedBy: null,
    reviewNotes: null,
    fields: [
      { target: 'title',              source: 'title',              label: 'عنوان',     required: true  },
      { target: 'description',        source: 'description',        label: 'توضیحات',   required: true  },
      { target: 'price',              source: 'price',              label: 'قیمت',      required: true  },
      { target: 'category',           source: 'category',           label: 'دسته‌بندی',  required: true  },
      { target: 'attributes.brand',   source: 'attributes.brand',   label: 'برند',      required: true  },
      { target: 'attributes.model',   source: 'attributes.model',   label: 'مدل',       required: true  },
      { target: 'attributes.storage', source: 'attributes.storage', label: 'حافظه',     required: false },
      { target: 'images',             source: 'images',             label: 'تصاویر',    required: true  },
    ],
  },
  {
    id: 'laptops',
    label: 'لپ‌تاپ',
    icon: '💻',
    version: 1,
    status: 'active',
    lastReviewedAt: null,
    lastReviewedBy: null,
    reviewNotes: null,
    fields: [
      { target: 'title',                source: 'title',                label: 'عنوان',       required: true  },
      { target: 'description',          source: 'description',          label: 'توضیحات',     required: true  },
      { target: 'price',                source: 'price',                label: 'قیمت',        required: true  },
      { target: 'category',             source: 'category',             label: 'دسته‌بندی',    required: true  },
      { target: 'attributes.brand',     source: 'attributes.brand',     label: 'برند',        required: true  },
      { target: 'attributes.model',     source: 'attributes.model',     label: 'مدل',         required: true  },
      { target: 'attributes.cpu',       source: 'attributes.cpu',       label: 'پردازنده',    required: false },
      { target: 'attributes.ram',       source: 'attributes.ram',       label: 'رم',          required: false },
      { target: 'attributes.storage',   source: 'attributes.storage',   label: 'حافظه',       required: false },
      { target: 'attributes.gpu',       source: 'attributes.gpu',       label: 'گرافیک',      required: false },
      { target: 'images',               source: 'images',               label: 'تصاویر',      required: true  },
    ],
  },
  {
    id: 'accessories',
    label: 'لوازم جانبی',
    icon: '🎧',
    version: 1,
    status: 'active',
    lastReviewedAt: null,
    lastReviewedBy: null,
    reviewNotes: null,
    fields: [
      { target: 'title',              source: 'title',              label: 'عنوان',     required: true  },
      { target: 'description',        source: 'description',        label: 'توضیحات',   required: true  },
      { target: 'price',              source: 'price',              label: 'قیمت',      required: true  },
      { target: 'category',           source: 'category',           label: 'دسته‌بندی',  required: true  },
      { target: 'attributes.brand',   source: 'attributes.brand',   label: 'برند',      required: false },
      { target: 'attributes.type',    source: 'attributes.type',    label: 'نوع',       required: false },
      { target: 'images',             source: 'images',             label: 'تصاویر',    required: true  },
    ],
  },
];

export function createCategoryService() {
  const templates = new Map(builtInTemplates.map(t => [t.id, structuredClone(t)]));
  const reviewHistory = [];

  function getTemplateOrThrow(templateId) {
    const t = templates.get(templateId);
    if (!t) throw new Error(`قالب «${templateId}» پیدا نشد.`);
    return t;
  }

  return {
    // List all templates
    listTemplates() {
      return Array.from(templates.values()).map(t => ({
        id: t.id,
        label: t.label,
        icon: t.icon,
        version: t.version,
        status: t.status,
        fieldCount: t.fields.length,
        lastReviewedAt: t.lastReviewedAt,
      }));
    },

    // Get a specific template with full details
    getTemplate(templateId) {
      return structuredClone(getTemplateOrThrow(templateId));
    },

    // Get template for a given product category (matches product.category)
    getTemplateForProduct(productCategory) {
      for (const t of templates.values()) {
        if (t.id === productCategory && t.status === 'active') {
          return structuredClone(t);
        }
      }
      return null;
    },

    // Get all active templates
    getActiveTemplates() {
      return Array.from(templates.values())
        .filter(t => t.status === 'active')
        .map(t => structuredClone(t));
    },

    // Update template fields (supervisor action)
    updateTemplate({ templateId, fields, supervisorId }) {
      const t = getTemplateOrThrow(templateId);
      const oldFields = structuredClone(t.fields);
      t.fields = fields;
      t.version += 1;
      t.status = 'pending_review';

      reviewHistory.push({
        templateId,
        action: 'template_updated',
        oldVersion: t.version - 1,
        newVersion: t.version,
        changedBy: supervisorId,
        timestamp: new Date().toISOString(),
        fieldCount: fields.length,
      });

      return structuredClone(t);
    },

    // Review a template (manager action) — approve or request changes
    reviewTemplate({ templateId, approved, notes, reviewerId }) {
      const t = getTemplateOrThrow(templateId);
      t.lastReviewedAt = new Date().toISOString();
      t.lastReviewedBy = reviewerId;
      t.reviewNotes = notes || null;

      if (approved) {
        t.status = 'active';
      }
      // If not approved, status stays pending_review for further edits

      reviewHistory.push({
        templateId,
        action: approved ? 'template_approved' : 'template_review_rejected',
        version: t.version,
        changedBy: reviewerId,
        timestamp: t.lastReviewedAt,
        notes,
      });

      return structuredClone(t);
    },

    // Archive a template
    archiveTemplate({ templateId, supervisorId }) {
      const t = getTemplateOrThrow(templateId);
      t.status = 'archived';

      reviewHistory.push({
        templateId,
        action: 'template_archived',
        version: t.version,
        changedBy: supervisorId,
        timestamp: new Date().toISOString(),
      });

      return structuredClone(t);
    },

    // Get review history for a template or all
    getReviewHistory({ templateId } = {}) {
      let result = reviewHistory;
      if (templateId) result = result.filter(r => r.templateId === templateId);
      return structuredClone(result);
    },

    // Templates needing review
    getPendingReview() {
      return Array.from(templates.values())
        .filter(t => t.status === 'pending_review')
        .map(t => structuredClone(t));
    },
  };
}
