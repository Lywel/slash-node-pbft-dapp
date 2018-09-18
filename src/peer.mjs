import EventEmitter from 'events'
import debug from 'debug'
import { Identity } from './identity'
import { Blockchain, Block, State } from './blockchain';
import knownPeers from './known-peers'

/**
 * formats:
 *
 * Message from client:
 * arg1: msg { tx: { from, to, amount }, timestamp, client }
 * arg2: sig
 *
 * Reply to client:
 * { view, timestamp, client, i, valid }
 */

let log = debug('peer')

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

    this.onTransaction = false
    this.message = null
    this.messageSig = null

    this.pendingBlock = null
    this.pendingBlockSig = null

  }

  async handleRequest(msg, sig) {
    log('request')
    if (!Identity.verifySig(msg, sig, msg.client))
      throw new Error('Wrong signature on client\'s request')

    if (this.i !== this.state.view % this.state.nbNodes)
      throw new Error('Cannot handle request: not masterNode')
      // TODO: trigger change view

    if (this.onTransaction)
      throw new Error('Network is busy and cant accept new transactions')
    // TODO: implement queue

    this.message = msg
    this.messageSig = sig

    const payload = {
      view: this.state.view,
      seqNb: this.state.seqNb,
      digest: Identity.hash(msg)
    }

    this.prepareList = new Set()
    this.prepareList.add(this.peers[this.i])

    this.onTransaction = true
    this.emit('pre-prepare', payload, this.id.sign(payload), msg)
  }

  async handlePrePrepare(payload, sig, msg) {
    if (!Identity.verifySig(payload, sig,
      this.peers[this.state.view % this.state.nbNodes]))
      throw new Error('signature of payload is not correct in pre-prepare phase')
    if (!Identity.verifyHash(msg ,payload.digest))
      throw new Error('checksum of msg is not correct in pre-prepare phase')
    if (payload.v !== this.state.v)
      throw new Error('state (v) does not correspond in pre-prepare phase')

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
    if (!Identity.verifyHash(this.message, payload.digest)) {
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
    if (!Identity.verifyHash(message, payload.digest)) {
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
      this.state.seqNb++
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
      this.state.accounts[tx.to] = this.state.accounts[tx.to] || 0

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

  handlePrePrepareBlock(block, sig) {
    this.pendingBlock = block
    this.pendingBlockSig = sig
    this.prepareList = new Set()
    this.prepareList.add(this.peers[this.I])
    this.onTransaction = true

    this.emit('prepare-block', this.peers[this.i])
  }

  handlePrepareBlock(emitter) {
    this.prepareList.add(emitter)

    if (!this.pendingBlock || !this.pendingBlockSig) {
      return
    }
    if (!Identity.verifySig(this.pendingBlock, this.pendingBlockSig,
      this.peers[this.state.view % this.state.nbNodes])) {
      this.pendingBlock = null
      this.pendingBlockSig = null
      throw ('Block signature is invalid')
    }
    if (!this.checkBlock(this.pendingBlock)) {
      this.pendingBlock = null
      this.pendingBlockSig = null
      throw ('Block verification failed')
    }

    this.prepareList.add(emitter)

    if (this.prepareList.size >= (2 / 3) * this.state.nbNodes) {
      this.commitList = new Set()
      this.commitList.add(emitter)

      this.emit('commit', payload, this.id.sign(payload))
    }
  }

  handleCommit(emitter) {
    if (!this.pendingBlock ||  !this.onTransaction) {
      return
    }
    this.commitList.add(emitter)
    if (this.commitList.size > (1 / 3) * this.state.nbNodes) {
      this.blockchain.chain.push(this.pendingBlock)
      this.pendingTxs = []
      this.pendingBlock = null
      this.pendingBlockSig = null
      this.onTransaction = false
    }
  }


  mine() {
    this.pendingBlock = this.buildNextBlock()
    this.pendingBlockSig = this.id.sign(this.pendingBlock)
    this.pendingTxs = []

    this.prepareList = new Set()
    this.prepareList.add(this.peers[this.i])
    this.onTransaction = true

    this.emit('pre-prepare-block', this.pendingBlock, this.pendingBlockSig)

    setTimeout(() => {
      if (this.pendingBlock) {
        log('❌ block invalid\n', this.pendingBlock)
        this.pendingBlock = null
        this.pendingBlockSig = null
      }
    }, 1000)

  }

  startMining() {
    this.minerPid = setInterval(() => this.mine(), 3000)
  }

  stopMining() {
    clearInterval(this.minerPid)
  }
}
