import { useEffect, useState, useRef } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { ArrowUp } from "lucide-react";
import Sidebar from "./components/Sidebar";
import PromptManager from "./components/PromptManager";
import CategoryManager from "./components/CategoryManager";
import NotionIntegrationPage from "./components/NotionIntegrationPage";
import GistIntegrationPage from "./components/GistIntegrationPage";
import WebDavIntegrationPage from "./components/WebDavIntegrationPage";
import GlobalSettings from "./components/GlobalSettings";
import QuickInjectSettings from "./components/QuickInjectSettings";
import ToastContainer from "./components/ToastContainer";
import "./App.css";
import "~/assets/tailwind.css";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/layout/AppShell";
import { t, initLocale } from "~/utils/i18n";
const App = () => {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [localeReady, setLocaleReady] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initLocale().then(() => setLocaleReady(true));
  }, []);

  useEffect(() => {
    const updateTheme = (isDark: boolean) => {
      if (isDark) {
        document.documentElement.classList.remove("light");
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
      }
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    updateTheme(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) => {
      updateTheme(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

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

  const scrollToTop = () => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }
  };

  if (!localeReady) return null;

  return (
    <Router>
      <AppShell>
        <div className="flex h-screen">
          <Sidebar />

          <main className="flex-1 flex flex-col min-w-0 md:relative">
            <div className="md:hidden h-16 flex-shrink-0 border-b border-border bg-background/95 backdrop-blur" />

            <div
              ref={scrollContainerRef}
              className="thin-scrollbar relative flex-1 overflow-auto bg-background"
            >
              <Routes>
                <Route path="/" element={<PromptManager />} />
                <Route path="/categories" element={<CategoryManager />} />
                <Route path="/settings" element={<GlobalSettings />} />
                <Route path="/settings/quick-inject" element={<QuickInjectSettings />} />
                <Route path="/integrations/notion" element={<NotionIntegrationPage />} />

                <Route path="/integrations/gist" element={<GistIntegrationPage />} />
                <Route path="/integrations/webdav" element={<WebDavIntegrationPage />} />
              </Routes>

              {showBackToTop && (
                <Button
                  onClick={scrollToTop}
                  size="icon"
                  className="fixed bottom-6 right-6 z-[9999] rounded-full shadow-lg"
                  title={t("backToTop")}
                  aria-label={t("backToTop")}
                >
                  <ArrowUp className="size-5" />
                </Button>
              )}

              <ToastContainer />
            </div>
          </main>
        </div>
      </AppShell>
    </Router>
  );
};

export default App;
