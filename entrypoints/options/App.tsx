import { useEffect, useState, useRef } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import PromptManager from "./components/PromptManager";
import CategoryManager from "./components/CategoryManager";
import NotionIntegrationPage from "./components/NotionIntegrationPage";
import GoogleAuthPage from "./components/GoogleAuthPage";
import ToastContainer from "./components/ToastContainer";
import "./App.css";
import "~/assets/tailwind.css";
import { t } from "~/utils/i18n";
const App = () => {
  // 添加回到顶部按钮相关状态
  const [showBackToTop, setShowBackToTop] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 主题切换逻辑
  useEffect(() => {
    // 检测系统颜色模式并设置相应的class
    const updateTheme = (isDark: boolean) => {
      if (isDark) {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    };

    // 初始检测
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      updateTheme(true);
    }

    // 监听系统颜色模式变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      updateTheme(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);

    // 清理函数
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // 添加滚动监听和回到顶部功能
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const scrollTop = scrollContainer.scrollTop;
      const shouldShow = scrollTop > 300;
      setShowBackToTop(shouldShow);
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    
    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // 回到顶部函数
  const scrollToTop = () => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <div className="flex h-screen">
          {/* 侧边栏 */}
          <Sidebar />
          
          {/* 主内容区域 */}
          <main className="flex-1 flex flex-col min-w-0 md:relative">
            {/* 移动端顶部空间（为汉堡菜单留出空间） */}
            <div className="md:hidden h-16 flex-shrink-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700"></div>
            
            {/* 主要内容区域 */}
            <div 
              ref={scrollContainerRef}
              className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 relative"
            >
              <Routes>
                <Route path="/" element={<PromptManager />} />
                <Route path="/categories" element={<CategoryManager />} />
                <Route path="/integrations/notion" element={<NotionIntegrationPage />} />
                <Route path="/integrations/google" element={<GoogleAuthPage />} />
              </Routes>

              {/* 回到顶部按钮 */}
              {showBackToTop && (
                <div className="fixed bottom-6 right-6 z-[9999]">
                  <button
                    onClick={scrollToTop}
                    className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all duration-300 transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    title={t('backToTop')}
                    aria-label={t('backToTop')}
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
                        d="M5 10l7-7m0 0l7 7m-7-7v18"
                      />
                    </svg>
                  </button>
                </div>
              )}
              
              {/* 添加Toast通知容器 */}
              <ToastContainer />
            </div>
          </main>
        </div>
      </div>
    </Router>
  );
};

export default App;
