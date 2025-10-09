/**
 * Keepalive service to prevent AI service from sleeping on Render
 */

class KeepAliveService {
  private intervals: NodeJS.Timeout[] = []
  private readonly AI_SERVICE_URL = 'https://apliman-marketing-task-management.onrender.com'
  private readonly BACKEND_URL = 'https://taskmanagement-backendv2.onrender.com'
  private readonly PING_INTERVAL = 10 * 60 * 1000 // 10 minutes

  start() {
    if (import.meta.env.DEV) {
      console.log('🔄 Keepalive service disabled in development')
      return
    }

    console.log('🔄 Starting keepalive service...')
    
    // Ping AI service
    const aiInterval = setInterval(() => {
      this.pingService(this.AI_SERVICE_URL + '/health', 'AI service')
    }, this.PING_INTERVAL)

    // Ping backend service  
    const backendInterval = setInterval(() => {
      this.pingService(this.BACKEND_URL + '/api/health', 'Backend')
    }, this.PING_INTERVAL)

    this.intervals.push(aiInterval, backendInterval)

    // Initial ping
    this.pingService(this.AI_SERVICE_URL + '/health', 'AI service')
    this.pingService(this.BACKEND_URL + '/api/health', 'Backend')
  }

  stop() {
    this.intervals.forEach(interval => clearInterval(interval))
    this.intervals = []
    console.log('⏹️ Keepalive service stopped')
  }

  private async pingService(url: string, serviceName: string) {
    try {
      const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          })

          if (response.ok) {
        console.log(`✅ ${serviceName} keepalive ping successful (${url.split('/').pop()})`)
      } else {
        console.warn(`⚠️ ${serviceName} keepalive ping failed: ${response.status}`)
      }
    } catch (error) {
      console.warn(`⚠️ ${serviceName} keepalive ping error:`, error)
    }
  }
}

// Export singleton instance
export const keepAliveService = new KeepAliveService()