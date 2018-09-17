import EventEmitter from 'events'
import debug from 'debug'
import { Identity } from './identity'

import { Blockchain } from './blockchain'
import { Block } from './blockchain.mjs';
import knownPeers from './known-peers'

let log = debug('[ Peer ]')

export class Peer extends EventEmitter {
  constructor() {
    super()
    this.blockchain = new Blockchain()
    this.pendingTx = []
    this.id = new Identity()
    this.pendingTxs = []
    this.state = new State()
  }

  async registerTx(tx) {
    log('tx received')

    if (process.env.MASTER) {
      this.pendingTx = tx
      this.broadcastTx(tx)
      console.log('[Peer] 💸 tx registered', tx)
    } else {
      log('tx transfered', tx)
      this.emit('master-msg', {
        type: 'tx',
        data: tx
      })
    }
  }

  computeBalances() {
    let transactionList = {}
    transactionList["root"] = 100

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
    )
  }

  checkTx(tx) {
    return amount >= 0 && this.state[tx.from] !== null && tx.from - tx.amount >= 0
  }

  broadcastTx(sign) { // FIXME
    console.log('[Peer] received signature from', sign.emitter)
    if (this.pendingTx) {
      this.pendingTx.signatures.push(sign.emitter)

      if (this.pendingTx.signatures.length > this.pendingTx.signAmount) {
        console.log('[Peer]  transaction verified\n', this.pendingTx)
        this.pendingTx.push(this.pendingTx)
        this.pendingTx = null
      }
    } else {
      console.error('[Peer] but there is no pending blocks')
    }
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
