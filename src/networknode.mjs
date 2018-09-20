import Koa from 'koa'
import Router from 'koa-router'
import logger from 'koa-logger'
import bodyParser from 'koa-bodyparser'
import json from 'koa-json'
import socketify from 'koa-websocket'
import cors from 'koa-cors'

import getPort from 'get-port'
import websocket from 'websocket'
import debug from 'debug'

import knownPeers from './known-peers'
import { Block } from './blockchain'
import { Peer } from './peer'

debug.formatters.h = v => v.toString('hex')

const W3CWebSocket = websocket.w3cwebsocket;

const log = debug('network-node')

export class NetworkNode {
  constructor() {
    // HTTP Server setup
    this.app = new Koa()
    socketify(this.app)

    this.app
      .use(logger())
      .use(json())
      .use(cors())
      .use(bodyParser())
      .use(this.httpRouter().routes())

    this.app.ws.use(this.socketHandler.bind(this))

    this.peers = []
    this.peer = new Peer(this)
    this.clients = []

    this.peerEventHandler = this.peerEventHandler.bind(this)
    this.peer.on('pre-prepare', this.peerEventHandler('pre-prepare'))
    this.peer.on('prepare', this.peerEventHandler('prepare'))
    this.peer.on('commit', this.peerEventHandler('commit'))
    this.peer.on('reply', data => {
      const { client } = data.result
      if (this.clients[client]) {
        log('replying %b client %s', data.result.valid, client)
        this.clients[clients].send(JSON.stringify({
          type: 'reply',
          data: data
        }))
        delete this.clients[client]
      } else
        log('client %s is not reachable', client)
    })
  }

  peerEventHandler(type) {
    return (data) => {
      log(type)
      this.broadcast({ type, data })
    }
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
    const createSocket = (address) => {
      // Dont connect to yourself
      if (address === `localhost:${this.port}`)
        return

      let ws = new W3CWebSocket(`ws://${address}`)

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          this.handlePeerMsg(ws, msg)
        } catch (err) {
          if (ws.log)
            ws.log('Error: ' + err.message + '\n%O', evt.data)
          else
            log('Error: ' + err.message + '\n%O', evt.data)
        }
      }

      ws.onopen = () => {
        log('new websocket connection on \'%s\'', ws.url)
        ws.send(JSON.stringify({
          type: 'join',
          data: { key: this.peer.id.publicKey }
        }))
      }

      ws.onclose = () => {
        log('closing connection')
        delete this.peers[ws.id]
      }
    }

    knownPeers.forEach(createSocket)
  }

  handlePeerMsg(ws, req) {
    if (ws.log)
      ws.log('sends a \'%s\'', req.type)
    else
      log(req.type)

    switch (req.type) {
    case 'join':
      const { key } = req.data
      const currentState = this.peer.newPeer(key)

      ws.id = key
      ws.log = log.extend(ws.id.substr(0, 8))
      this.peers[req.data.id] = ws
      ws.log('Has joined the network')

      return ws.send(JSON.stringify({
        type: 'state',
        data: currentState
      }))

    case 'state':
      return this.peer.syncState(req.data)
    case 'request':
      const { id } = req
      this.clients[id] = ws
      return this.peer.handleRequest(req.data)
    case 'pre-prepare':
      return this.peer.handlePrePrepare(req.data)
    case 'prepare':
      return this.peer.handlePrepare(req.data)
    case 'commit':
      return this.peer.handleCommit(req.data)
    default:
      throw new Error(`Unhandled request type '${req.type}'`)
    }
  }

  broadcast(data) {
    log(`broadcasting ${data.type} to ${Object.keys(this.peers).length } peers`)

    const bytes = JSON.stringify(data)

    for (let [address, peer] of Object.entries(this.peers)) {
      if (peer.readyState == peer.OPEN) {
        peer.send(bytes)
      }
    }
  }

  // Socket on connect
  async socketHandler(ctx, next) {
    log('new websocket connection')

    // On message
    ctx.websocket.on('message', data => {
      try {
        const msg = JSON.parse(data)
        this.handlePeerMsg(ctx.websocket, msg)
      } catch (err) {
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
      delete this.peers[ctx.websocket.id]
    })
  }
}
