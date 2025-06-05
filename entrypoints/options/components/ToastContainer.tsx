import React, { useState, useEffect, useRef, useCallback } from 'react';
import Toast, { ToastProps } from './Toast';
import { browser } from '#imports';
import { t } from '../../../utils/i18n'

interface ToastItem extends ToastProps {
  id: string;
  error?: string;
}

// 定义同步状态的类型
interface SyncStatus {
  id: string;
  status: 'in_progress' | 'success' | 'error';
  startTime?: number;
  completedTime?: number;
  message?: string;
  error?: string;
  success?: boolean;
}

const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // 使用ref来追踪已处理的通知ID，避免重复添加
  const processedToastsRef = useRef<Set<string>>(new Set());
  // 使用ref来存储当前的toasts状态，避免依赖于toasts导致循环
  const toastsRef = useRef<ToastItem[]>([]);
  
  // 当toasts状态更新时，同步更新ref
  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);
  
  const removeToast = useCallback((id: string) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
    processedToastsRef.current.delete(id);
  }, []);
  
  const addToast = useCallback((toast: ToastProps & { id?: string, error?: string }) => {
    const id = toast.id || `toast-${Date.now()}`;
    
    // 检查是否已经添加过这个toast
    if (processedToastsRef.current.has(id) || toastsRef.current.some(t => t.id === id)) {
      return;
    }
    
    processedToastsRef.current.add(id);
    setToasts(prevToasts => [...prevToasts, { ...toast, id }]);
  }, []);
  
  // 检查同步状态并添加Toast
  useEffect(() => {
    const checkSyncStatuses = async () => {
      try {
        // 获取所有存储的状态
        const result = await browser.storage.local.get(null);
        const allKeys = Object.keys(result);
        
        // 处理标准同步状态
        const syncKeys = ['notion_sync_status', 'notion_from_sync_status'];
        for (const storageKey of syncKeys) {
          const syncStatus = result[storageKey] as SyncStatus;
          if (syncStatus) {
            const statusId = `${storageKey}_${syncStatus.id}`;
            
            // 处理成功或失败状态
            if (syncStatus.status === 'success' || syncStatus.status === 'error') {
              // 移除任何正在加载的状态
              setToasts(prev => prev.filter(t => t.id !== `loading_${statusId}`));
              processedToastsRef.current.delete(`loading_${statusId}`);
              
              // 添加成功/错误消息
              if (!processedToastsRef.current.has(statusId)) {
                addToast({
                  id: statusId,
                  type: syncStatus.status === 'success' ? 'success' : 'error',
                  message: syncStatus.message || (syncStatus.status === 'success' ? t('syncSuccess') : t('syncFailed')),
                  error: syncStatus.error,
                  duration: syncStatus.error ? 10000 : 5000
                });
                
                // 清除已完成的状态
                await browser.storage.local.remove(storageKey);
              }
            } 
            // 处理进行中的状态
            else if (syncStatus.status === 'in_progress') {
              const loadingId = `loading_${statusId}`;
              if (!processedToastsRef.current.has(loadingId) && !toastsRef.current.some(t => t.id === loadingId)) {
                let loadingMessage = t('syncing');
                if (storageKey === 'notion_sync_status') {
                  loadingMessage = t('syncingToNotion');
                } else if (storageKey === 'notion_from_sync_status') {
                  loadingMessage = t('syncingFromNotion');
                }
                
                addToast({
                  id: loadingId,
                  type: 'loading',
                  message: syncStatus.message || loadingMessage,
                  duration: Infinity
                });
              }
            }
          }
        }
        
        // 处理临时消息状态
        const tempMessageKeys = allKeys.filter(key => key.startsWith('temp_notion_message_'));
        for (const messageKey of tempMessageKeys) {
          const messageStatus = result[messageKey] as SyncStatus;
          if (messageStatus && messageStatus.id) {
            const statusId = `temp_${messageStatus.id}`;
            
            // 仅处理成功或失败的临时消息
            if ((messageStatus.status === 'success' || messageStatus.status === 'error') 
                && !processedToastsRef.current.has(statusId)) {
              addToast({
                id: statusId,
                type: messageStatus.status === 'success' ? 'success' : 'error',
                message: messageStatus.message || '',
                error: messageStatus.error,
                duration: messageStatus.error ? 10000 : 5000
              });
            }
          }
        }
      } catch (error) {
        console.error('检查同步状态时出错:', error);
      }
    };
    
    // 初始检查并每秒轮询一次
    checkSyncStatuses();
    const interval = setInterval(checkSyncStatuses, 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, [addToast]);
  
  return (
    <div className="toast-container fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
          error={toast.error}
        />
      ))}
    </div>
  );
};

export default ToastContainer; 