/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./entrypoints/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // 使用class驱动的暗黑模式
  theme: {
    extend: {},
  },
  plugins: [],
} 
