import React from 'react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

const SearchBar = ({ value, onChange }: SearchBarProps) => {
  const handleClear = () => {
    onChange('')
  }

  return (
    <div className='relative w-full'>
      <div className='absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none'>
        <svg
          className='w-5 h-5 text-gray-400'
          aria-hidden='true'
          xmlns='http://www.w3.org/2000/svg'
          fill='none'
          viewBox='0 0 20 20'
        >
          <path
            stroke='currentColor'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth='2'
            d='m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z'
          />
        </svg>
      </div>
      <input
        type='text'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className='block w-full p-3 pl-10 pr-10 text-gray-700 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 placeholder:text-gray-400'
        placeholder='搜索标题、内容或标签...'
      />

      {value && (
        <div className='absolute inset-y-0 right-0 flex items-center pr-3'>
          <button
            onClick={handleClear}
            className='text-gray-400 hover:text-gray-600 focus:outline-none dark:hover:text-gray-300'
            aria-label='清除搜索'
          >
            <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M6 18L18 6M6 6l12 12'
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

export default SearchBar
