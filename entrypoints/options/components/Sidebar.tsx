import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import Logo from "~/assets/icon.png";

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
      name: "提示词管理",
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
      description: "管理您的提示词",
    },
    {
      path: "/categories",
      name: "分类管理",
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
      description: "管理提示词分类",
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
          className="
            fixed top-2 left-4 z-50 
            w-12 h-12 
            flex items-center justify-center
            bg-white dark:bg-gray-800 
            border border-gray-200 dark:border-gray-600 
            rounded-xl shadow-lg hover:shadow-xl
            hover:bg-gray-50 dark:hover:bg-gray-700 
            active:scale-95
            transition-all duration-200 ease-in-out
            md:hidden
          "
          aria-label="打开菜单"
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
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden backdrop-blur-sm animate-fadeIn"
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
          <div className="p-6 flex-shrink-0">
            {/* 移动端关闭按钮 */}
            {isMobile && isOpen && (
              <div className="flex justify-end mb-4">
                <button
                  onClick={closeSidebar}
                  className="
                    w-10 h-10 
                    flex items-center justify-center
                    rounded-lg 
                    text-gray-500 dark:text-gray-400 
                    hover:text-gray-700 dark:hover:text-gray-200 
                    hover:bg-gray-100 dark:hover:bg-gray-700 
                    transition-all duration-200
                  "
                  aria-label="关闭菜单"
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
                className="block relative p-4 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 border border-gray-200 dark:border-gray-600 hover:from-gray-100 hover:to-gray-150 dark:hover:from-gray-700 dark:hover:to-gray-600 transition-all duration-200 group shadow-sm hover:shadow-md overflow-hidden"
              >
                {/* 背景装饰渐变 */}
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-violet-500/5 dark:from-purple-400/10 dark:to-violet-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                
                {/* 装饰性光点群 */}
                <div className="absolute top-2 right-2 w-2 h-2 bg-purple-400 rounded-full opacity-60 group-hover:opacity-80 transition-all duration-300 group-hover:scale-110"></div>
                <div className="absolute top-4 right-4 w-1.5 h-1.5 bg-violet-400 rounded-full opacity-50 group-hover:opacity-70 transition-all duration-300 group-hover:scale-125"></div>
                <div className="absolute top-6 right-6 w-1 h-1 bg-purple-300 rounded-full opacity-40 group-hover:opacity-60 transition-all duration-300"></div>
                <div className="absolute bottom-3 left-3 w-1.5 h-1.5 bg-blue-400 rounded-full opacity-30 group-hover:opacity-50 transition-all duration-300 group-hover:scale-110"></div>
                <div className="absolute bottom-5 left-5 w-1 h-1 bg-indigo-400 rounded-full opacity-25 group-hover:opacity-40 transition-all duration-300"></div>
                
                {/* 微妙的几何装饰 */}
                <div className="absolute top-1 left-1 w-3 h-3 border border-purple-200 dark:border-purple-600 rounded-full opacity-20 group-hover:opacity-40 transition-opacity duration-300"></div>
                <div className="absolute bottom-1 right-1 w-2 h-2 border border-violet-200 dark:border-violet-600 rounded-sm opacity-15 group-hover:opacity-30 transition-opacity duration-300 rotate-45"></div>
                
                <div className="flex flex-col items-center space-y-3 relative z-10">
                  {/* Logo */}
                  <div className="relative transform group-hover:scale-105 transition-all duration-200 ease-out">
                    {/* Logo光晕效果 */}
                    <div className="absolute inset-0 bg-purple-400/20 rounded-xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 scale-110"></div>
                    <img
                      src={Logo}
                      alt="Quick Prompt Logo"
                      className="w-14 h-14 rounded-xl relative z-10"
                    />
                  </div>

                  {/* 品牌名称 */}
                  <div className="text-center relative">
                    <h1 className="text-lg font-bold bg-gradient-to-r from-gray-800 to-gray-600 dark:from-gray-100 dark:to-gray-300 bg-clip-text text-transparent group-hover:from-purple-700 group-hover:to-violet-600 dark:group-hover:from-purple-300 dark:group-hover:to-violet-200 transition-all duration-300">
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
                  <span className="mr-3 flex-shrink-0">{item.icon}</span>
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
          <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="space-y-2 mb-3">
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
                <svg
                  className="flex-shrink-0 w-5 h-5 mr-2"
                  viewBox="0 0 385 385"
                  fill="currentColor"
                >
                  <path d="M48.6,49.4c-26.7,26.8-42.6,46.1-42.6,51.8c0,9.8,16.5,25.9,68.2,66.4C110.1,199,136,225.2,136,229c0,2-15.3,18.8-34,37.5c-41,40.8-48.7,50.5-45.3,56.9c8.1,15.4,28.4,8.9,85.5-27.2c25.3-16,46.7-28.8,47.5-28.4c0.8,0.4,7.3,6.4,14.5,13.5c16.2,15.9,93.8,77.4,103,81.7c15.1,7.1,38-13.4,32.8-29.3c-1.6-4.9-11.5-16.2-30-34.2c-15.4-15-28-28.4-28-29.9c0-1.4,6.8-9.6,15-18.2c8.3-8.6,22.5-24.1,31.7-34.6c27.8-31.5,32.5-35.9,41.7-38.8c17.9-5.6,32.7,5.8,43.6,33.6c22.3,56.2,11.6,118.9-28.9,168.4c-54.4,66.6-145.2,87.1-223.4,50.2c-83.3-39.4-128-135.9-106.3-228.9C63.9,125.1,93.9,75.6,141,44.1c20.2-13.5,56.8-30.1,72.5-33.1c18.7-3.5,35.1,1.7,57.4,18.2c20.6,15.3,57.3,59.2,65.5,78.5c3.2,7.6,6.4,13.8,7,13.8c2.5,0,22.3-15.9,24.5-19.8c5.9-10.3-20.7-53.8-50.6-82.6C261.9-34.6,131.3-34.1,48.6,49.4z"/>
                </svg>
                Notion 同步
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
                  className="flex-shrink-0 w-5 h-5 mr-2"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  <path d="M1 1h22v22H1z" fill="none" />
                </svg>
                Google 认证
              </NavLink>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center space-y-1">
              <p>© {new Date().getFullYear()} Quick Prompt</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;


