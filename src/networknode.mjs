import Koa from 'koa'
import Router from 'koa-router'
import logger from 'koa-logger'
import bodyParser from 'koa-bodyparser'
import json from 'koa-json'
import socketify from 'koa-websocket'

import getPort from 'get-port'
import websocket from 'websocket'
import EventEmitter from 'events'

import knownPeers from './known-peers'
import { Block } from './blockchain'
import { Peer } from './peer'

import { randomBytes } from 'crypto'

const W3CWebSocket = websocket.w3cwebsocket;

export class NetworkNode extends EventEmitter {
  constructor() {
    super()
    this.id = randomBytes(16).toString('hex')
    // HTTP Server setup
    this.app = new Koa()
    socketify(this.app)

    this.app
      .use(logger())
      .use(json())
      .use(bodyParser())
      .use(this.httpRouter().routes())

    // Websocket p2p server setup
    this.app.ws
      .use(async ctx => await this.socketHandler(ctx))

    this.peers = []
    this.peer = new Peer()
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
      console.log('[NetworkNode] started on port %d', this.port)
      this.peerDiscovery()
      if (process.env.MASTER)
        this.peer.startMining()
    })
  }

  // Stop the node
  stop() {
    this.server.close(console.log('[NetworkNode] shutting down'))
  }

  // Setup the http endpoint
  httpRouter() {
    const router = new Router()

    router
      .get('/blocks', async ctx => {
        ctx.body = this.peer.blockchain.chain
      })
      .post('/tx', async ctx => {
        this.peer.registerTx(ctx.request.body)
        ctx.status = 200
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
          console.error(`[NetworkNode][${ws.id || ws.url}] invalid msg`)
        }
      }
      ws.onopen = () => {
        console.log(`[NetworkNode][${ws.id || ws.url}] connection opened`)
        ws.send(JSON.stringify({
          type: 'id',
          data: {
            id: this.id,
            chain: this.peer.blockchain.chain
          }
        }))
      }
      ws.onclose = () => {
        console.error(`[NetworkNode][${ws.id || ws.url}] connection closed`)
        delete this.peers[ws.id]
      }
    }

    knownPeers.forEach(createSocket)
  }

  handlePeerMsg(ws, msg) {
    console.log(`[NetworkNode][${ws.id || ws.url}] sent a '${msg.type}' msg`)

    switch (msg.type) {
    case 'block':
      // Receied block for validation
      this.peer.checkBlock(msg.data)
      this.broadcast({
        type: 'validation',
        data: true,
        id: msg.data.index
      })
      break

    case 'id':
      // Replace local chain with a new one
      console.log(`[NetworkNode] new peer regitered 0x${msg.data.id}`)
      ws.id = msg.data.id
      this.peers[msg.data.id] = ws
      this.peer.blockchain.replaceChain(msg.data.chain.map(Block.fromJSON))
      break

    case 'blockchain':
      // Compare chain and eventually replace it
      this.peer.blockchain.replaceChain(msg.data.map(Block.fromJSON))
      break

    // Master node
    case 'tx':
      this.peer.registerTx(msg.data)
      break
    case 'validation':
      this.peer.signBlock({ emitter: ws.id })
      break
    }
  }

  broadcast(data) {
    console.log(`[NetworkNode] broadcasting ${data.type} to ${Object.keys(this.peers).length } peers`)

    const bytes = JSON.stringify(data)

    // Broadcast as a client
    for (let [address, peer] of Object.entries(this.peers)) {
      if (peer.readyState == peer.OPEN) {
        peer.send(bytes)
      }
    }
  }

  // Socket on connect
  async socketHandler(ctx, next) {
    console.log('[NetworkNode][%s] connection')

    // On net client connection
    // Force sync the new chain
    // TODO: share peers
    ctx.websocket.send(JSON.stringify({
      type: 'id',
      data: {
        id: this.id,
        chain: this.peer.blockchain.chain
      }
    }))

    // On message
    ctx.websocket.on('message', data => {
      try {
        const msg = JSON.parse(data)
        this.handlePeerMsg(ctx.websocket, msg)
      } catch (err) {
        console.error(`[NetworkNode][${ctx.websocket.id}] invalid msg: ${err}`)
        console.log(data)
      }
    })

    ctx.websocket.on('close', () => {
      console.error(`[NetworkNode][${ctx.websocket.id}] connection closed`)
      delete this.peers[ctx.websocket.id]
    })
  }
}
