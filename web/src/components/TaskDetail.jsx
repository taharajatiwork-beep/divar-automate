import { useState, useEffect } from 'react';
import { ArrowRight, Edit3, Save, Send, CheckCircle, XCircle, History, Eye } from 'lucide-react';

const STATUS_LABELS = {
  needs_review: 'نیازمند بررسی',
  ready_for_assignment: 'آماده تخصیص',
  assigned: 'تخصیص‌یافته',
  prefill_ready: 'آماده ثبت',
  submitted: 'ثبت‌شده',
  confirmed: 'تأیید شده',
  rejected: 'رد شده',
};

const STATUS_BADGE = {
  needs_review: 'bg-orange-900/40 text-orange-300',
  ready_for_assignment: 'bg-emerald-900/40 text-emerald-300',
  assigned: 'bg-blue-900/40 text-blue-300',
  prefill_ready: 'bg-yellow-900/40 text-yellow-300',
  submitted: 'bg-purple-900/40 text-purple-300',
  confirmed: 'bg-green-900/40 text-green-300',
  rejected: 'bg-red-900/40 text-red-300',
};

const FIELD_LABELS = {
  title: 'عنوان',
  description: 'توضیحات',
  price: 'قیمت',
  category: 'دسته‌بندی',
  'attributes.brand': 'برند',
  'attributes.model': 'مدل',
  'attributes.storage': 'حافظه',
};

