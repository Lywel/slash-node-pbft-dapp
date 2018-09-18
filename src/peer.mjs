import EventEmitter from 'events'
import debug from 'debug'
import { Identity } from './identity'
import { Blockchain, Block, State } from './blockchain';
import knownPeers from './known-peers'

let log = debug('[ Peer ]')

export class Peer extends EventEmitter {
  constructor(network) {
    super()
    this.network = network
    this.id = new Identity()
    this.blockchain = new Blockchain()
    this.state = new State()
    this.i = 0

    this.pendingTxs = []


    this.peers = []
    this.prepareList = null
    this.commitList = null
    // sync
    this.network.on('request', (msg, sig) => {
      this.handleRequest(msg, sig)
    })
    this.network.on('pre-prepare', (payload, sig, msg) => {
      this.handlePrePrepare(payload, sig, msg)
    })
    this.network.on('prepare', (payload, sig) => {
      this.handlePrepare(payload, sig)
    })
    this.network.on('commit', (payload, sig) => {
      handleCommit(payload, sig)
    })

    this.network.on('pre-prepare-block', (block) => {
      this.handlePrePrepareBlock(block)
    })
    this.network.on('prepare-block', () => {
      this.handlePrepareBlock()
    })
    this.network.on('commit-block', () => {
      handleCommitBlock()
    })


    this.onTransaction = false
    this.message = null
    this.messageSig = null

    this.pendingBlock = null

  }

  handleRequest(msg, sig) {
    if (!Identity.verifySig(msg, sig, msg.client)) {
      log('ERROR: signature of client\'s request is incorrect')
      return
    }
    if (this.i !== this.state.view % this.state.nbNodes) {
      log('error : replica receiving request')
      // trigger change view
      return
    }
    if (this.onTransaction) {
      // a transaction is already being computed
      // implement queue ?
      return
    }
    this.message = msg
    this.messageSig = sig

    const payload = {
      view: this.state.view,
      seqNb: this.state.seqNb,
      digest: this.id.hash(msg)
    }
    this.prepareList = new Set()
    this.prepareList.add(this.peers[this.i])
    this.onTransaction = true
    this.emit('pre-prepare', payload, this.id.sign(payload), msg)
  }

  handlePrePrepare(payload, sig, msg) {
    if (!Identity.verifySig(payload, sig, peers[payload.i])) {
      log('ERROR: signature of payload is not correct in pre-prepare phase')
      return
    }
    if (!Identity.verifyHash(msg ,payload.digest)) {
      log('ERROR: checksum of msg is not correct in pre-prepare phase')
      return
    }
    if (payload.v !== this.state.v) {
      log('ERROR: state (v) does not correspond in pre-prepare phase')
      return
    }

    this.message = msg

    const payloadI = {
      ...payload,
      i: this.i
    }
    this.prepareList = new Set()
    this.prepareList.add(this.peers[this.i])
    this.onTransaction = true
    this.emit('prepare', payloadI, this.id.sign(payloadI))
  }


  handlePrepare(payload, sig) {

    if (!Identity.verifySig(payload, sig, peers[payload.i])) {
      log('ERROR: signature of payload is not correct in prepare phase')
      return
    }
    if (!Identity.verifyHash(this.message ,payload.digest)) {
      log('ERROR: checksum of msg is not correct in prepare phase')
      return
    }
    if (payload.view !== this.state.view) {
      log('ERROR: state (v) is not correct in prepare phase')
      return
    }
    if (payload.seqNb < this.state.h) {
      log('ERROR: problem in sequence number')
      return
    }

    this.prepareList.add(this.peers[payload.i])
    if (this.prepareList.size >= (2 / 3) * this.state.nbNodes) {
      this.commitList = new Set()
      this.commitList.add(this.peers[this.i])
      this.emit('commit', payload, this.id.sign(payload))
    }
  }

  handleCommit(payload, sig) {
    if (!Identity.verifySig(payload, sig, peers[payload.i])) {
      log('ERROR: signature of payload is not correct in prepare phase')
      return
    }
    if (!Identity.verifyHash(message ,payload.digest)) {
      log('ERROR: checksum of msg is not correct in commit phase')
      return
    }
    if (payload.view !== this.state.view) {
      log('ERROR: state (v) is not correct in commit phase')
      return
    }
    if (payload.seqNb < this.state.h) {
      log('ERROR: problem in sequence number')
      return
    }

    this.commitList.add(this.peers[payload.i])
    if (this.commitList.size > (1 / 3) * this.state.nbNodes) {

      this.replyToClient()
      this.state.h++
      this.onTransaction = false
      this.prepareList = null
      this.commitList = null
      this.message = null
      this.messageSig = null
    }
  }

  replyToClient() {
    let result = {
      view: this.view,
      timestamp: this.message.timestamp,
      client: this.message.client,
      i: this.i,
      valid: true
    }

    const tx = this.message.tx
    if (!this.state.accounts[tx.from]
      || this.state.accounts[tx.from] - tx.amount < 0) {
        result.valid = false
    } else {
      this.state.accounts[tx.to] = this.state.accounts[tx.to] || 0

      this.state.accounts[tx.from] -= tx.amount
      this.state.accounts[tx.to] += tx.amount
    }
    this.pendingTxs.push({
      request: this.message,
      sig: this.messageSig,
      valid: result.valid
    })
    this.emit('reply', result, this.id.sign(result))
  }


  buildNextBlock() {
    return new Block(
      this.blockchain.chain.length,
      this.pendingTxs,
      this.blockchain.lastBlock().hash,
      this.state
    )
  }

  checkBlock(blockToCheck) {
    const block = this.buildNextBlock()
    return block.hash === blockToCheck.hash
  }

  handlePrePrepareBlock(block) {
    this.pendingBlock = block
    this.prepareList = new Set()
    this.prepareList.add(payloadI.i)
    this.emit('prepare-block', payloadI, this.id.sign(payloadI))
  }

  signBlock(sign) {
    log('received signature from', sign.emitter.substr(0, 8))
    if (this.pendingBlock) {
      this.pendingBlock.signatures.push(sign.emitter)

      if (this.pendingBlock.signatures.length > this.pendingBlock.signAmount) {
        log('⛏️  block %d verified', this.pendingBlock.index)
        this.blockchain.chain.push(this.pendingBlock)
        this.pendingBlock = null
      }
    } else {
      log('but there is no pending blocks')
    }
  }

  mine() {
    this.pendingBlock = this.buildNextBlock()
    this.pendingTxs = []


    this.emit('pre-prepare-block', this.pendingBlock)

    setTimeout(() => {
      if (this.pendingBlock) {
        log('❌ block invalid\n', this.pendingBlock)
        this.pendingBlock = null
      }
    }, 1000)

    this.prepareList.push({emitter: this.id.publicKey.toString('hex')})
  }

  startMining() {
    this.minerPid = setInterval(() => this.mine(), 3000)
  }

  stopMining() {
    clearInterval(this.minerPid)
  }
}
