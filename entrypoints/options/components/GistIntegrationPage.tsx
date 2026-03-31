import React from 'react';
import GistIntegration from './GistIntegration';
import { t } from '../../../utils/i18n';

const GistIntegrationPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-amber-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-orange-900 to-amber-900 dark:from-gray-100 dark:via-orange-100 dark:to-amber-100 bg-clip-text text-transparent">
              {t('giteeGistIntegration')}
            </h1>
          </div>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-3xl">
            {t('giteeGistIntegrationDescription')}
          </p>
        </div>
        
        <GistIntegration />
      </div>
    </div>
  );
};

export default GistIntegrationPage;
