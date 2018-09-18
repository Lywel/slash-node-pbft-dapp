import EventEmitter from 'events'
import debug from 'debug'
import { Identity } from './identity'

import { Blockchain, Block } from './blockchain';
import knownPeers from './known-peers'

let log = debug('[ Peer ]')

export class Peer extends EventEmitter {
  constructor(network) {
    super()
    this.blockchain = new Blockchain()
    this.pendingTx = null
    this.id = new Identity()
    this.state = new State()
    this.i = 0

    this.peers = []
    this.prepareList = []
    this.commitList = []
    // sync
    network.on('request', (msg) => {
      this.handleRequest(msg)
    })
    network.on('pre-prepare', (payload, sig, msg) => {
      this.handlePrePrepare(payload, sig, msg)
    })
    network.on('prepare', (payload, sig) => {
      this.handlePrepare(payload, sig)
    })
    network.on('commit', (payload, sig) => {
      handleCommit(payload, sig)
    })


    this.onTransaction = false
    this.message = null

  }

  handleRequest(msg) {
    if (this.i !== this.state.view % this.state.nbNodes) {
      log('error : replica receiving request')
      // trigger change view
      return
    }
    if (this.onTransaction === true) {
      // a transaction is already being computed
      // implement queue ?
      return
    }
    this.pendingTx = msg

    const payload = {
      view: this.state.view,
      seqNb: this.state.seqNb,
      digest: this.id.hash(msg)
    }
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
      log('ERROR: state (v) does not correspond with the message')
      return
    }

    this.message = msg

    const payloadI = {
      ...payload,
      i: this.i
    }
    this.prepareList.push(payloadI)
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
      log('ERROR: state (v) is not correct in prepare message')
      return
    }
    if (payload.seqNb < this.state.h) {
      log('ERROR: problem in sequence number')
      return
    }

    this.prepareList.push(payload)
    if (this.prepareList.length >= (2 / 3) * this.state.nbNodes) {
      this.phase = 2
      this.emit('commit', payload, this.id.sign(payload))
    }
  }

  handleCommit(payload, sig) {
    if (this.phase !== 2) {
      return
    }
    if (!Identity.verifySig(payload, sig, peers[payload.i])) {
      log('ERROR: signature of payload is not correct in prepare phase')
      return
    }
    if (!Identity.verifyHash(message ,payload.digest)) {
      log('ERROR: checksum of msg is not correct in commit phase')
      return
    }
    if (payload.view !== this.state.view) {
      log('ERROR: state (v) is not correct in prepare message')
      return
    }
    if (payload.seqNb < this.state.h) {
      log('ERROR: problem in sequence number')
      return
    }

    this.commitList.push(payload)
    if (this.commitList.length > (1 / 3) * this.state.nbNodes) {

      await this.replyToClient()
      this.state.pendingTxs.push(this.message)
      this.state.h++
      this.onTransaction = false
      this.prepareList = []
      this.commitList = []
      this.message = {}
    }
  }

  async replyToClient() {
    let result = {
      view: this.view,
      timestamp: this.message.timestamp,
      client: this.message.client,
      i: this.i,
      valid: true
    }

    const tx = this.message.tx
    if (!this.state.accounts[tx.from]
      || this.state.accounts[tx.from] - this.message.amount < 0) {
        result.valid = false
    } else {
      this.state.accounts[tx.to] = this.state.accounts[tx.to] || 0

      this.state.accounts[tx.from] -= tx.amount
      this.state.accounts[tx.to] += tx.amount
    }
    this.emit('reply', result, this.id.sign(result))
  }

  computeBalances() {
    let transactionList = {}
    transactionList['root'] = 100

    this.blockchain.chain.forEach(block => {
      block.data.forEach(tx => {
        if (tx.valid === false)
          return

        transactionList[tx.from] = transactionList[tx.from] || 0
        transactionList[tx.to] = transactionList[tx.to] || 0

        transactionList[tx.from] -= tx.amount
        transactionList[tx.to] += tx.amount
      })
    })

    return transactionList
  }

  buildNextBlock() {
    let transactionList = this.computeBalances()
    let resData = []

    this.pendingTxs.forEach(tx => {
      transactionList[tx.to] = transactionList[tx.to] || 0
      transactionList[tx.from] = transactionList[tx.from] || 0
      if (transactionList[tx.from] - tx.amount >= 0) {
        resData.push({ ...tx, ok: true })
        transactionList[tx.to] += tx.amount
        transactionList[tx.from] -= tx.amount
      }
      else
        resData.push({ ...tx, ok: false })
    })

    // Clear registered transactions
    this.pendingTxs = []

    return new Block(
      this.blockchain.chain.length,
      resData,
      this.blockchain.lastBlock().hash,
      this.state
    )
  }



  checkBlock(blockToCheck) {
    let transactionList = this.computeBalances()
    let isValid = true

    if (blockToCheck.prevHash !== this.blockchain.lastBlock().hash) {
      return false
    }
    // TODO: verify hash of previous block

    blockToCheck.data.forEach(tx => {
      if (tx.valid === false ) {
        if (transactionList[tx.from] - tx.amount >= 0)
          isValid = false
        return
      }

      if (transactionList[tx.from] - tx.amount < 0) {
        isValid = false
        return
      }

      transactionList[tx.from] = transactionList[tx.from] || 0
      transactionList[tx.to] = transactionList[tx.to] || 0

      transactionList[tx.from] -= tx.amount
      transactionList[tx.to] += tx.amount
    })

    return isValid
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

    this.emit('block', this.pendingBlock, (amount) => {
      log(`🚧 Block emitted, ${amount.toFixed(3)} signatures needed`)
      this.pendingBlock.signAmount = amount
    })

    setTimeout(() => {
      if (this.pendingBlock) {
        log('❌ block invalid\n', this.pendingBlock)
        this.pendingBlock = null
      }
    }, 1000)

    this.signBlock({emitter: this.id.publicKey.toString('hex')})
  }

  startMining() {
    this.minerPid = setInterval(() => this.mine(), 3000)
  }

  stopMining() {
    clearInterval(this.minerPid)
  }
}
