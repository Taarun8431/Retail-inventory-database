const { spawn } = require('child_process');
const path = require('path');

// Kill any existing Node processes
const killNode = spawn('taskkill', ['/F', '/IM', 'node.exe']);
killNode.on('close', () => {
  console.log('Killed existing Node processes');
  
  // Start the server with explicit port
  const server = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: '3000' }
  });

  server.stdout.on('data', (data) => {
    console.log(`Server output: ${data}`);
  });

  server.stderr.on('data', (data) => {
    console.error(`Server error: ${data}`);
  });

  server.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.kill();
    process.exit();
  });
}); 