import { useState, useEffect } from 'react'
import { storage } from '#imports'
import PromptForm from './components/PromptForm'
import PromptList from './components/PromptList'
import SearchBar from './components/SearchBar'
import Modal from './components/Modal'
import './App.css'
import '~/assets/tailwind.css'

// 定义 Prompt 数据结构 (推荐)
export interface PromptItem {
  id: string
  title: string
  content: string
  tags: string[]
}

const App = () => {
  const [prompts, setPrompts] = useState<PromptItem[]>([])
  const [filteredPrompts, setFilteredPrompts] = useState<PromptItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [editingPrompt, setEditingPrompt] = useState<PromptItem | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [initialContent, setInitialContent] = useState<string | null>(null)

  // 从URL获取查询参数
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search)
    const action = queryParams.get('action')
    const content = queryParams.get('content')

    // 如果是从右键菜单打开并带有文本内容
    if (action === 'new' && content) {
      setInitialContent(content)
      // 稍微延迟打开模态框，确保组件已完全加载
      setTimeout(() => {
        setIsModalOpen(true)
      }, 100)
    }
  }, [])

  // Load prompts from storage
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        setIsLoading(true)
        const storedPrompts = await storage.getItem<PromptItem[]>('local:userPrompts')
        setPrompts(storedPrompts || [])
        console.log('选项页：加载 Prompts:', storedPrompts?.length || 0)
      } catch (err) {
        console.error('选项页：加载 Prompts 出错:', err)
        setError('加载 Prompts 失败，请稍后再试')
      } finally {
        setIsLoading(false)
      }
    }

    loadPrompts()
  }, [])

  // Filter prompts based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredPrompts(prompts)
      return
    }

    const term = searchTerm.toLowerCase().trim()
    const filtered = prompts.filter((prompt) => {
      const titleMatch = prompt.title.toLowerCase().includes(term)
      const contentMatch = prompt.content.toLowerCase().includes(term)
      const tagMatch = prompt.tags.some((tag) => tag.toLowerCase().includes(term))
      return titleMatch || contentMatch || tagMatch
    })

    setFilteredPrompts(filtered)
  }, [searchTerm, prompts])

  // Save prompts to storage
  const savePrompts = async (newPrompts: PromptItem[]) => {
    try {
      await storage.setItem<PromptItem[]>('local:userPrompts', newPrompts)
      console.log('选项页：Prompts 已保存')
      setPrompts(newPrompts)
    } catch (err) {
      console.error('选项页：保存 Prompts 出错:', err)
      setError('保存 Prompts 失败，请稍后再试')
    }
  }

  // Add a new prompt
  const addPrompt = async (prompt: Omit<PromptItem, 'id'>) => {
    const newPrompt: PromptItem = {
      ...prompt,
      id: crypto.randomUUID(),
    }

    const newPrompts = [...prompts, newPrompt]
    await savePrompts(newPrompts)
  }

  // Update an existing prompt
  const updatePrompt = async (updatedPrompt: PromptItem) => {
    const newPrompts = prompts.map((p) => (p.id === updatedPrompt.id ? updatedPrompt : p))

    await savePrompts(newPrompts)
    setEditingPrompt(null)
  }

  // Handle form submission for both add and update operations
  const handlePromptSubmit = async (prompt: PromptItem | Omit<PromptItem, 'id'>) => {
    if ('id' in prompt && prompt?.id) {
      // It's an update operation
      await updatePrompt(prompt as PromptItem)
    } else {
      // It's an add operation
      await addPrompt(prompt)
    }
    closeModal()
  }

  // Delete a prompt
  const deletePrompt = async (id: string) => {
    if (window.confirm('确定要删除这个 Prompt 吗？')) {
      const newPrompts = prompts.filter((p) => p.id !== id)
      await savePrompts(newPrompts)

      if (editingPrompt?.id === id) {
        setEditingPrompt(null)
      }
    }
  }

  // Start editing a prompt
  const startEdit = (id: string) => {
    const prompt = prompts.find((p) => p.id === id)
    if (prompt) {
      setEditingPrompt(prompt)
      setIsModalOpen(true)
    }
  }

  // Cancel editing
  const cancelEdit = () => {
    setEditingPrompt(null)
    setInitialContent(null)
    closeModal()
  }

  // Open modal for adding a new prompt
  const openAddModal = () => {
    setEditingPrompt(null)
    setIsModalOpen(true)
  }

  // Close modal
  const closeModal = () => {
    setIsModalOpen(false)
    setInitialContent(null)
  }

  if (isLoading) {
    return (
      <div className='min-h-screen bg-gray-50 py-8'>
        <div className='max-w-5xl mx-auto px-4'>
          <div className='flex justify-center items-center min-h-[60vh]'>
            <div className='text-center'>
              <svg
                className='animate-spin h-10 w-10 text-blue-600 mx-auto mb-4'
                xmlns='http://www.w3.org/2000/svg'
                fill='none'
                viewBox='0 0 24 24'
              >
                <circle
                  className='opacity-25'
                  cx='12'
                  cy='12'
                  r='10'
                  stroke='currentColor'
                  strokeWidth='4'
                ></circle>
                <path
                  className='opacity-75'
                  fill='currentColor'
                  d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                ></path>
              </svg>
              <p className='text-gray-600 font-medium'>加载中...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-gray-50 py-8'>
      <div className='max-w-5xl mx-auto px-4'>
        {/* 页面标题 */}
        <div className='mb-8 text-center sm:text-left'>
          <h1 className='text-3xl font-bold text-gray-800 inline-flex items-center'>
            <svg
              className='w-7 h-7 mr-2 text-blue-600'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                d='M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'
              />
            </svg>
            管理我的 Prompts
          </h1>
          <p className='text-gray-500 mt-1'>创建并管理您的自定义提示词，随时使用</p>
        </div>

        {error && (
          <div className='bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md mb-6 flex items-start'>
            <svg
              className='w-5 h-5 mr-2 mt-0.5 flex-shrink-0'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* 搜索栏和添加按钮 */}
        <div className='flex flex-col sm:flex-row gap-3 mb-6'>
          <SearchBar value={searchTerm} onChange={setSearchTerm} />
          <button
            onClick={openAddModal}
            className='flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center sm:justify-start'
          >
            <svg className='w-5 h-5 mr-1' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                d='M12 6v6m0 0v6m0-6h6m-6 0H6'
              />
            </svg>
            添加新 Prompt
          </button>
        </div>

        {/* Prompts列表 */}
        <PromptList
          prompts={filteredPrompts}
          onEdit={startEdit}
          onDelete={deletePrompt}
          searchTerm={searchTerm}
          allPromptsCount={prompts.length}
        />

        {/* 无结果提示 */}
        {filteredPrompts.length === 0 && (
          <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center'>
            {searchTerm ? (
              <div>
                <p className='text-gray-600 mb-2'>没有找到匹配"{searchTerm}"的 Prompt</p>
                <button
                  onClick={() => setSearchTerm('')}
                  className='text-blue-600 hover:text-blue-800 font-medium'
                >
                  清除搜索
                </button>
              </div>
            ) : (
              <div>
                <p className='text-gray-600 mb-2'>您还没有创建任何 Prompt</p>
                <button
                  onClick={openAddModal}
                  className='text-blue-600 hover:text-blue-800 font-medium'
                >
                  创建第一个 Prompt
                </button>
              </div>
            )}
          </div>
        )}

        {/* 添加/编辑 Prompt 模态框 */}
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          title={editingPrompt ? '编辑 Prompt' : '新建 Prompt'}
        >
          <PromptForm
            onSubmit={handlePromptSubmit}
            initialData={
              editingPrompt
                ? {
                    ...editingPrompt,
                  }
                : initialContent
                ? {
                    id: '',
                    title: '',
                    content: initialContent,
                    tags: [],
                  }
                : null
            }
            onCancel={cancelEdit}
            isEditing={!!editingPrompt}
          />
        </Modal>
      </div>
    </div>
  )
}

export default App
