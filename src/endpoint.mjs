import Koa from 'koa'
import Router from 'koa-router'
import logger from 'koa-logger'
import bodyParser from 'koa-bodyparser'
import socketify from 'koa-websocket'
import json from 'koa-json'

import getPort from 'get-port'
import websocket from 'websocket'
import knownPeers from './known-peers'

const W3CWebSocket = websocket.w3cwebsocket;

export class Endpoint {
  constructor() {
    this.app = new Koa()
    socketify(this.app)
    this.httpRouter = new Router()
    this.wsRouter = new Router()

    // Blockchain getter interface
    this.bci = {
      getBlocks: null,
      addTx: null
    }

    this.httpRouter
      .get('/blocks', async ctx => await this.getBlocks(ctx))
      .post('/tx', async ctx => await this.addTx(ctx))

    this.app
      .use(logger())
      .use(json())
      .use(bodyParser())
      .use(this.httpRouter.routes())

    this.app.ws
      .use(json())
      .use(async ctx => await this.socketHandler(ctx))
  }

  async start() {
    this.port = process.env.PORT
      || await getPort({port: [3000, 3001, 3002, 3003, 3004, 3005, 3006]})

    this.server = this.app.listen(this.port, () => {
      console.log('Server started on port %d', this.port)
      if (!process.env.MASTER)
        this.peerDiscovery()
    })
  }

  stop() {
    this.server.close(console.log('Shutting down server'))
  }

  peerDiscovery() {
    console.log('starting peer discovery...')
    this.masterNode = new W3CWebSocket('ws://' + knownPeers[0])

    this.masterNode.onerror = () => {
      console.log('unable to connect to masterNode ' + knownPeers[0])
    }
    this.masterNode.onopen = () => {
      console.log('connected to the masterNode');
    }
    this.masterNode.onclose = () => {
      console.log('disconnected from masterNode');
    }
    this.masterNode.onmessage = (evt) => {
      const msg = JSON.parse(evt.data)
      if (msg.type == 'block') {
        console.log('block verification:', msg.data)
        this.bci.checkBlock(msg.data)
        this.masterNode.send(JSON.stringify({ type: 'validation', data: true }))
      }
    }
  }

  async contactMasterNode(tx) {
    if (this.masterNode && this.masterNode.readyState == this.masterNode.OPEN)
      this.masterNode.send(JSON.stringify({ type: 'tx', data: tx }))
    else
      console.log('transfer to masterNode failed')
  }

  async broadcastBlock(block) {
    console.log(this.app.ws.server.clients.size, 'peers connected')
    const peers = Array.from(this.app.ws.server.clients)

    if (peers.length) {
      await Promise.all(peers.map(
        async peer => await peer.send(JSON.stringify({ type: 'block', data: block}))
      ))
    }

    this.voting = {
      start: Date.now(),
      peers: peers.length + 1,
      votes: []
    }

    return new Promise((res, rej) => {
      const checkVoting = () => {
        if (Date.now() - this.voting.start > 1000
          || this.voting.votes.length === this.voting.peers)
          return res(this.voting)
        setTimeout(checkVoting, 10);
      }
      checkVoting()
    })
  }

  // Routes handlers
  async getBlocks(ctx) {
    if (this.bci.getBlocks)
      ctx.body = await this.bci.getBlocks()
    else
    {
      ctx.status = 500
      ctx.body = { error: 'no blockchain connected' }
    }
  }

  async addTx(ctx) {
    if (this.bci.addTx) {
      // Check missing props
      const txProps = ['from', 'to', 'amount', 'msg']
      const missingProps = txProps.filter(prop => !(prop in ctx.request.body))
      if (missingProps.length > 0) {
        ctx.status = 400
        ctx.body = { error: `mandatory parameter${missingProps.length > 1 ? 's' : ''} '${missingProps}' is missing` }
      } else {

        const cleanedTx = txProps
          .reduce((tx, prop) => ({ ...tx, [prop]: ctx.request.body[prop] }), {})

        await this.bci.addTx(cleanedTx)
        ctx.status = 200
      }
    }
    else
    {
      ctx.status = 500
      ctx.body = { error: 'no blockchain connected' }
    }
  }

  async getPeers(ctx, next) {
    ctx.body = 'Hello World'
  }


  // Socket on connect
  async socketHandler(ctx, next) {
    ctx.websocket.id = ctx.req.headers['sec-websocket-key'].substr(0, 4)
    console.log('socket[%s] connection', ctx.websocket.id)

    // Socket on message
    ctx.websocket.on('message', async data => {
      console.log('peer[%s] %s', ctx.websocket.id, data)

      const msg = JSON.parse(data)
      if (msg.type && msg.data) {
        switch (msg.type) {
        case 'tx':
          this.bci.addTx(msg.data)
          break
        case 'validation':
          this.voting.votes.push(msg.data)
          break
        }
      }
    })
  }
}
