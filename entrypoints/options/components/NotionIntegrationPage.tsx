import React from 'react';
import NotionIntegration from './NotionIntegration';

const NotionIntegrationPage: React.FC = () => {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Notion 集成</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        通过 Notion API 集成，您可以在 Quick Prompt 与 Notion 数据库之间同步您的提示词库，实现跨平台的数据共享和备份。
      </p>
      
      <NotionIntegration />
    </div>
  );
};

export default NotionIntegrationPage; 