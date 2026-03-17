const { describe, it, before, after, beforeEach } = require('mocha')
const { expect } = require('chai')
const http = require('http')
const { Server } = require('socket.io')
const { io: ioClient } = require('socket.io-client')
const EventEmitter = require('events')
const { validateControlPayload } = require('../validation')

const TOKEN = 'test-socket-token'

// Minimal mock of ClearlightDevice — just an EventEmitter with setAttribute
function createMockDevice() {
	const device = new EventEmitter()
	device.setMaxListeners(20)
	device.setAttributeCalls = []
	device.setAttribute = async (attrs) => {
		device.setAttributeCalls.push(attrs)
	}
	return device
}

function createSocketServer() {
	const server = http.createServer()
	const io = new Server(server, { cors: { origin: '*' } })
	const device = createMockDevice()
	let connected = true
	let deviceSettings = { CURRENT_TEMP: 70, SET_TEMP: 120, power_flag: false }
	let commandInFlight = false

	io.use((socket, next) => {
		const token = socket.handshake.auth?.token
		if (token !== TOKEN) return next(new Error('Invalid token'))
		next()
	})

	async function handleControl(settings) {
		if (commandInFlight) {
			return { dropped: true }
		}
		commandInFlight = true
		try {
			for (const [key, value] of Object.entries(settings)) {
				await device.setAttribute({ [key]: value })
			}
		} finally {
			commandInFlight = false
		}
		return { dropped: false }
	}

	io.on('connection', (socket) => {
		socket.emit('deviceStatus', { connected })
		socket.emit('attributes', deviceSettings)

		socket.on('requestStatus', () => {
			socket.emit('deviceStatus', { connected })
			socket.emit('attributes', deviceSettings)
		})

		const dataListener = (status) => {
			deviceSettings = { ...deviceSettings, ...status }
			socket.emit('attributes', deviceSettings)
		}
		device.on('data', dataListener)

		socket.on('control', async (options, ack) => {
			if (!connected) return socket.emit('error', { error: 'Device not connected' })
			const { valid, errors, payload } = validateControlPayload(options)
			if (!valid) {
				socket.emit('error', { error: 'Invalid control payload', details: errors })
				return
			}
			const result = await handleControl(payload)
			if (result.dropped) {
				socket.emit('error', { error: 'Device busy, try again' })
			} else if (typeof ack === 'function') {
				ack({ status: 'ok', settings: payload })
			}
		})

		socket.on('disconnect', () => {
			device.removeListener('data', dataListener)
		})
	})

	return {
		server, io, device,
		setConnected: (val) => { connected = val },
		setCommandInFlight: (val) => { commandInFlight = val },
	}
}

function connectClient(port) {
	return ioClient(`http://127.0.0.1:${port}`, {
		auth: { token: TOKEN },
		transports: ['websocket'],
		autoConnect: false,
	})
}

describe('Socket.IO handlers', () => {
	let testServer, ctx, port

	before((done) => {
		ctx = createSocketServer()
		testServer = ctx.server
		testServer.listen(0, () => {
			port = testServer.address().port
			done()
		})
	})

	after((done) => {
		ctx.io.close()
		testServer.close(done)
	})

	beforeEach(() => {
		ctx.setConnected(true)
		ctx.setCommandInFlight(false)
		ctx.device.setAttributeCalls = []
	})

	describe('connection', () => {
		it('sends deviceStatus and attributes on connect', (done) => {
			const client = connectClient(port)
			const received = {}

			client.on('deviceStatus', (data) => { received.deviceStatus = data })
			client.on('attributes', (data) => {
				received.attributes = data
				expect(received.deviceStatus).to.deep.equal({ connected: true })
				expect(received.attributes.CURRENT_TEMP).to.equal(70)
				client.disconnect()
				done()
			})

			client.connect()
		})
	})

	describe('requestStatus', () => {
		it('re-sends deviceStatus and attributes', (done) => {
			const client = connectClient(port)
			let statusCount = 0

			client.on('attributes', () => {
				statusCount++
				// First is from initial connect, wait for second from requestStatus
				if (statusCount === 1) {
					client.emit('requestStatus')
				}
				if (statusCount === 2) {
					client.disconnect()
					done()
				}
			})

			client.connect()
		})
	})

	describe('control', () => {
		it('accepts valid control and calls setAttribute', (done) => {
			const client = connectClient(port)

			client.on('connect', () => {
				client.emit('control', { SET_TEMP: 150 }, (ack) => {
					expect(ack.status).to.equal('ok')
					expect(ack.settings).to.deep.equal({ SET_TEMP: 150 })
					expect(ctx.device.setAttributeCalls).to.deep.include({ SET_TEMP: 150 })
					client.disconnect()
					done()
				})
			})

			client.connect()
		})

		it('rejects invalid control payload', (done) => {
			const client = connectClient(port)

			client.on('connect', () => {
				client.emit('control', { FAKE_KEY: 999 })
			})

			client.on('error', (err) => {
				expect(err.error).to.equal('Invalid control payload')
				client.disconnect()
				done()
			})

			client.connect()
		})

		it('rejects control when device is disconnected', (done) => {
			const client = connectClient(port)
			ctx.setConnected(false)

			client.on('connect', () => {
				client.emit('control', { SET_TEMP: 100 })
			})

			client.on('error', (err) => {
				expect(err.error).to.equal('Device not connected')
				client.disconnect()
				done()
			})

			client.connect()
		})

		it('emits error when command is in-flight', (done) => {
			const client = connectClient(port)
			ctx.setCommandInFlight(true)

			client.on('connect', () => {
				client.emit('control', { SET_TEMP: 100 })
			})

			client.on('error', (err) => {
				expect(err.error).to.equal('Device busy, try again')
				client.disconnect()
				done()
			})

			client.connect()
		})
	})

	describe('device data broadcast', () => {
		it('forwards device data events to connected client', (done) => {
			const client = connectClient(port)
			let attrCount = 0

			client.on('attributes', (data) => {
				attrCount++
				// First is initial connect, second is from device emit
				if (attrCount === 2) {
					expect(data.CURRENT_TEMP).to.equal(155)
					client.disconnect()
					done()
				}
			})

			client.on('connect', () => {
				ctx.device.emit('data', { CURRENT_TEMP: 155 })
			})

			client.connect()
		})
	})

	describe('disconnect cleanup', () => {
		it('removes device data listener on disconnect', (done) => {
			const client = connectClient(port)
			const listenersBefore = ctx.device.listenerCount('data')

			client.on('connect', () => {
				const listenersAfter = ctx.device.listenerCount('data')
				expect(listenersAfter).to.equal(listenersBefore + 1)
				client.disconnect()
			})

			client.on('disconnect', () => {
				// Give the server a moment to process the disconnect
				setTimeout(() => {
					expect(ctx.device.listenerCount('data')).to.equal(listenersBefore)
					done()
				}, 50)
			})

			client.connect()
		})
	})
})
