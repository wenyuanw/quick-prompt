// 检测系统是否为暗黑模式的函数
export const isDarkMode = () => {
  return (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
};

// 检测操作系统类型
export const getOS = () => {
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();

  if (platform.includes('mac') || userAgent.includes('mac')) {
    return 'mac';
  } else if (platform.includes('win') || userAgent.includes('win')) {
    return 'windows';
  } else if (platform.includes('linux') || userAgent.includes('linux')) {
    return 'linux';
  } else {
    return 'unknown';
  }
};

// 获取复制快捷键文本
export const getCopyShortcutText = () => {
  const os = getOS();
  switch (os) {
    case 'mac':
      return '⌘+C';
    case 'windows':
    case 'linux':
      return 'Ctrl+C';
    default:
      return 'Ctrl+C';
  }
};
