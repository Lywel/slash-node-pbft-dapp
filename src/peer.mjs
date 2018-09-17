import Axios from 'axios'
import EventEmitter from 'events'

import { Blockchain } from './blockchain'
import { Block } from './blockchain.mjs';
import knownPeers from './known-peers'

export class Peer extends EventEmitter {
  constructor() {
    super()
    this.blockchain = new Blockchain()
    this.pendingTx = []
  }

  async registerTx(tx) {
    console.log('[Peer] tx received')

    if (process.env.MASTER) {
      this.pendingTx.push(tx)
      console.log('[Peer] 💸 tx registered', tx)
    } else {
      await Axios.post(`http://${knownPeers[0]}/tx`, tx)
      console.log('[Peer] tx transfered', tx)
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

    this.pendingTx.forEach(tx => {
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
    this.pendingTx = []

    return new Block(
      this.blockchain.chain.length,
      resData,
      this.blockchain.lastBlock().hash,
    )
  }

  checkBlock(blockToCheck) {
    let transactionList = this.computeBalances()
    let isValid = true

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
    console.log('[Peer] received signature from', sign.emitter)
    if (this.pendingBlock) {
      this.pendingBlock.signatures.push(sign.emitter)

      if (this.pendingBlock.signatures.length > this.pendingBlock.signAmount) {
        console.log('[Peer] ⛏️  block verified\n', this.pendingBlock)
        this.blockchain.chain.push(this.pendingBlock)
        this.pendingBlock = null
      }
    } else {
      console.error('[Peer] but there is no pending blocks')
    }
  }

  mine() {
    this.pendingBlock = this.buildNextBlock()

    this.emit('block', this.pendingBlock, (amount) => {
      console.log(`[Peer] waiting for ${amount} signatures`)
      this.pendingBlock.signAmount = amount
    })

    setTimeout(() => {
      if (this.pendingBlock) {
        console.log('[Peer] ❌ block invalid\n', this.pendingBlock)
        this.pendingBlock = null
      }
    }, 1000)

    this.signBlock({emitter: 'MasterPeer'})
  }

  startMining() {
    this.minerPid = setInterval(() => this.mine(), 3000)
  }

  stopMining() {
    clearInterval(this.minerPid)
  }
}
