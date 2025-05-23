// 检测系统是否为暗黑模式的函数
export const isDarkMode = () => {
  return (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
};
