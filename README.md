# ezPM2GUI

A modern web-based graphical user interface for the PM2 process manager.

![ezPM2GUI Screenshot](https://via.placeholder.com/800x450.png?text=ezPM2GUI+Screenshot)

## Features

- Real-time process monitoring
- Process management (start, stop, restart, delete)
- Detailed process information and logs
- System metrics dashboard
- WebSocket for live updates
- Process CPU and memory charts
- Filter processes by status or name
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

- Node.js 14.x or later
- PM2 installed globally (`npm install -g pm2`)

## Configuration

ezPM2GUI uses environment variables for configuration:

- `PORT`: The port to run the server on (default: 3001)
- `HOST`: The host to bind to (default: localhost)

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
