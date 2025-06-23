// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io')
const { Server } = require('socket.io')
require('dotenv').config()

const { ClearlightDevice } = require('../../node-gizwits/index')

const app = express()
const server = http.createServer(app)

// Parse ALLOWED_ORIGINS and handle dynamic patterns
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => {
    // Convert any localhost with wildcard port to regex
    if (origin === 'http://localhost:*') {
      return /^http:\/\/localhost:\d+$/;
    }
    // Convert any subdomain wildcard for spinrag.in
    if (origin === 'https://*.spinrag.in') {
      return /^https:\/\/([a-zA-Z0-9-]+\.)?spinrag\.in$/;
    }
    // Return as string for exact matches
    return origin;
  })


const io = new Server(server, {
	cors: {
		origin: allowedOrigins,
		methods: ['GET', 'POST']
	}
})

app.use(express.json())
app.use(express.static('public'))

// Async function to initialize the server
async function startServer() {
	const device = new ClearlightDevice(process.env.CLEARLIGHT_IP)
	let connected = false
	let deviceSettings = {}

	device.on('error', err => {
		console.log('Error: ' + err);
	});

	device.on('connected', async () => {
		console.log('Connected')
		await device.login()
		await device.retrieveData()
		connected = true
	})

	device.on('data', data => {
        // console.log('Data: ' + JSON.stringify(data));
        console.log('Data:');
        Object.entries(data).forEach(([key, value]) => {
            console.log(`  ${key}: ${value}`);
        });
		deviceSettings = data
    });

	async function handleControl(settings) {
		console.log('handleControl', settings)
		// socket.emit('attributes', settings);
		// Process each setting one at a time
		for (const [key, value] of Object.entries(settings)) {
			console.log(`Setting attribute: ${key} = ${value}`);
			if (key === 'SET_HOUR') console.log('set hour is broken')
			try {
				await device.setAttribute({ [key]: value });
				console.log(`Successfully set ${key}`);
			} catch (error) {
				console.error(`Failed to set ${key}:`, error);
				throw error; // Re-throw to handle in the calling function
			}
		}
	}

	// HTTP endpoints for device actions
	app.post('/device/start', (req, res) => {
		device.start();
		res.send({ status: 'Device started' });
	})

	app.post('/device/stop', (req, res) => {
		device.stop();
		res.send({ status: 'Device stopped' });
	});

	app.post('/device/reset', (req, res) => {
		device.reset();
		res.send({ status: 'Device resetting' });
	});

	app.post('/device/control', (req, res) => {
		const options = req.body;
		device.control(options);
		res.send({ status: 'Device controlled', settings: options });
	});

	// Socket.IO events for device actions
	io.on('connection', async (socket) => {
		console.log('Client connected', deviceSettings);

		// Send the initial device status and attributes to the client
		// if (device)
		// socket.emit('status', await device.retrieveData());
		socket.emit('attributes', deviceSettings);

		socket.on('connected', (data) => {
			console.log('Client connected', data);
		})

		// Update the client when the device status changes
		device.on('data', (status) => {
			deviceSettings = { ...deviceSettings, ...status }
			socket.emit('attributes', deviceSettings)
		});

		// Update the client when device attributes/settings change
		device.on('control', (settings) => {
			socket.emit('attributes', settings);
			(async () => {
				await device.setAttribute(settings)
			})().catch((error) => {
				console.error('Error setting attribute:', error);
			})
		});

		socket.on('start', () => {
			device.start();
		});

		socket.on('stop', () => {
			device.stop();
		});

		socket.on('reset', () => {
			device.reset();
		});

		socket.on('control', (options) => {
			console.log('Do Control', options)
			handleControl(options).catch((error) => {
				console.error('Error setting attribute:', error);
			});
		});

		socket.on('disconnect', () => {
			console.log('Client disconnected');
		});
	});

	console.time('Connect')
	await device.connect()
	console.timeEnd('Connect')

	const PORT = process.env.PORT || 3000;
	server.listen(PORT, () => {
		console.log(`Server listening on port ${PORT}`)
	});

}

// Start the server
startServer().catch((error) => {
	console.error('Error starting server:', error)
})
