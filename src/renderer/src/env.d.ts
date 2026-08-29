/// <reference types="vite/client" />

import type { PlayerApi } from '../../preload'

declare global {
  interface Window {
    api: PlayerApi
  }
}

export {}
