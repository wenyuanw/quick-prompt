export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });

  // 默认的prompt样例
  const DEFAULT_PROMPTS = [
    {
      id: crypto.randomUUID(),
      title: '翻译为中文',
      content: '请将以下内容翻译为中文，保持原意的同时使其更加通顺：\n\n',
      tags: ['翻译', '中文']
    },
    {
      id: crypto.randomUUID(),
      title: '代码解释',
      content: '请解释以下代码的功能和工作原理：\n\n',
      tags: ['编程', '解释']
    }
  ];
  
  // 获取storage接口的key名，和options页面保持一致
  const STORAGE_KEY = 'sync:userPrompts';
  // WXT的storage API在内部会将sync:userPrompts转换为userPrompts存储到browser.storage.sync
  const BROWSER_STORAGE_KEY = 'userPrompts';

  // 处理来自content script的消息
  browser.runtime.onMessage.addListener(async (message, sender) => {
    console.log('背景脚本: 收到消息', message);
    
    if (message.action === 'getPrompts') {
      try {
        const prompts = await browser.storage.sync.get(BROWSER_STORAGE_KEY);
        return { data: prompts[BROWSER_STORAGE_KEY as keyof typeof prompts] || [] };
      } catch (error) {
        console.error('获取提示失败:', error);
        return { error: '无法获取提示数据' };
      }
    }
    
    if (message.action === 'initializeDefaultPrompts') {
      try {
        const prompts = await browser.storage.sync.get(BROWSER_STORAGE_KEY);
        
        // 如果已经有提示，不初始化
        if (prompts[BROWSER_STORAGE_KEY as keyof typeof prompts] && 
            Array.isArray(prompts[BROWSER_STORAGE_KEY as keyof typeof prompts]) && 
            (prompts[BROWSER_STORAGE_KEY as keyof typeof prompts] as any[]).length > 0) {
          return { success: true, reason: 'already_exists' };
        }
        
        // 保存默认提示
        const data: Record<string, any> = {};
        data[BROWSER_STORAGE_KEY] = message.defaultPrompts || DEFAULT_PROMPTS;
        await browser.storage.sync.set(data);
        
        return { success: true };
      } catch (error) {
        console.error('初始化默认提示失败:', error);
        return { error: '无法初始化默认提示' };
      }
    }
    
    if (message.action === 'getAllPromptData') {
      try {
        const allData = await browser.storage.sync.get();
        return allData;
      } catch (error) {
        console.error('获取所有提示数据失败:', error);
        return { error: '无法获取所有提示数据' };
      }
    }
    
    if (message.action === 'openOptionsPage') {
      try {
        // 获取选项页URL - 使用WXT框架特定的路径格式
        const optionsUrl = browser.runtime.getURL('/options.html');
        // 在新标签页打开选项页
        await browser.tabs.create({ url: optionsUrl });
        return { success: true };
      } catch (error) {
        console.error('打开选项页失败:', error);
        // 如果打开新标签页失败，回退到默认打开方式
        browser.runtime.openOptionsPage();
        return { success: true, fallback: true };
      }
    }
    
    return false;
  });
});
