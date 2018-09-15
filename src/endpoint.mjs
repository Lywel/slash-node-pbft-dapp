import Koa from 'koa'
import Router from 'koa-router'
import logger from 'koa-logger'
import bodyParser from 'koa-bodyparser'
import socketify from 'koa-websocket'
import json from 'koa-json'

import getPort from 'get-port'
import websocket from 'websocket'
import EventEmitter from 'events'

import knownPeers from './known-peers'
import { Block } from './blockchain'
import { Peer } from './peer'

const W3CWebSocket = websocket.w3cwebsocket;

export class NetworkNode extends EventEmitter {
  constructor() {
    super()
    // Server setup
    this.app = new Koa()
    socketify(this.app)

    this.app
      .use(logger())
      .use(json())
      .use(bodyParser())
      .use(this.httpRouter().routes())

    this.app.ws
      .use(json())
      .use(async ctx => await this.socketHandler(ctx))

    this.peer = new Peer()
    this.peer.on('block', (block, setRequiredSignatures) => {
      let signNb = 2 / 3 * ((this.app.ws.server.clients.size || 0) + 1)
      setRequiredSignatures(signNb)
      this.broadcastBlock(block)
    })
  }

  // Start the node
  async start() {
    this.port = process.env.PORT
      || await getPort({port: [3000, 3001, 3002, 3003, 3004, 3005, 3006]})

    this.server = this.app.listen(this.port, () => {
      console.log('[NetworkNode] started on port %d', this.port)
      if (!process.env.MASTER) {
        this.peerDiscovery()
      } else {
        this.peer.startMining()
      }
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
    this.masterNode = new W3CWebSocket('ws://' + knownPeers[0])

    this.masterNode.onmessage = (evt) => {
      const msg = JSON.parse(evt.data)
      if (msg.type == 'block') {
        // Receied block for validation
        this.peer.checkBlock(msg.data)
        this.masterNode.send(JSON.stringify({ type: 'validation', data: true }))
      } else if (msg.type == 'newchain') {
        // Replace local chain with a new one
        console.log('[NetworkNode] blockchain synced', msg.data)
        this.peer.blockchain.chain = msg.data.map(b => {
          let nb = new Block(b.index, b.data, b.prevHash, b.timestamp)
          nb.hash = b.hash
          return nb
        })
      } else if (msg.type == 'blockchain') {
        // Compare chain and eventually replace it
        console.log('[NetworkNode] blockchain replace')
        this.peer.blockchain.replaceChain(msg.data.map(b => {
          let nb = new Block(b.index, b.data, b.prevHash, b.timestamp)
          nb.hash = b.hash
          return nb
        }))
      }
    }
  }

  async contactMasterNode(tx) {
    if (this.masterNode && this.masterNode.readyState == this.masterNode.OPEN)
      this.masterNode.send(JSON.stringify({ type: 'tx', data: tx }))
    else
      console.log('[NetworkNode] transfer to masterNode failed')
  }

  async broadcastBlock(block) {
    console.log(`[NetworkNode] broadcasting block to ${this.app.ws.server.clients.size} peers`)

    const peers = Array.from(this.app.ws.server.clients)

    // Share the current blockchain
    if (peers.length) {
      await Promise.all(peers.map(async peer => {
        peer.send(JSON.stringify({
          type: 'blockchain',
          data: this.peer.blockchain.chain
        }))
      }))
    }

    // Share the new block
    if (peers.length) {
      await Promise.all(peers.map(
        async peer => await peer.send(JSON.stringify({ type: 'block', data: block}))
      ))
    }
  }

  // Socket on connect
  async socketHandler(ctx, next) {
    ctx.websocket.id = ctx.req.headers['sec-websocket-key'].substr(0, 4)
    console.log('[NetworkNode][%s] connection', ctx.websocket.id)

    // Force sync the new chain
    ctx.websocket.send(JSON.stringify({
      type: 'newchain',
      data: this.peer.blockchain.chain
    }))

    // On message
    ctx.websocket.on('message', async data => {
      const msg = JSON.parse(data)

      if (msg.type && msg.data) {
        console.log('[NetworkNode][%s] sends ', ctx.websocket.id, msg.type)

        switch (msg.type) {
        case 'tx':
          this.peer.registerTx(msg.data)
          break
        case 'validation':
          this.peer.signBlock({ emitter: ctx.websocket.id })
          break
        }
      }
    })
  }
}
