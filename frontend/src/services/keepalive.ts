/**
 * Keepalive Service
 * Silently pings backend and AI service to prevent Render from sleeping
 */

class KeepaliveService {
  private backendInterval: NodeJS.Timeout | null = null
  private aiServiceInterval: NodeJS.Timeout | null = null
  private isActive = false

  // Configuration
  private readonly BACKEND_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3001'
  private readonly AI_SERVICE_URL = (import.meta as any).env.VITE_AI_SERVICE_URL || 'http://localhost:8001'
  private readonly PING_INTERVAL = 4 * 60 * 1000 // 4 minutes (Render sleeps after 5 minutes)
  private readonly AI_PING_INTERVAL = 3 * 60 * 1000 // 3 minutes for AI service

  /**
   * Start the keepalive service
   */
  start() {
    if (this.isActive) return

    // Only run keepalive in production or when explicitly enabled
    const isProduction = (import.meta as any).env.PROD
    const enableKeepalive = (import.meta as any).env.VITE_ENABLE_KEEPALIVE === 'true'
    
    if (!isProduction && !enableKeepalive) {
      console.log('🔄 Keepalive service disabled in development')
      return
    }

    console.log('🔄 Starting keepalive service...')
    this.isActive = true

    // Start backend keepalive
    this.startBackendKeepalive()
    
    // Start AI service keepalive
    this.startAIServiceKeepalive()
  }

  /**
   * Stop the keepalive service
   */
  stop() {
    if (!this.isActive) return

    console.log('⏹️ Stopping keepalive service...')
    this.isActive = false

    if (this.backendInterval) {
      clearInterval(this.backendInterval)
      this.backendInterval = null
    }

    if (this.aiServiceInterval) {
      clearInterval(this.aiServiceInterval)
      this.aiServiceInterval = null
    }
  }

  /**
   * Start backend keepalive
   */
  private startBackendKeepalive() {
    // Initial ping
    this.pingBackend()

    // Set up interval
    this.backendInterval = setInterval(() => {
      this.pingBackend()
    }, this.PING_INTERVAL)
  }

  /**
   * Start AI service keepalive
   */
  private startAIServiceKeepalive() {
    // Initial ping
    this.pingAIService()

    // Set up interval
    this.aiServiceInterval = setInterval(() => {
      this.pingAIService()
    }, this.AI_PING_INTERVAL)
  }

  /**
   * Ping backend service
   */
  private async pingBackend() {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      // Try keepalive endpoint first, fallback to health
      const endpoints = ['/api/keepalive', '/api/health']
      let lastError = null

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(`${this.BACKEND_URL}${endpoint}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
            // Don't include credentials to avoid auth issues
          })

          if (response.ok) {
            console.log(`✅ Backend keepalive ping successful (${endpoint})`)
            clearTimeout(timeoutId)
            return
          }
        } catch (error) {
          lastError = error
          continue
        }
      }

      clearTimeout(timeoutId)
      throw lastError || new Error('All endpoints failed')

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn('⚠️ Backend keepalive ping timeout')
      } else {
        console.warn('⚠️ Backend keepalive ping error:', error)
      }
    }
  }

  /**
   * Ping AI service
   */
  private async pingAIService() {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      // Try keepalive endpoint first, fallback to health
      const endpoints = ['/keepalive', '/health']
      let lastError = null

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(`${this.AI_SERVICE_URL}${endpoint}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
          })

          if (response.ok) {
            console.log(`✅ AI service keepalive ping successful (${endpoint})`)
            clearTimeout(timeoutId)
            return
          }
        } catch (error) {
          lastError = error
          continue
        }
      }

      clearTimeout(timeoutId)
      throw lastError || new Error('All endpoints failed')

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn('⚠️ AI service keepalive ping timeout')
      } else {
        console.warn('⚠️ AI service keepalive ping error:', error)
      }
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isActive: this.isActive,
      backendInterval: !!this.backendInterval,
      aiServiceInterval: !!this.aiServiceInterval,
    }
  }
}

// Create singleton instance
const keepaliveService = new KeepaliveService()

export default keepaliveService
