import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import Logo from "~/assets/icon.png";
import NotionLogo from "./NotionLogo";
import { t } from '../../../utils/i18n';

interface SidebarProps {
  className?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
  ];

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const closeSidebar = () => {
    if (isMobile) {
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* 简化的汉堡菜单按钮 - 保持固定位置 */}
      {isMobile && !isOpen && (
        <button
          onClick={toggleSidebar}
          className="flex fixed top-2 left-4 z-50 justify-center items-center w-12 h-12 bg-white rounded-xl border border-gray-200 shadow-lg transition-all duration-200 ease-in-out  dark:bg-gray-800 dark:border-gray-600 hover:shadow-xl hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 md:hidden"
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
          width: isMobile ? "280px" : "256px",
        }}
      >
        <div className="flex flex-col h-full">
          {/* 头部区域 */}
          <div className="flex-shrink-0 p-6">
            {/* 移动端关闭按钮 */}
            {isMobile && isOpen && (
              <div className="flex justify-end mb-4">
                <button
                  onClick={closeSidebar}
                  className="flex justify-center items-center w-10 h-10 text-gray-500 rounded-lg transition-all duration-200  dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label={t('closeMenu')}
                >
                  <svg
                    className="w-6 h-6"
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
            <div className="mb-6">
              <NavLink 
                to="/" 
                onClick={closeSidebar}
                className="block overflow-hidden relative p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm transition-all duration-200 dark:from-gray-800 dark:to-gray-700 dark:border-gray-600 hover:from-gray-100 hover:to-gray-150 dark:hover:from-gray-700 dark:hover:to-gray-600 group hover:shadow-md"
              >
                {/* 背景装饰渐变 */}
                <div className="absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300 from-purple-500/5 to-violet-500/5 dark:from-purple-400/10 dark:to-violet-400/10 group-hover:opacity-100"></div>
                
                {/* 装饰性光点群 */}
                <div className="absolute top-2 right-2 w-2 h-2 bg-purple-400 rounded-full opacity-60 transition-all duration-300 group-hover:opacity-80 group-hover:scale-110"></div>
                <div className="absolute top-4 right-4 w-1.5 h-1.5 bg-violet-400 rounded-full opacity-50 group-hover:opacity-70 transition-all duration-300 group-hover:scale-125"></div>
                <div className="absolute top-6 right-6 w-1 h-1 bg-purple-300 rounded-full opacity-40 transition-all duration-300 group-hover:opacity-60"></div>
                <div className="absolute bottom-3 left-3 w-1.5 h-1.5 bg-blue-400 rounded-full opacity-30 group-hover:opacity-50 transition-all duration-300 group-hover:scale-110"></div>
                <div className="absolute bottom-5 left-5 w-1 h-1 bg-indigo-400 rounded-full opacity-25 transition-all duration-300 group-hover:opacity-40"></div>
                
                {/* 微妙的几何装饰 */}
                <div className="absolute top-1 left-1 w-3 h-3 rounded-full border border-purple-200 opacity-20 transition-opacity duration-300 dark:border-purple-600 group-hover:opacity-40"></div>
                <div className="absolute right-1 bottom-1 w-2 h-2 rounded-sm border border-violet-200 transition-opacity duration-300 rotate-45 dark:border-violet-600 opacity-15 group-hover:opacity-30"></div>
                
                <div className="flex relative z-10 flex-col items-center space-y-3">
                  {/* Logo */}
                  <div className="relative transition-all duration-200 ease-out transform group-hover:scale-105">
                    {/* Logo光晕效果 */}
                    <div className="absolute inset-0 rounded-xl opacity-0 blur-md transition-opacity duration-300 scale-110 bg-purple-400/20 group-hover:opacity-100"></div>
                    <img
                      src={Logo}
                      alt="Quick Prompt Logo"
                      className="relative z-10 w-14 h-14 rounded-xl"
                    />
                  </div>

                  {/* 品牌名称 */}
                  <div className="relative text-center">
                    <h1 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-gray-800 to-gray-600 transition-all duration-300 dark:from-gray-100 dark:to-gray-300 group-hover:from-purple-700 group-hover:to-violet-600 dark:group-hover:from-purple-300 dark:group-hover:to-violet-200">
                      Quick Prompt
                    </h1>
                  </div>
                </div>
              </NavLink>
            </div>

            {/* Navigation */}
            <nav className="space-y-2">
              {menuItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={closeSidebar}
                  className={({ isActive }) =>
                    `group flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
                      isActive
                        ? "bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-r-2 border-blue-700 dark:border-blue-400 shadow-sm"
                        : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 hover:shadow-sm"
                    }`
                  }
                >
                  <span className="flex-shrink-0 mr-3">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 mt-0.5">
                      {item.description}
                    </div>
                  </div>
                </NavLink>
              ))}
            </nav>
          </div>

          {/* 底部区域 */}
          <div className="flex-shrink-0 p-4 mt-auto border-t border-gray-200 dark:border-gray-700">
            <div className="mb-3 space-y-2">
              <NavLink
                to="/integrations/notion"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `group flex items-center px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                    isActive
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200"
                  }`
                }
              >
                <NotionLogo/>
                {t('notionSync')}
              </NavLink>
              <NavLink
                to="/integrations/google"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `group flex items-center px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                    isActive
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200"
                  }`
                }
              >
                <svg
                  className="flex-shrink-0 mr-2 w-5 h-5"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  <path d="M1 1h22v22H1z" fill="none" />
                </svg>
                {t('googleAuth')}
              </NavLink>
            </div>
            <div className="space-y-1 text-xs text-center text-gray-500 dark:text-gray-400">
              <p>© {new Date().getFullYear()} Quick Prompt</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;


