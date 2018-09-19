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

    // Websocket p2p server setup
    this.app.ws
      .use(async ctx => await this.socketHandler(ctx))

    this.peers = []
    this.peer = new Peer(this)

    this.peer.on('pre-prepare', (payload, sig, msg) => {
      log('pre-prepare')
      this.broadcast({
        type: 'pre-prepare',
        data: { payload, sig, msg }
      })
    })

    this.peer.on('master-msg', msg => {
      this.sendMaster(msg)
    })

    this.peer.on('block', (block, setRequiredSignatures) => {
      // Compute required signature numer
      const networkSize = Object.keys(this.peers).length
      const signNb = 2 / 3 * (networkSize + 1)

      setRequiredSignatures(signNb)

      this.broadcast({
        type: 'blockchain',
        data: this.peer.blockchain.chain
      })

      this.broadcast({
        type: 'block',
        data: block
      })
    })
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
          log(`[${ws.id || ws.url}] invalid msg`)
        }
      }
      ws.onopen = () => {
        log(`[${ws.id || ws.url}] connection opened`)
        ws.send(JSON.stringify({
          type: 'id',
          data: {
            id: this.peer.id.publicKey.toString('hex'),
            master: !!process.env.MASTER,
            chain: this.peer.blockchain.chain
          }
        }))
      }
      ws.onclose = () => {
        log(`[${ws.id || ws.url}] connection closed`)
        delete this.peers[ws.id]
      }
    }

    knownPeers.forEach(createSocket)
  }

  handlePeerMsg(ws, req) {
    if (ws.log)
      ws.log('sent a %s req', req.type)
    else
      log(`[${ws.id || ws.url}] sent a '${req.type}' req`)

    switch (req.type) {
    case 'block':
      // Receied block for validation
      this.peer.checkBlock(req.data)
      return this.broadcast({
        type: 'validation',
        data: true,
        id: req.data.index
      })
    case 'id':
      // Replace local chain with a new one
      ws.id = req.data.id
      ws.isMaster = req.data.master
      ws.log = log.extend(ws.id.substr(0, 8))
      this.peers[req.data.id] = ws

      ws.log(`registered`)
      if (ws.isMaster)
        ws.log(`is masterNode`)
      return this.peer.blockchain.replaceChain(req.data.chain.map(Block.fromJSON))
    case 'blockchain':
      return this.peer.blockchain.replaceChain(req.data.map(Block.fromJSON))
    case 'req':
      const { msg, sig } = req.data
      try {
        this.peer.handleRequest(msg, sig)
      } catch (err) {
        log('Error: ' + err.message)
      }
      break
    case 'validation':
      return this.peer.signBlock({ emitter: ws.id })
    case 'pre-prepare':
      return this.peer
        .handlePrePrepare(req.data.payload, req.data.sig, req.data.req)
    case 'prepare':
      return this.peer
        .handlePrepare(req.data.payload, req.data.sig)
    default:
      throw new Error(`Unhandled request type '${req.type}'`)
    }
  }

  broadcast(data) {
    log(`broadcasting ${data.type} to ${Object.keys(this.peers).length } peers`)

    const bytes = JSON.stringify(data)

    // Broadcast as a client
    for (let [address, peer] of Object.entries(this.peers)) {
      if (peer.readyState == peer.OPEN) {
        peer.send(bytes)
      }
    }
  }

  sendMaster(data) {
    // find the masterNode
    const masterNode = Object.entries(this.peers)
      .filter(([id, peer]) => peer.isMaster)
      .map(([id, peer]) => peer)[0]

    if (masterNode) {
      log(`sending ${data.type} to master`)
      masterNode.send(JSON.stringify(data))
    }
    else
      log(`sending ${data.type} failed: masterNode unreachable`)
  }

  // Socket on connect
  async socketHandler(ctx, next) {
    log('socket connection')

    // On net client connection
    // Force sync the new chain
    // TODO: share peers
    ctx.websocket.send(JSON.stringify({
      type: 'id',
      data: {
        id: this.peer.id.publicKey.toString('hex'),
        master: !!process.env.MASTER,
        chain: this.peer.blockchain.chain
      }
    }))

    // On message
    ctx.websocket.on('message', data => {
      try {
        const msg = JSON.parse(data)
        this.handlePeerMsg(ctx.websocket, msg)
      } catch (err) {
        if (ctx.websocket.log)
          ctx.websocket.log('Error: ' + err.message)
        else
          log(`[${ctx.websocket.id || ctx.websocket.url}] Error: ${err.message}`)
        console.log(data)
      }
    })

    ctx.websocket.on('close', () => {
      log(`[${ctx.websocket.id}] connection closed`)
      delete this.peers[ctx.websocket.id]
    })
  }
}
