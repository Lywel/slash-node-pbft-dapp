import Koa from 'koa'
import Router from 'koa-router'
import logger from 'koa-logger'
import bodyParser from 'koa-bodyparser'
import socketify from 'koa-websocket'
import json from 'koa-json'

class Endpoint {
  constructor() {
    this.port = process.env.PORT || 3000
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
      .use(logger())
      .use(this.socketHandler)
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log('Server started on port %d', this.port)
    })
  }

  stop() {
    this.server.close(console.log('Shutting down server'))
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
    console.dir(this, {depth: 1, color: true})
    if (this.bci.addTx) {
      // Check missing props
      const txProps = ['from', 'to', 'amount', 'msg']
      const missingProps = txProps.filter(prop => !(prop in ctx.req.body))
      if (missingProps.length > 0) {
        ctx.status = 400
        ctx.body = { error: `mandatory parameter '${prop}' is missing` }
      } else {

        const cleanedTx = txProps
          .reduce((tx, prop) => ({ ...tx, [prop]: ctx.req.body[prop] }), {})

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
    ctx.websocket.on('message', async msg => {
      console.log('socket[%s]: %s', ctx.websocket.id, msg)

      // broadcast the msg
      const clients = ctx.app.ws.server.clients
      clients.forEach(client => {
        client.send(`[ ${ctx.websocket.id} ]: ${msg}`)
      })
    })
  }
}

const ep = new Endpoint()
ep.start()
