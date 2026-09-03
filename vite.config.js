import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    'import.meta.env.VITE_CHAT_ENABLED': JSON.stringify(mode === 'server' ? 'true' : 'false'),
    'import.meta.env.VITE_EXPERIENCE_MODE': JSON.stringify(mode === 'server' ? 'roleplay' : 'liquid-field'),
  },
}))
