import Koa from 'koa'
import Router from 'koa-router'
import logger from 'koa-logger'
import socketify from 'koa-websocket'
import cors from 'koa-cors'

import getPort from 'get-port'
import websocket from 'websocket'
import debug from 'debug'

import knownPeers from './known-peers'
import { Block } from './blockchain'
import { Peer } from './peer'

const W3CWebSocket = websocket.w3cwebsocket;

const log = debug('network-node')

export class NetworkNode {
  constructor() {
    // HTTP Server setup
    this.app = new Koa()
    socketify(this.app)

    this.app
      .use(logger())
      .use(cors())
      .use(this.httpRouter().routes())

    this.app.ws.use(this.socketHandler.bind(this))

    this.peers = []
    this.peer = new Peer(this)
    this.clients = []

    this.peerEventHandler = this.peerEventHandler.bind(this)
    this.peer.on('pre-prepare', this.peerEventHandler('pre-prepare'))
    this.peer.on('prepare', this.peerEventHandler('prepare'))
    this.peer.on('commit', this.peerEventHandler('commit'))
    this.peer.on('synchronized', this.peerEventHandler('synchronized'))
    this.peer.on('reply', data => {
      const { client } = data.result
      if (this.clients[client]) {
        log('replying %o client %s', data.result.valid, client)
        this.clients[client].send(JSON.stringify({
          type: 'reply',
          data: data
        }))
        delete this.clients[client]
      } else
        log('client %s is not reachable', client)
    })
  }

  peerEventHandler(type) {
    return (data) => this.broadcast({ type, data })
  }

  // Start the node
  async start() {
    this.port = process.env.PORT
      || await getPort({port: [3000, 3001, 3002, 3003, 3004, 3005, 3006]})

    this.server = this.app.listen(this.port, () => {
      log('started on port %d', this.port)
      this.peerDiscovery()
    })
  }

  // Stop the node
  stop() {
    this.server.close(log('shutting down'))
  }

  // Setup the http endpoint
  httpRouter() {
    const router = new Router()
    router
      .get('/blocks', async ctx => {
        ctx.body = this.peer.blockchain.chain
      })
    return router
  }

  // Find the other nodes of the network
  peerDiscovery() {
    this.sentJoin = 0

    const createSocket = (address) => {
      console.log(address)
      // Dont connect to yourself
      if (address === `localhost:${this.port}`)
        return

      let ws = new W3CWebSocket(`ws://${address}`)

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          this.handlePeerMsg(ws, msg)
        } catch (err) {
          console.log(err)
          if (ws.log)
            ws.log('Error: ' + err.message + '\n%O', evt.data)
          else
            log('Error: ' + err.message + '\n%O', evt.data)
        }
      }

      ws.onopen = () => {
        log('new websocket connection on \'%s\'', ws.url)
        this.sentJoin++
        ws.send(JSON.stringify({
          type: 'join',
          data: { key: this.peer.id.publicKey }
        }))
      }

      ws.onclose = () => {
        log('closing connection')
        if (this.peers[ws.id])
          this.peer.handlePeerDisconnect(ws.id)
        delete this.peers[ws.id]
      }
    }

    knownPeers.forEach(createSocket)
    process.argv
      .filter(arg => arg.startsWith('--peer='))
      .map(arg => arg.substr(7))
      .forEach(createSocket)
  }

  registerPeer(ws, key) {
    ws.id = key
    ws.log = log.extend(key.substr(0, 8))
    this.peers[key] = ws
    ws.log('Successfully registered')
  }

  handlePeerMsg(ws, req) {
    if (ws.log)
      ws.log('sends a \'%s\'', req.type)
    else
      log(req.type)

    switch (req.type) {
    case 'join':
    {
      this.registerPeer(ws, req.data.key)
      const state = this.peer.newPeer(req.data.key)

      log('Sending my state to %O', req.data)
      return ws.send(JSON.stringify({
        type: 'state',
        data: {
          ...state,
          key: this.peer.id.publicKey
        }
      }))
    }
    case 'observe':
      this.clients[req.data.msg.client] = ws
      this.clients[req.data.msg.client].observer = true
      break
    case 'state':
    {
      this.registerPeer(ws, req.data.key)
      ws.log('sent it\'s state (1/%d)', this.sentJoin)

      return this.peer.syncState(
        req.data,
        this.sentJoin
      )
    }
    case 'request':
    {
      this.clients[req.data.msg.client] = ws
      return this.peer.handleRequest(req.data)
    }
    case 'synchronized':
      return this.peer.handleSynchronized()
    case 'pre-prepare':
      return this.peer.handlePrePrepare(req.data)
    case 'prepare':
      return this.peer.handlePrepare(req.data)
    case 'commit':
      return this.peer.handleCommit(req.data)
    case 'info':
      // Peers dont care about infos
      break
    default:
      throw new Error(`Unhandled request type '${req.type}'`)
    }
  }

  broadcast(data) {
    log(`Broadcasting ${data.type} to ${Object.keys(this.peers).length } peers`)
    log('Broadcasting to: \n%O', Object.keys(this.peers))

    const bytes = JSON.stringify(data)

    for (let [address, peer] of Object.entries(this.peers)) {
      if (peer.readyState == peer.OPEN) {
        peer.send(bytes)
      }
    }

    for (let [address, peer] of Object.entries(this.clients)) {
      if (peer.readyState == peer.OPEN && peer.observer) {
        peer.send(bytes)
      }
    }
  }

  // Socket on connect
  async socketHandler(ctx, next) {
    ctx.websocket.send(JSON.stringify({
      type: 'info',
      data: {
        state: this.peer.state,
        key: this.peer.id.publicKey
      }
    }))
    // On message
    ctx.websocket.on('message', data => {
      try {
        const msg = JSON.parse(data)
        this.handlePeerMsg(ctx.websocket, msg)
      } catch (err) {
        console.log(err)
        if (ctx.websocket.log)
          ctx.websocket.log('Error: ' + err.message + '\n%O', data)
        else
          log('Error: ' + err.message + '\n%O', data)
      }
    })

    ctx.websocket.on('close', () => {
      if (ctx.websocket.log)
        ctx.websocket.log('closing connection')
      else
        log('closing connection')
      if (this.peers[ctx.websocket.id]) {
        this.peer.handlePeerDisconnect(ctx.websocket.id)
        delete this.peers[ctx.websocket.id]
      }
    })
  }
}
