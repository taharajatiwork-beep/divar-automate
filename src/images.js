// ─── Image Preparation Service ──────────────────────────────────────
// Prepares image manifests for each task.
// In production: downloads, resizes, validates. In pilot: validates URLs.

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_IMAGES = 10;
const MAX_SIZE_MB = 5;

export function createImageService() {
  const taskImages = new Map(); // taskId → manifest

  return {
    // Prepare image manifest for a task
    prepareForTask({ taskId, imageUrls = [] }) {
      if (imageUrls.length === 0) {
        taskImages.set(taskId, {
          taskId,
          status: 'needs_images',
          images: [],
          errors: ['هیچ تصویری ارسال نشده.'],
          readyAt: null,
        });
        return taskImages.get(taskId);
      }

      if (imageUrls.length > MAX_IMAGES) {
        imageUrls = imageUrls.slice(0, MAX_IMAGES);
      }

      const images = imageUrls.map((url, index) => {
        const ext = '.' + url.split('?')[0].split('.').pop().toLowerCase();
        const isValidExt = ALLOWED_EXTENSIONS.includes(ext);
        const isValidUrl = url.startsWith('http://') || url.startsWith('https://');

        return {
          index: index + 1,
          url,
          filename: `ad-${taskId}-${String(index + 1).padStart(2, '0')}${ext}`,
          valid: isValidExt && isValidUrl,
          error: !isValidUrl ? 'آدرس نامعتبر' : !isValidExt ? `فرمت پشتیبانی نمی‌شود (${ext})` : null,
        };
      });

      const validImages = images.filter(i => i.valid);
      const errors = images.filter(i => !i.valid).map(i => `تصویر ${i.index}: ${i.error}`);
      const allValid = errors.length === 0;

      const manifest = {
        taskId,
        status: allValid ? 'ready' : 'has_errors',
        images: validImages,
        totalCount: images.length,
        validCount: validImages.length,
        errors,
        readyAt: allValid ? new Date().toISOString() : null,
      };

      taskImages.set(taskId, manifest);
      return structuredClone(manifest);
    },

    // Get manifest for a task
    getManifest({ taskId }) {
      return taskImages.has(taskId) ? structuredClone(taskImages.get(taskId)) : null;
    },

    // Check if images are ready for a task
    isReady({ taskId }) {
      const m = taskImages.get(taskId);
      return m ? m.status === 'ready' : false;
    },

    // Mark images as downloaded (for production use)
    markDownloaded({ taskId }) {
      const m = taskImages.get(taskId);
      if (m) {
        m.status = 'downloaded';
        m.downloadedAt = new Date().toISOString();
      }
      return m ? structuredClone(m) : null;
    },

    // Get summary across all tasks
    getSummary() {
      let totalImages = 0;
      let readyTasks = 0;
      let errorTasks = 0;
      let pendingTasks = 0;

      for (const m of taskImages.values()) {
        totalImages += m.validCount || 0;
        if (m.status === 'ready') readyTasks++;
        else if (m.status === 'has_errors') errorTasks++;
        else pendingTasks++;
      }

      return { totalImages, readyTasks, errorTasks, pendingTasks };
    },
  };
}
