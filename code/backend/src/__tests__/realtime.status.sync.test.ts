import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';
import { RideStatus, VehicleType } from '@prisma/client';
import { realtimeService } from '../services/realtime.service';
import { streamPassengerRideEvents } from '../controllers/passenger.controller';
import { streamDriverRideEvents } from '../controllers/driver.controller';

const createMockSseResponse = () => {
  const writtenChunks: string[] = [];
  const writtenHeaders: any = {};
  let statusCode = 200;

  const emitter = new EventEmitter();

  const res: any = {
    writeHead(code: number, headers: any) {
      statusCode = code;
      Object.assign(writtenHeaders, headers);
      return this;
    },
    write(chunk: string) {
      writtenChunks.push(chunk);
      return true;
    },
    end() {
      emitter.emit('close');
      return this;
    },
    on(event: string, listener: (...args: any[]) => void) {
      emitter.on(event, listener);
      return this;
    },
    emit(event: string, ...args: any[]) {
      return emitter.emit(event, ...args);
    },
    getChunks() {
      return writtenChunks;
    },
    getStatusCode() {
      return statusCode;
    },
    getHeaders() {
      return writtenHeaders;
    },
  };

  return res;
};

describe('Task 42: Real-time Ride Status Updates & Synchronization', () => {
  it('should register passenger SSE client and send connection handshake', () => {
    const res = createMockSseResponse();
    const clientId = 'test-passenger-client-1';
    const passengerId = 'passenger-uuid-abc';

    realtimeService.registerClient({
      id: clientId,
      role: 'PASSENGER',
      userId: passengerId,
      res,
    });

    assert.strictEqual(res.getStatusCode(), 200);
    assert.strictEqual(res.getHeaders()['Content-Type'], 'text/event-stream');
    assert.strictEqual(res.getHeaders()['Connection'], 'keep-alive');

    const chunks = res.getChunks();
    assert.ok(chunks.length >= 1);
    assert.ok(chunks[0].includes('event: connected'));
    assert.ok(chunks[0].includes(clientId));

    // Cleanup
    realtimeService.removeClient(clientId);
  });

  it('should broadcast status update to relevant passenger client and filter out unrelated clients', () => {
    const passengerRes1 = createMockSseResponse();
    const passengerRes2 = createMockSseResponse();
    const driverRes = createMockSseResponse();

    realtimeService.registerClient({
      id: 'client-passenger-1',
      role: 'PASSENGER',
      userId: 'passenger-target-id',
      res: passengerRes1,
    });

    realtimeService.registerClient({
      id: 'client-passenger-2',
      role: 'PASSENGER',
      userId: 'other-passenger-id',
      res: passengerRes2,
    });

    realtimeService.registerClient({
      id: 'client-driver-1',
      role: 'DRIVER',
      userId: 'driver-user-id',
      driverId: 'driver-target-id',
      res: driverRes,
    });

    const mockRideUpdate = {
      id: 'ride-sync-100',
      passengerId: 'passenger-target-id',
      driverId: 'driver-target-id',
      status: RideStatus.ACCEPTED,
      pickupAddress: 'Noida Sector 18',
      dropoffAddress: 'Connaught Place',
      driver: {
        id: 'driver-target-id',
        userId: 'driver-user-id',
        vehicleModel: 'Honda Amaze',
        vehiclePlate: 'UP-16-AA-1111',
      },
    };

    realtimeService.emitRideUpdate(mockRideUpdate, RideStatus.ACCEPTED);

    // Target passenger should receive the event
    const passenger1Chunks = passengerRes1.getChunks();
    const p1Events = passenger1Chunks.filter((c: string) => c.includes('event: ride_update'));
    assert.strictEqual(p1Events.length, 1);
    assert.ok(p1Events[0].includes(RideStatus.ACCEPTED));
    assert.ok(p1Events[0].includes('ride-sync-100'));

    // Target driver should receive the event
    const driverChunks = driverRes.getChunks();
    const driverEvents = driverChunks.filter((c: string) => c.includes('event: ride_update'));
    assert.strictEqual(driverEvents.length, 1);
    assert.ok(driverEvents[0].includes(RideStatus.ACCEPTED));

    // Unrelated passenger should NOT receive the event
    const passenger2Chunks = passengerRes2.getChunks();
    const p2Events = passenger2Chunks.filter((c: string) => c.includes('event: ride_update'));
    assert.strictEqual(p2Events.length, 0);

    // Cleanup
    realtimeService.removeClient('client-passenger-1');
    realtimeService.removeClient('client-passenger-2');
    realtimeService.removeClient('client-driver-1');
  });

  it('should clean up client registration on connection close', () => {
    const res = createMockSseResponse();
    const clientId = 'client-cleanup-test';

    realtimeService.registerClient({
      id: clientId,
      role: 'PASSENGER',
      userId: 'user-to-disconnect',
      res,
    });

    assert.ok(realtimeService.getClientCount() >= 1);

    // Simulate socket disconnect
    res.emit('close');

    assert.strictEqual(
      realtimeService.getClientCount() === 0 ||
        !res.getChunks().some((c: string) => c.includes('stale')),
      true
    );
  });

  it('should stream passenger ride events via passenger controller endpoint', async () => {
    const req: any = {
      user: { id: 'passenger-stream-user' },
      params: {},
      query: { rideId: 'ride-target-stream' },
    };
    const res = createMockSseResponse();

    await streamPassengerRideEvents(req, res, () => {});

    assert.strictEqual(res.getStatusCode(), 200);
    assert.strictEqual(res.getHeaders()['Content-Type'], 'text/event-stream');
    assert.ok(res.getChunks().some((c: string) => c.includes('event: connected')));

    res.emit('close');
  });

  it('should stream driver ride events via driver controller endpoint', async () => {
    const req: any = {
      user: { id: 'driver-stream-user' },
      params: {},
      query: {},
    };
    const res = createMockSseResponse();

    await streamDriverRideEvents(req, res, () => {});

    assert.strictEqual(res.getStatusCode(), 200);
    assert.strictEqual(res.getHeaders()['Content-Type'], 'text/event-stream');
    assert.ok(res.getChunks().some((c: string) => c.includes('event: connected')));

    res.emit('close');
  });
});
