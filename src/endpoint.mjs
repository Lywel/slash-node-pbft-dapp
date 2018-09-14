import Koa from 'koa'
import Router from 'koa-router'
import logger from 'koa-logger'
import bodyParser from 'koa-bodyparser'
import socketify from 'koa-websocket'

class Endpoint {
  constructor() {
    this.port = process.env.PORT || 3000
    this.app = new Koa()
    socketify(this.app)
    this.httpRouter = new Router()
    this.wsRouter = new Router()

    this.httpRouter
      .all('/', this.helloworld)
      .get('/blocks', this.getBlocks)
      .get('/peers', this.getPeers)

    this.app
      .use(logger())
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
  async helloworld(ctx, next) {
    ctx.body = 'Hello World'
  }
  async getBlocks(ctx, next) {
    ctx.body = 
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
