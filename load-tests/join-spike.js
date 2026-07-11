import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, fail } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const admittedCount = new Counter('shoppers_admitted');
const positionUpdateLag = new Trend('position_update_lag_ms');

export const options = {
  stages: [
    { duration: '15s', target: 50 },   // ramp up to 50 users
    { duration: '30s', target: 200 },  // spike to 200 users
    { duration: '15s', target: 500 },  // peak: 500 concurrent
    { duration: '15s', target: 0 },     // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],      // 95% of joins under 500ms
    http_req_failed: ['rate<0.01'],      // less than 1% error rate
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:4000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:4000';
const EVENT_ID = __ENV.EVENT_ID;

export default function () {
  if (!EVENT_ID) {
    fail('EVENT_ID environment variable is required');
  }

  // 1. Join the queue (auth is optional for shoppers)
  const sessionId = `vu_${__VU}_iter_${__ITER}`;
  const joinStart = Date.now();
  
  const ip = `10.0.${__VU % 255}.${__ITER % 255}`;
  const joinRes = http.post(
    `${BASE_URL}/events/${EVENT_ID}/join`,
    JSON.stringify({ sessionId }),
    { headers: { 
        'Content-Type': 'application/json',
        'x-forwarded-for': ip
    } }
  );

  check(joinRes, {
    'joined queue': (r) => r.status === 201,
    'got position':  (r) => r.json('position') !== undefined,
  });

  if (joinRes.status !== 201) {
    return; // Don't try to connect to socket if join failed
  }

  // 2. Connect WebSocket using Socket.IO v4 protocol
  const wsEndpoint = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
  
  const res = ws.connect(wsEndpoint, {}, function (socket) {
    let connectedToNamespace = false;

    socket.on('open', () => {
      // Connect to the /ws namespace
      socket.send('40/ws,');
    });

    socket.on('message', (data) => {
      // Respond to Engine.IO pings
      if (data === '2') {
        socket.send('3');
        return;
      }

      // Socket.IO message
      if (data.startsWith('40/ws,')) {
        // Connected to namespace, now subscribe
        connectedToNamespace = true;
        const subscribePayload = `42/ws,["subscribe",{"eventId":"${EVENT_ID}","sessionId":"${sessionId}"}]`;
        socket.send(subscribePayload);
      } else if (data.startsWith('42/ws,')) {
        // Event payload
        try {
          const payloadString = data.substring(6); // remove '42/ws,'
          const payload = JSON.parse(payloadString);
          const eventName = payload[0];
          const eventData = payload[1];

          if (eventName === 'queue:position_update') {
            positionUpdateLag.add(Date.now() - joinStart);
            socket.close(); // Close after first update to avoid keeping 5000 sockets open forever if not testing socket endurance
          } else if (eventName === 'queue:admitted') {
            admittedCount.add(1);
            socket.close();
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    });

    socket.on('error', (e) => {
      // Handle socket error silently to avoid cluttering logs
    });

    // Close socket after 15 seconds if no updates
    socket.setTimeout(() => {
      socket.close();
    }, 15000);
  });

  check(res, { 'websocket connected': (r) => r && r.status === 101 });

  sleep(1);
}
