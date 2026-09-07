if (import.meta.env.VITE_EXPERIENCE_MODE === 'roleplay') {
  import('./bubble-main.js')
} else {
  import('./main.js')
}