export default function TaskDetail({ taskId, onBack, onRefresh }) {
  const [task, setTask] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [confirmReason, setConfirmReason] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const OPERATOR = 'op-pilot-1';
  const SUPERVISOR = 'supervisor-1';

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/tasks/${taskId}`).then(r => r.json()),
      fetch(`/api/tasks/${taskId}/prefill?operatorId=${OPERATOR}`).then(r => r.json()).catch(() => ({ prefill: null })),
      fetch(`/api/tasks/${taskId}/audit`).then(r => r.json()).catch(() => ({ logs: [] })),
    ])
      .then(([taskData, prefillData, auditData]) => {
        setTask(taskData.task);
        setPrefill(prefillData.prefill);
        setLogs(auditData.logs || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [taskId]);

  const saveField = (field) => {
    setActionLoading(true);
    fetch(`/api/tasks/${taskId}/field`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operatorId: OPERATOR, field, newValue: editValue }),
    })
      .then(r => r.json())
      .then(() => { setEditing(null); load(); onRefresh(); })
      .finally(() => setActionLoading(false));
  };

  const submitTask = () => {
    setActionLoading(true);
    fetch(`/api/tasks/${taskId}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operatorId: OPERATOR }),
    })
      .then(r => r.json())
      .then(() => { load(); onRefresh(); })
      .finally(() => setActionLoading(false));
  };

  const confirmTask = () => {
    setActionLoading(true);
    fetch(`/api/tasks/${taskId}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ supervisorId: SUPERVISOR }),
    })
      .then(r => r.json())
      .then(() => { setShowConfirmDialog(false); load(); onRefresh(); })
      .finally(() => setActionLoading(false));
  };

  const rejectTask = () => {
    setActionLoading(true);
    fetch(`/api/tasks/${taskId}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ supervisorId: SUPERVISOR, reason: confirmReason }),
    })
      .then(r => r.json())
      .then(() => { setShowRejectDialog(false); setConfirmReason(''); load(); onRefresh(); })
      .finally(() => setActionLoading(false));
  };

  if (loading) return <div className="text-center text-dark-500 py-12">در حال بارگذاری...</div>;
  if (!task) return <div className="text-center text-red-400 py-12">وظیفه پیدا نشد</div>;

  const isOperatorView = task.status === 'assigned' || task.status === 'prefill_ready';
  const isSupervisorView = task.status === 'submitted';

  const editableFields = ['title', 'description', 'price', 'attributes.brand', 'attributes.model', 'attributes.storage'];

  const formatPrice = (v) => typeof v === 'number' ? `${v.toLocaleString('fa-IR')} تومان` : (v || '—');

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-dark-800 rounded-lg text-dark-500 hover:text-gray-300 transition-colors">
          <ArrowRight size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-white">{task.id}</h2>
          <p className="text-sm text-dark-500">{task.productId}</p>
        </div>
        <span className={`mr-auto px-3 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[task.status] || ''}`}>
          {STATUS_LABELS[task.status]}
        </span>
      </div>

      {/* Validation errors */}
      {task.validationErrors?.length > 0 && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-red-300 mb-2">خطاهای اعتبارسنجی</h4>
          {task.validationErrors.map((e, i) => (
            <p key={i} className="text-xs text-red-400">• {e.field}: {e.message}</p>
          ))}
        </div>
      )}

      {/* Two-column layout: Original | Prefilled */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Original product */}
        <div className="bg-dark-900 rounded-xl border border-dark-700 p-5">
          <h3 className="text-sm font-semibold text-dark-500 mb-4 flex items-center gap-2">
            <Eye size={14} /> داده اصلی محصول
          </h3>
          <div className="space-y-3">
            {task.originalProduct && Object.entries(task.originalProduct).filter(([k]) => !['images', 'attributes'].includes(k)).map(([key, val]) => (
              <div key={key} className="flex justify-between items-start">
                <span className="text-xs text-dark-500">{key}</span>
                <span className="text-sm text-gray-300 max-w-[60%] text-left">{String(val ?? '—')}</span>
              </div>
            ))}
            {task.originalProduct?.attributes && (
              <>
                <div className="border-t border-dark-700 my-2" />
                {Object.entries(task.originalProduct.attributes).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-start">
                    <span className="text-xs text-dark-500">attrib.{key}</span>
                    <span className="text-sm text-gray-300 max-w-[60%] text-left">{String(val ?? '—')}</span>
                  </div>
                ))}
              </>
            )}
            <div className="border-t border-dark-700 my-2" />
            <div className="flex justify-between">
              <span className="text-xs text-dark-500">تصاویر</span>
              <span className="text-sm text-gray-300">{(task.originalProduct?.images || []).length} تصویر</span>
            </div>
          </div>
        </div>

        {/* Prefilled / editable */}
        <div className="bg-dark-900 rounded-xl border border-dark-700 p-5">
          <h3 className="text-sm font-semibold text-dark-500 mb-4 flex items-center gap-2">
            <Edit3 size={14} /> داده پیش‌پرشده (قابل ویرایش)
          </h3>
          {prefill ? (
            <div className="space-y-3">
              {editableFields.map(key => {
                const val = key.startsWith('attributes.')
                  ? (prefill.fields?.attributes || {})[key.split('.')[1]]
                  : prefill.fields?.[key];
                const isEditing = editing === key;

                return (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-dark-500 shrink-0">{FIELD_LABELS[key] || key}</span>
                    {isEditing ? (
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          type={key === 'price' ? 'number' : 'text'}
                          value={editValue}
                          onChange={e => setEditValue(key === 'price' ? Number(e.target.value) : e.target.value)}
                          className="flex-1 bg-dark-700 border border-dark-600 rounded px-2 py-1 text-sm text-white text-left"
                          dir="auto"
                        />
                        <button onClick={() => saveField(key)} disabled={actionLoading} className="p-1 text-emerald-400 hover:text-emerald-300">
                          <Save size={14} />
                        </button>
                        <button onClick={() => setEditing(null)} className="p-1 text-dark-500 hover:text-gray-300 text-xs">✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-1 justify-end">
                        <span className="text-sm text-gray-300 text-left max-w-[70%] truncate">
                          {key === 'price' ? formatPrice(val) : String(val ?? '—')}
                        </span>
                        {isOperatorView && (
                          <button onClick={() => { setEditing(key); setEditValue(val ?? ''); }} className="p-1 text-dark-500 hover:text-yellow-400 transition-colors">
                            <Edit3 size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Images */}
              <div className="border-t border-dark-700 my-2" />
              <div className="flex justify-between items-center">
                <span className="text-xs text-dark-500">تصاویر</span>
                <span className="text-sm text-gray-300">{(prefill.images || []).length} تصویر آماده</span>
              </div>

              {/* Field edits log */}
              {prefill.fieldEdits?.length > 0 && (
                <>
                  <div className="border-t border-dark-700 my-2" />
                  <h4 className="text-xs text-dark-500 font-medium">تغییرات اعمال‌شده:</h4>
                  {prefill.fieldEdits.map((edit, i) => (
                    <div key={i} className="text-xs text-gray-500 bg-dark-800 rounded-lg p-2">
                      <span className="text-yellow-400">{FIELD_LABELS[edit.field] || edit.field}</span>: {String(edit.oldValue)} → <span className="text-emerald-400">{String(edit.newValue)}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-dark-500">اطلاعات پیش‌پرشده موجود نیست</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-dark-900 rounded-xl border border-dark-700 p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">اقدامات</h3>
        <div className="flex flex-wrap gap-3">
          {isOperatorView && (
            <button
              onClick={submitTask}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-colors"
            >
              <Send size={16} /> ثبت آگهی (انسان تأیید می‌کند)
            </button>
          )}

          {isSupervisorView && (
            <>
              <button
                onClick={() => setShowConfirmDialog(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm text-white font-medium transition-colors"
              >
                <CheckCircle size={16} /> تأیید ثبت موفق
              </button>
              <button
                onClick={() => setShowRejectDialog(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm text-white font-medium transition-colors"
              >
                <XCircle size={16} /> رد و بازگشت
              </button>
            </>
          )}

          <button
            onClick={() => setShowAudit(!showAudit)}
            className="flex items-center gap-2 px-4 py-2.5 bg-dark-700 hover:bg-dark-600 rounded-lg text-sm text-gray-300 transition-colors"
          >
            <History size={16} /> لاگ تغییرات ({logs.length})
          </button>
        </div>

        {/* Confirm dialog */}
        {showConfirmDialog && (
          <div className="mt-4 bg-green-900/20 border border-green-800/50 rounded-lg p-4">
            <p className="text-sm text-green-300 mb-3">آیا ثبت آگهی در دیوار با موفقیت انجام شده؟</p>
            <div className="flex gap-2">
              <button onClick={confirmTask} disabled={actionLoading} className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm text-white">بله، تأیید می‌کنم</button>
              <button onClick={() => setShowConfirmDialog(false)} className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-sm text-gray-400">انصراف</button>
            </div>
          </div>
        )}

        {/* Reject dialog */}
        {showRejectDialog && (
          <div className="mt-4 bg-red-900/20 border border-red-800/50 rounded-lg p-4">
            <p className="text-sm text-red-300 mb-2">دلیل رد را وارد کنید:</p>
            <input
              type="text"
              value={confirmReason}
              onChange={e => setConfirmReason(e.target.value)}
              placeholder="مثلاً: قیمت نادرست ثبت شده"
              className="w-full bg-dark-700 border border-dark-600 rounded px-3 py-2 text-sm text-white text-right mb-3"
              dir="auto"
            />
            <div className="flex gap-2">
              <button onClick={rejectTask} disabled={actionLoading || !confirmReason.trim()} className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg text-sm text-white">رد</button>
              <button onClick={() => { setShowRejectDialog(false); setConfirmReason(''); }} className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-sm text-gray-400">انصراف</button>
            </div>
          </div>
        )}
      </div>

      {/* Audit log */}
      {showAudit && (
        <div className="bg-dark-900 rounded-xl border border-dark-700 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <History size={16} /> لاگ ممیزی
          </h3>
          {logs.length === 0 ? (
            <p className="text-sm text-dark-500">لاگی ثبت نشده</p>
          ) : (
            <div className="space-y-2">
              {logs.map(log => (
                <div key={log.id} className="bg-dark-800 rounded-lg p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-500">{new Date(log.timestamp).toLocaleString('fa-IR')}</span>
                    <span className="px-2 py-0.5 bg-dark-700 rounded text-gray-400">{log.action}</span>
                  </div>
                  <div className="text-gray-400">
                    {log.operatorId && <span>توسط: <span className="text-gray-300">{log.operatorId}</span></span>}
                    {log.field && <span> · فیلد: <span className="text-yellow-400">{log.field}</span></span>}
                  </div>
                  {log.oldValue != null && log.newValue != null && (
                    <div className="text-gray-500 mt-1">
                      {String(log.oldValue)} → <span className="text-emerald-400">{String(log.newValue)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
