import { LayoutDashboard, ClipboardList, Search, ChevronLeft, Globe } from 'lucide-react';

const iconMap = {
  dashboard: LayoutDashboard,
  tasks: ClipboardList,
  audit: Search,
};

export default function Sidebar({ pages, active, onNavigate, browserStatus }) {
  const isReady = browserStatus?.ready;
  const needsLogin = browserStatus?.loginRequired;

  return (
    <aside className="w-64 bg-gray-900 border-l border-gray-700 flex flex-col min-h-screen sticky top-0">
      {/* Logo */}
      <div className="p-5 border-b border-gray-700">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-2xl">📢</span>
          پنل آگهی دیوار
        </h1>
        <p className="text-xs text-gray-500 mt-1">نسخه پایلوت</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {Object.entries(pages).map(([key, { label }]) => {
          const Icon = iconMap[key] || LayoutDashboard;
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-gray-700 text-white shadow-md'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              <Icon size={18} />
              <span className="flex-1 text-right">{label}</span>
              {isActive && <ChevronLeft size={16} className="text-gray-500" />}
            </button>
          );
        })}
      </nav>

      {/* Browser Status */}
      <div className="px-4 py-3 border-t border-gray-700">
        <div className="flex items-center gap-2 text-xs">
          <Globe size={14} className={isReady ? (needsLogin ? 'text-yellow-400' : 'text-green-400') : 'text-gray-600'} />
          <span className={isReady ? (needsLogin ? 'text-yellow-400' : 'text-green-400') : 'text-gray-600'}>
            {isReady ? (needsLogin ? 'نیاز به ورود' : 'مرورگر متصل') : 'مرورگر قطع'}
          </span>
        </div>
        {isReady && !needsLogin && browserStatus.currentUrl && (
          <div className="text-[10px] text-gray-600 truncate mt-1 font-mono">
            {browserStatus.currentUrl.replace('https://', '').substring(0, 30)}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700 text-xs text-gray-500 text-center">
        پایلوت انتشار نیمه‌خودکار
      </div>
    </aside>
  );
}
