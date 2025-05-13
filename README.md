# ezPM2GUI

A modern web-based graphical user interface for the PM2 process manager, built with TypeScript and Material UI.

![ezPM2GUI Screenshot](https://via.placeholder.com/800x450.png?text=ezPM2GUI+Screenshot)

## Features

- Real-time process monitoring
- Process management (start, stop, restart, delete)
- Detailed process information and logs
- System metrics dashboard
- WebSocket for live updates
- Process CPU and memory charts
- Filter processes by status or name
- Modern UI with Material UI components
- Fully typed with TypeScript
- Responsive design for desktop and mobile

## Installation

### Global Installation

```bash
npm install -g ezpm2gui
```

### Local Installation

```bash
npm install ezpm2gui
```

## Usage

### As a Command Line Tool (Global Installation)

```bash
# Start the ezPM2GUI web interface
ezpm2gui

# Generate a sample PM2 ecosystem config
ezpm2gui-generate-ecosystem
```

### As a Module (Local Installation)

```javascript
const ezpm2gui = require('ezpm2gui');

// Start the server with default options
ezpm2gui.start();

// Or with custom options
ezpm2gui.start({
  port: 3030,
  host: '0.0.0.0'
});
```

### Access the UI

Once started, open your browser and navigate to:

```
http://localhost:3001
```

## Requirements

- Node.js 16.x or later
- PM2 installed globally (`npm install -g pm2`)

## Configuration

ezPM2GUI uses environment variables for configuration:

- `PORT`: The port to run the server on (default: 3001)
- `HOST`: The host to bind to (default: localhost)

## Load Balancing with PM2

ezPM2GUI provides an easy interface to manage PM2's load balancing capabilities:

### Setting Up Load Balancing

1. **Deploy a new application or modify an existing one**: 
   - Set the number of instances to greater than 1 (or 0/-1 for max instances based on CPU cores)
   - Choose "Cluster" as the execution mode for optimal load balancing

2. **Manage your cluster**:
   - Use the Cluster Management section to scale instances up or down
   - Switch between fork and cluster execution modes
   - Reload all instances with zero downtime

### How Load Balancing Works

PM2 provides built-in load balancing when you run your Node.js applications in cluster mode with multiple instances:

- **Cluster Mode**: In this mode, PM2 uses Node.js's cluster module to create multiple worker processes that share the same server port
- **Multiple Instances**: Incoming requests are automatically distributed across your instances
- **Zero Downtime Reloads**: When updating your application, PM2 can reload instances one by one to avoid downtime

### Best Practices

- For CPU-intensive applications, use a number of instances equal to the number of CPU cores
- For I/O-intensive applications, you can use more instances than CPU cores
- Always use cluster mode for load balancing to ensure port sharing between instances
- Use the reload feature instead of restart for zero-downtime deployments

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed development instructions.

```bash
# Clone the repository
git clone https://github.com/yourusername/ezpm2gui.git
cd ezpm2gui

# Install dependencies and build
./install.sh   # On Linux/macOS
install.bat    # On Windows

# Start the application
npm start
```

## License

ISC

## Credits

Built with ❤️ as a modern alternative to pm2-gui
