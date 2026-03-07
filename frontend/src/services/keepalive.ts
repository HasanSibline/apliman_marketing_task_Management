/**
 * Keepalive service to prevent AI service from sleeping on Render
 */

import { BACKEND_URL } from './api'

class KeepAliveService {
  private intervals: NodeJS.Timeout[] = []
  private readonly BACKEND_URL = BACKEND_URL
  private readonly PING_INTERVAL = 10 * 60 * 1000 // 10 minutes

  start() {
    if (import.meta.env.DEV) {
      console.log('🔄 Keepalive service disabled in development')
      return
    }

    console.log('🔄 Starting keepalive service...')

    // Ping backend service to prevent AI service/backend from sleeping
    const backendInterval = setInterval(() => {
      this.pingService(this.BACKEND_URL + '/health', 'Backend')
      this.pingService(this.BACKEND_URL + '/keepalive', 'Keepalive')
    }, this.PING_INTERVAL)

    this.intervals.push(backendInterval)

    // Initial pings
    this.pingService(this.BACKEND_URL + '/health', 'Backend')
    this.pingService(this.BACKEND_URL + '/keepalive', 'Keepalive')
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