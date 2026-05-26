const http = require("http");
const { URL } = require("url");

const PORT = 8000;
const VALID_TOKEN = "local-dev-token";
const readings = [
  {
    reading_id: "rdg-1234",
    device_id: "ESP32-LAB-A01",
    metric: "temperature",
    value: 31.5,
    unit: "celsius",
    timestamp: "2026-05-13T08:30:00+07:00",
  },
  {
    reading_id: "rdg-1235",
    device_id: "ESP32-LAB-A01",
    metric: "humidity",
    value: 55.2,
    unit: "percent",
    timestamp: "2026-05-13T08:31:00+07:00",
  },
];

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function problem(res, status, title, detail) {
  sendJson(res, status, {
    type: `https://example.com/probs/${title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    status,
    detail,
  });
}

function requireAuth(req, res) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    problem(res, 401, "Unauthorized", "Thiếu token hoặc token không hợp lệ");
    return false;
  }
  const token = auth.slice(7);
  if (token !== VALID_TOKEN) {
    problem(res, 401, "Unauthorized", "Token không hợp lệ");
    return false;
  }
  return true;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      if (!body) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function createReadingPayload(data) {
  return {
    reading_id: `rdg-${Math.floor(1000 + Math.random() * 9000)}`,
    accepted: true,
    received_at: new Date().toISOString(),
  };
}

function handlePostReadings(req, res) {
  if (!requireAuth(req, res)) return;
  parseJsonBody(req)
    .then((body) => {
      if (!body || typeof body !== "object") {
        problem(res, 400, "Bad Request", "Payload không phải JSON hợp lệ");
        return;
      }
      const required = ["device_id", "metric", "value", "unit", "timestamp"];
      const missing = required.filter((key) => !(key in body));
      if (missing.length > 0) {
        problem(
          res,
          422,
          "Unprocessable Entity",
          `Thiếu trường bắt buộc: ${missing.join(", ")}`,
        );
        return;
      }
      const reading = {
        reading_id: createReadingPayload(body).reading_id,
        device_id: String(body.device_id),
        metric: String(body.metric),
        value: Number(body.value),
        unit: String(body.unit),
        timestamp: String(body.timestamp),
      };
      readings.unshift(reading);
      sendJson(res, 201, {
        reading_id: reading.reading_id,
        accepted: true,
        received_at: new Date().toISOString(),
      });
    })
    .catch(() => {
      problem(res, 400, "Bad Request", "Payload JSON không hợp lệ");
    });
}

function handleGetLatest(req, res, url) {
  if (!requireAuth(req, res)) return;
  const deviceId = url.searchParams.get("device_id");
  const limit = Math.max(
    1,
    Math.min(100, Number(url.searchParams.get("limit")) || 5),
  );
  const items = readings
    .filter((r) => !deviceId || r.device_id === deviceId)
    .slice(0, limit)
    .map((r) => ({
      reading_id: r.reading_id,
      device_id: r.device_id,
      metric: r.metric,
      value: r.value,
      unit: r.unit,
      timestamp: r.timestamp,
    }));
  sendJson(res, 200, {
    items,
    total: items.length,
    limit,
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      status: "ok",
      service: "iot-ingestion-local",
      time: new Date().toISOString(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/readings") {
    handlePostReadings(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/readings/latest") {
    handleGetLatest(req, res, url);
    return;
  }

  problem(res, 404, "Not Found", "Endpoint không tồn tại");
});

server.listen(PORT, () => {
  console.log(`Local IoT service running at http://localhost:${PORT}`);
});
