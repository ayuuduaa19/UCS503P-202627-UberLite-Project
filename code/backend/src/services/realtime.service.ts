import { EventEmitter } from 'events';
import { Response } from 'express';

export interface RideEventPayload {
  eventType:
    | 'CREATED'
    | 'MATCHED'
    | 'ACCEPTED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'REJECTED'
    | string;
  ride: any;
  timestamp: string;
}

export interface SseClient {
  id: string;
  role: 'PASSENGER' | 'DRIVER';
  userId: string;
  driverId?: string;
  rideId?: string;
  res: Response;
}

/**
 * RealtimeService manages Server-Sent Event (SSE) client connections
 * and broadcasts real-time ride-status transitions across passengers and drivers
 * while preserving the existing REST workflow as the source of ride state.
 */
export class RealtimeService extends EventEmitter {
  private clients: Map<string, SseClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setMaxListeners(150);
    this.startHeartbeat();
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      for (const [id, client] of this.clients.entries()) {
        try {
          client.res.write(': keepalive\n\n');
        } catch {
          this.clients.delete(id);
        }
      }
    }, 15000);

    if (this.heartbeatInterval && typeof this.heartbeatInterval.unref === 'function') {
      this.heartbeatInterval.unref();
    }
  }

  /**
   * Register an incoming SSE connection
   */
  public registerClient(client: SseClient) {
    this.clients.set(client.id, client);

    client.res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send connection handshake acknowledgment
    client.res.write(
      `event: connected\ndata: ${JSON.stringify({
        clientId: client.id,
        role: client.role,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    client.res.on('close', () => {
      this.clients.delete(client.id);
    });

    client.res.on('error', () => {
      this.clients.delete(client.id);
    });
  }

  /**
   * Remove a registered client
   */
  public removeClient(clientId: string) {
    this.clients.delete(clientId);
  }

  /**
   * Get active connected clients count
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Broadcast a ride state update to relevant passenger and driver SSE streams
   */
  public emitRideUpdate(ride: any, eventType?: string) {
    if (!ride) return;

    const type = eventType || ride.status || 'UPDATED';
    const payload: RideEventPayload = {
      eventType: type,
      ride,
      timestamp: new Date().toISOString(),
    };

    // Emit event locally on Node EventEmitter for internal subscribers/tests
    this.emit('ride_update', payload);

    const eventData = `event: ride_update\ndata: ${JSON.stringify(payload)}\n\n`;

    for (const [id, client] of this.clients.entries()) {
      try {
        let isRelevant = false;

        // Specific ride subscription
        if (client.rideId && client.rideId === ride.id) {
          isRelevant = true;
        }
        // Passenger subscription
        else if (client.role === 'PASSENGER' && client.userId === ride.passengerId) {
          isRelevant = true;
        }
        // Driver subscription
        else if (
          client.role === 'DRIVER' &&
          (client.driverId === ride.driverId ||
            client.userId === ride.driverId ||
            client.userId === ride.driver?.userId ||
            client.driverId === ride.driver?.id)
        ) {
          isRelevant = true;
        }

        if (isRelevant) {
          client.res.write(eventData);
        }
      } catch {
        this.clients.delete(id);
      }
    }
  }

  /**
   * Close all active SSE connections (useful for teardown and tests)
   */
  public closeAll() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const [id, client] of this.clients.entries()) {
      try {
        client.res.end();
      } catch {
        // ignore
      }
      this.clients.delete(id);
    }
  }
}

export const realtimeService = new RealtimeService();
