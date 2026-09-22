import { LayoutDashboard, ClipboardList, Search, ChevronLeft } from 'lucide-react';

const iconMap = {
  dashboard: LayoutDashboard,
  tasks: ClipboardList,
  audit: Search,
};

export default function Sidebar({ pages, active, onNavigate }) {
  return (
    <aside className="w-64 bg-dark-900 border-l border-dark-700 flex flex-col min-h-screen sticky top-0">
      {/* Logo */}
      <div className="p-5 border-b border-dark-700">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-2xl">📢</span>
          پنل آگهی دیوار
        </h1>
        <p className="text-xs text-dark-500 mt-1">نسخه پایلوت</p>
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
                  ? 'bg-dark-700 text-white shadow-md'
                  : 'text-gray-400 hover:bg-dark-800 hover:text-gray-200'
              }`}
            >
              <Icon size={18} />
              <span className="flex-1 text-right">{label}</span>
              {isActive && <ChevronLeft size={16} className="text-dark-500" />}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-dark-700 text-xs text-dark-500 text-center">
        پایلوت انتشار نیمه‌خودکار
      </div>
    </aside>
  );
}
