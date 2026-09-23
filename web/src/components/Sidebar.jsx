import { useState } from 'react';
import { LayoutDashboard, ClipboardList, Search, ChevronLeft, Globe, Radio, Megaphone } from 'lucide-react';

const iconMap = {
  dashboard: LayoutDashboard,
  tasks: ClipboardList,
  audit: Search,
};

export default function Sidebar({ pages, active, onNavigate, browserStatus }) {
  const isReady = browserStatus?.ready;
  const needsLogin = browserStatus?.loginRequired;
  const [hoveredItem, setHoveredItem] = useState(null);

  const truncatedUrl = browserStatus?.currentUrl
    ? browserStatus.currentUrl.replace(/^https?:\/\//, '').substring(0, 35)
    : null;

  const statusColor = isReady
    ? needsLogin ? 'text-amber-400' : 'text-emerald-400'
    : 'text-gray-500';

  const statusBg = isReady
    ? needsLogin ? 'bg-amber-500/10 border-amber-700/30' : 'bg-emerald-500/10 border-emerald-700/30'
    : 'bg-gray-800/50 border-gray-700/30';

  const statusLabel = isReady
    ? needsLogin ? 'نیاز به ورود' : 'مرورگر متصل'
    : 'مرورگر قطع';

  const statusDotColor = isReady
    ? needsLogin ? 'bg-amber-400' : 'bg-emerald-400'
    : 'bg-gray-500';

  return (
    <aside className="w-64 flex flex-col min-h-screen sticky top-0 border-l border-dark-600/50"
      style={{ background: 'linear-gradient(180deg, #111118 0%, #0d0d14 50%, #0a0a10 100%)' }}>

      {/* Logo */}
      <div className="p-5 border-b border-dark-600/40">
        <div className="flex items-center gap-3 group cursor-default">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 flex items-center justify-center transition-all duration-300 group-hover:from-blue-500/30 group-hover:to-blue-600/20 group-hover:border-blue-500/30 group-hover:scale-110 group-hover:rotate-3">
              <Megaphone size={18} className="text-blue-400 transition-transform duration-300 group-hover:scale-110" />
            </div>
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-white tracking-tight leading-tight">
              پنل آگهی
            </h1>
            <p className="text-[11px] text-dark-500 font-medium mt-0.5">دیوار · نسخه پایلوت</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {Object.entries(pages).map(([key, { label, badge }]) => {
          const Icon = iconMap[key] || LayoutDashboard;
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              onMouseEnter={() => setHoveredItem(key)}
              onMouseLeave={() => setHoveredItem(null)}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                transition-all duration-200 ease-out relative overflow-hidden
                ${isActive
                  ? 'bg-white/[0.07] text-white border-r-2 border-r-blue-500 shadow-[0_0_15px_-3px_rgba(59,130,246,0.15)]'
                  : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200 hover:translate-x-[-1px]'
                }
              `}
            >
              <Icon
                size={18}
                className={`transition-all duration-200 ${
                  isActive ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-300'
                } ${hoveredItem === key && !isActive ? 'scale-110' : ''}`}
              />
              <span className="flex-1 text-right">{label}</span>

              {/* Notification badge */}
              {badge != null && badge > 0 && (
                <span className={`
                  min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-[10px] font-bold
                  transition-all duration-200
                  ${isActive
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'bg-white/[0.06] text-gray-400 border border-white/[0.08]'
                  }
                `}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}

              {isActive && (
                <ChevronLeft size={16} className="text-blue-400/60 transition-transform duration-200" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Browser Status — mini card */}
      <div className="mx-3 mb-3">
        <div className={`px-3 py-2.5 rounded-xl border transition-colors duration-300 ${statusBg}`}>
          <div className="flex items-center gap-2.5">
            {/* Status indicator dot */}
            <div className="relative flex items-center justify-center">
              <div className={`w-2 h-2 rounded-full ${statusDotColor} transition-colors duration-300`} />
              {isReady && !needsLogin && (
                <div className={`absolute w-2 h-2 rounded-full ${statusDotColor} animate-ping opacity-40`} />
              )}
            </div>

            <Globe size={14} className={statusColor} />

            <div className="flex-1 min-w-0">
              <span className={`text-[11px] font-semibold ${statusColor}`}>
                {statusLabel}
              </span>
              {truncatedUrl && (
                <div className="text-[10px] text-dark-500 font-mono truncate mt-0.5" dir="ltr" title={browserStatus.currentUrl}>
                  {truncatedUrl}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-dark-600/40">
        <div className="flex items-center justify-center gap-1.5">
          <Radio size={10} className="text-dark-500" />
          <span className="text-[10px] text-dark-500 font-medium tracking-tight">
            انتشار نیمه‌خودکار v0.1
          </span>
        </div>
      </div>
    </aside>
  );
}
