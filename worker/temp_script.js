const fs = require('fs');
const data = JSON.parse(fs.readFileSync('../composio_openapi.json', 'utf8'));
const connectedPaths = Object.keys(data.paths).filter((p) => p.includes('connected_accounts'));
console.log(connectedPaths);
