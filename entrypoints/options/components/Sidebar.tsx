import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import Logo from "~/assets/icon.png";
import { t } from '../../../utils/i18n';

interface SidebarProps {
  className?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // 检测屏幕尺寸
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
      // 在桌面端默认展开，移动端默认收起
      if (window.innerWidth >= 768) {
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const menuItems = [
    {
      path: "/",
      name: t('promptManagement'),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      ),
      description: t('promptManagementDescription'),
    },
    {
      path: "/categories",
      name: t('categoryManagement'),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
      ),
      description: t('promptCategoryManagement'),
    },
    {
      path: "/settings",
      name: t('globalSettings'),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
      description: t('globalSettingsDescription'),
    },
  ];

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const closeSidebar = () => {
    if (isMobile) {
      setIsOpen(false);
    }
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  // 计算侧边栏宽度
  const getSidebarWidth = () => {
    if (isMobile) return "240px";
    return isCollapsed ? "56px" : "200px";
  };

  return (
    <>
      {/* 简化的汉堡菜单按钮 - 保持固定位置 */}
      {isMobile && !isOpen && (
        <button
          onClick={toggleSidebar}
          className="flex fixed top-2 left-4 z-50 justify-center items-center w-12 h-12 bg-white rounded-xl border border-gray-200 shadow-lg transition-all duration-200 ease-in-out  dark:bg-gray-800 dark:border-gray-600 hover:shadow-xl hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 md:hidden cursor-pointer"
          aria-label={t('openMenu')}
        >
          <svg
            className="w-6 h-6 text-gray-600 dark:text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      )}

      {/* 遮罩层 - 只在移动端且打开时显示 */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black bg-opacity-50 backdrop-blur-sm md:hidden animate-fadeIn"
          onClick={closeSidebar}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={`
          bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700
          transition-all duration-300 ease-in-out
          ${isMobile ? "fixed" : "relative"}
          ${isMobile ? "z-40" : "z-0"}
          ${isMobile ? "h-full" : "h-auto"}
          ${isMobile && !isOpen ? "-translate-x-full" : "translate-x-0"}
          ${isMobile ? "shadow-2xl" : "shadow-none"}
          ${isMobile && isOpen ? "sidebar-enter" : ""}
          ${className}
        `}
        style={{
          width: getSidebarWidth(),
        }}
      >
        <div className="flex flex-col h-full">
          {/* 头部区域 */}
          <div className="flex-shrink-0 p-3">
            {/* 移动端关闭按钮 */}
            {isMobile && isOpen && (
              <div className="flex justify-end mb-3">
                <button
                  onClick={closeSidebar}
                  className="flex justify-center items-center w-8 h-8 text-gray-500 rounded-lg transition-all duration-200  dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  aria-label={t('closeMenu')}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            )}

            {/* Logo/Title */}
            <div className="mb-3">
              {isCollapsed && !isMobile ? (
                <NavLink
                  to="/"
                  onClick={closeSidebar}
                  className="flex justify-center"
                  title="Quick Prompt"
                >
                  <img
                    src={Logo}
                    alt="Quick Prompt Logo"
                    className="w-8 h-8 rounded-lg"
                  />
                </NavLink>
              ) : (
                <NavLink
                  to="/"
                  onClick={closeSidebar}
                  className="block overflow-hidden relative bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200 shadow-sm transition-all duration-200 dark:from-gray-800 dark:to-gray-700 dark:border-gray-600 hover:from-gray-100 hover:to-gray-150 dark:hover:from-gray-700 dark:hover:to-gray-600 group hover:shadow-md p-2"
                  title="Quick Prompt"
                >
                  <div className="flex items-center gap-2">
                    <img
                      src={Logo}
                      alt="Quick Prompt Logo"
                      className="w-8 h-8 rounded-lg flex-shrink-0"
                    />
                    <h1 className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">
                      Quick Prompt
                    </h1>
                  </div>
                </NavLink>
              )}
            </div>

            {/* Navigation */}
            <nav className="space-y-1">
              {menuItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={closeSidebar}
                  className={({ isActive }) =>
                    `group flex items-center ${isCollapsed && !isMobile ? 'justify-center px-2' : 'px-2.5'} py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                      isActive
                        ? "bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
                        : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100"
                    }`
                  }
                  title={isCollapsed && !isMobile ? item.name : item.description}
                >
                  <span className={`flex-shrink-0 ${isCollapsed && !isMobile ? '' : 'mr-2'}`}>{item.icon}</span>
                  {(!isCollapsed || isMobile) && (
                    <span className="truncate">{item.name}</span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* 折叠按钮 - 仅桌面端显示 */}
          {!isMobile && (
            <div className="px-3 py-2">
              <button
                onClick={toggleCollapse}
                className="w-full flex items-center justify-center p-1.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all duration-200 cursor-pointer"
                title={isCollapsed ? t('expandSidebar') || '展开侧边栏' : t('collapseSidebar') || '收起侧边栏'}
              >
                <svg
                  className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>
          )}

          {/* 底部区域 */}
          <div className="flex-shrink-0 p-3 mt-auto border-t border-gray-200 dark:border-gray-700">
            <div className="mb-2 space-y-1">
              <NavLink
                to="/integrations/notion"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `group flex items-center ${isCollapsed && !isMobile ? 'justify-center px-2' : 'px-2.5'} py-1.5 text-xs rounded-lg transition-all duration-200 ${
                    isActive
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200"
                  }`
                }
                title={isCollapsed && !isMobile ? t('notionSync') : undefined}
              >
                <span className={`flex-shrink-0 ${isCollapsed && !isMobile ? '' : 'mr-2'}`}>
                  <svg width="16" height="16" viewBox="0 0 26 29" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.733 2.08691L23.647 8.22601V20.5042L12.733 26.6433L1.81909 20.5042V8.22601L12.733 2.08691Z" fill="white"></path><path fillRule="evenodd" clipRule="evenodd" d="M10.2816 1.37886C11.8037 0.522697 13.6622 0.522697 15.1842 1.37886L22.9172 5.72864C24.4916 6.61423 25.4659 8.28015 25.4659 10.0865V18.6439C25.4659 20.4503 24.4916 22.1162 22.9172 23.0018L15.1842 27.3516C13.6622 28.2077 11.8037 28.2077 10.2816 27.3516L2.54869 23.0018C0.974309 22.1162 0 20.4503 0 18.6439V10.0865C0 8.28015 0.97431 6.61423 2.54869 5.72864L10.2816 1.37886ZM6.18668 7.8563C4.61229 8.74189 3.63798 10.4078 3.63798 12.2142V16.5162C3.63798 18.3226 4.61229 19.9885 6.18667 20.8741L10.2816 23.1775C11.8037 24.0337 13.6622 24.0337 15.1842 23.1775L19.2792 20.8741C20.8536 19.9885 21.8279 18.3226 21.8279 16.5162V12.2142C21.8279 10.4078 20.8536 8.7419 19.2792 7.85631L15.1842 5.55289C13.6622 4.69673 11.8037 4.69673 10.2816 5.55289L6.18668 7.8563Z" fill="white"></path><path d="M12.733 2.08691L23.647 8.22601V20.5042L12.733 26.6433L1.81909 20.5042V8.22601L12.733 2.08691Z" fill="white"></path><path fillRule="evenodd" clipRule="evenodd" d="M10.2816 2.42232C11.8036 1.56615 13.6621 1.56616 15.1842 2.42232L22.0076 6.2605C23.582 7.1461 24.5563 8.81201 24.5563 10.6184V18.1119C24.5563 19.9183 23.582 21.5842 22.0076 22.4698L15.1842 26.308C13.6621 27.1642 11.8036 27.1642 10.2816 26.308L3.45812 22.4698C1.88373 21.5842 0.909424 19.9183 0.909424 18.1119V10.6184C0.909424 8.81202 1.88374 7.14609 3.45812 6.2605L10.2816 2.42232ZM5.27711 7.32434C3.70272 8.20993 2.72841 9.87585 2.72841 11.6822V17.0481C2.72841 18.8545 3.70273 20.5204 5.27711 21.406L10.2816 24.221C11.8036 25.0771 13.6621 25.0771 15.1842 24.221L20.1886 21.406C21.763 20.5204 22.7373 18.8545 22.7373 17.0481V11.6822C22.7373 9.87585 21.763 8.20993 20.1886 7.32434L15.1842 4.50933C13.6621 3.65317 11.8036 3.65317 10.2816 4.50933L5.27711 7.32434Z" fill="#111111"></path><path fillRule="evenodd" clipRule="evenodd" d="M19.0973 5.68939L9.13084 11.2955L12.7327 13.3216L23.4001 7.3212L24.2918 8.90659L13.6422 14.897V26.9923H11.8232V14.897L7.27571 12.339L7.25977 12.348L7.24501 12.3218L1.17358 8.90659L2.06536 7.3212L7.27571 10.252L18.2055 4.104L19.0973 5.68939Z" fill="#111111"></path><path d="M20.5823 12.9775L19.4163 13.6305V17.624L19.3676 17.6513L16.9762 14.997L15.9482 15.5727V21.9227L17.1196 21.2667V17.2701L17.1602 17.2473L19.5705 19.8941L20.5823 19.3275V12.9775Z" fill="#111111"></path></svg>
                </span>
                {(!isCollapsed || isMobile) && t('notionSync')}
              </NavLink>
              <NavLink
                to="/integrations/google"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `group flex items-center ${isCollapsed && !isMobile ? 'justify-center px-2' : 'px-2.5'} py-1.5 text-xs rounded-lg transition-all duration-200 ${
                    isActive
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200"
                  }`
                }
                title={isCollapsed && !isMobile ? t('googleAuth') : undefined}
              >
                <svg
                  className={`flex-shrink-0 w-4 h-4 ${isCollapsed && !isMobile ? '' : 'mr-2'}`}
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  <path d="M1 1h22v22H1z" fill="none" />
                </svg>
                {(!isCollapsed || isMobile) && t('googleAuth')}
              </NavLink>
            </div>
            {(!isCollapsed || isMobile) && (
              <div className="text-[10px] text-center text-gray-400 dark:text-gray-500">
                <p>© {new Date().getFullYear()} Quick Prompt</p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
