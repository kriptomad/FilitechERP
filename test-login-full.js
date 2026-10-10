const http = require('http');

const postData = JSON.stringify({
  email: 'demo@filitech.dev',
  password: 'Demo@123'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(JSON.stringify({ email: 'demo@filitech.dev', password: 'Demo@123' }))
  }
};

const req = http.request((res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
  let data = '';
  res.on('data', (chunk) => { console.log('Chunk:', chunk.toString()); });
  res.on('end', () => console.log('End'));
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(JSON.stringify({ email: 'demo@filitech.dev', password: 'Demo@123' }));
req.end();