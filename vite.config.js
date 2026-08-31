import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    'import.meta.env.VITE_CHAT_ENABLED': JSON.stringify(mode === 'server' ? 'true' : 'false'),
  },
}))
