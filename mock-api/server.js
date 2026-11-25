// Zero-dependency mock API.
//   GET  /health
//   GET  /forms                      -> [{id,title}]
//   GET  /forms/:id                  -> schema JSON
//   POST /forms/:id/submissions      -> 201 {id,receivedAt} | 422 {message,errors:[{field,message}]}
// Field paths for repeating groups use brackets: members[1].name
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 4000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function loadSchema(id) {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
}

function listSchemas() {
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')))
    .map((s) => ({ id: s.id, title: s.title }));
}

// Server-side business rules the client cannot know about.
// These are what produce deterministic 422s for demos and tests.
const rules = {
  household(d, err) {
    if (typeof d.mobile === 'string' && d.mobile.endsWith('0000000')) {
      err('mobile', 'This mobile number is already registered.');
    }
    const seen = new Map();
    (d.members || []).forEach((m, i) => {
      const key = String(m?.name || '').trim().toLowerCase();
      if (!key) return;
      if (seen.has(key)) err(`members[${i}].name`, 'Duplicate member name in this household.');
      seen.set(key, i);
    });
  },
  'vaccination-visit'(d, err) {
    if (d.batchNumber === 'B-0000') err('batchNumber', 'This batch has been recalled.');
    if (d.patientName === 'Duplicate Patient') {
      err('visitDate', 'A visit for this patient is already recorded on this date.');
    }
    (d.reactions || []).forEach((r, i) => {
      if (r?.severity === 'severe' && r?.symptom === 'rash') {
        err(`reactions[${i}].severity`, 'Severe rash must be reported through the emergency channel.');
      }
    });
  },
  complaint(d, err) {
    if (typeof d.contactEmail === 'string' && d.contactEmail.endsWith('@blocked.test')) {
      err('contactEmail', 'This email domain is not accepted.');
    }
    if (typeof d.description === 'string' && /spam/i.test(d.description)) {
      err('description', 'Description was flagged as spam.');
    }
  },
};

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) reject(new Error('too large'));
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'OPTIONS') return send(res, 204);
  if (url.pathname === '/health') return send(res, 200, { ok: true });

  if (req.method === 'GET' && parts.length === 1 && parts[0] === 'forms') {
    return send(res, 200, listSchemas());
  }

  if (req.method === 'GET' && parts.length === 2 && parts[0] === 'forms') {
    const schema = loadSchema(parts[1]);
    return schema ? send(res, 200, schema) : send(res, 404, { message: 'Form not found' });
  }

  if (req.method === 'POST' && parts.length === 3 && parts[0] === 'forms' && parts[2] === 'submissions') {
    const id = parts[1];
    if (!loadSchema(id)) return send(res, 404, { message: 'Form not found' });
    let data;
    try {
      data = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { message: 'Body must be valid JSON' });
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return send(res, 400, { message: 'Body must be a JSON object' });
    }
    const errors = [];
    const err = (field, message) => errors.push({ field, message });
    rules[id]?.(data, err);
    if (errors.length) return send(res, 422, { message: 'Validation failed', errors });
    return send(res, 201, { id: crypto.randomUUID(), receivedAt: new Date().toISOString() });
  }

  return send(res, 404, { message: 'Not found' });
});

server.listen(PORT, () => console.log(`mock-api listening on :${PORT}, data=${DATA_DIR}`));
