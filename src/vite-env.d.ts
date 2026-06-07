/// <reference types="vite/client" />

// Allow side-effect CSS imports (TypeScript 6.0+ strict check)
declare module '*.css' {
  const content: string
  export default content
}
