import crypto from 'crypto'

const crypto_secret = process.env.CRYPTO_SECRET || "cpassympa".toString()

export class State {
  constructor() {
    this.accounts = {'0' : 100}
    this.view = 0
    this.seqNb = 0
    this.h = 0
    this.nbNodes = 1
  }
}

export class Block {
  constructor(index, data, prevHash, state) {
    this.index = index
    this.data = data
    this.prevHash = prevHash
    this.hash = this.computeHash()
    this.state = state
  }

  computeHash() {
    return crypto
      .createHmac('sha256', crypto_secret)
      .update(this.index + this.prevHash + this.data)
      .digest('hex')
  }

  equals(block) {
    return JSON.stringify(this) === JSON.stringify(block)
  }

  toString() {
    return JSON.stringify(this)
  }

  static fromJSON(json) {
    let block = new Block(json.index, json.data, json.prevHash, json.state)
    block.hash = json.hash
    return block
  }
}

export class Blockchain {
  constructor() {
    this.chain = [this.genesisBlock()]
  }

  genesisBlock() {
    return new Block(0, [], 0, new State({"root" : 100}))
  }

  lastBlock() {
    return this.chain[this.chain.length - 1]
  }

  addBlock(data, state) {
    let block = new Block(
      this.chain.length,
      data,
      this.lastBlock().hash,
      state)
    this.chain.push(block)
  }

  static isValid(chain) {
    for (let i = 1; i < chain.length; ++i) {
      const cur = chain[i]
      const prev = chain[i - 1]

      if (cur.hash !== cur.computeHash() || cur.prevHash !== prev.hash)
        return false
    }
    return true
  }

  replaceChain(chain) {
    if (chain[0].equals(this.chain[0])
      && Blockchain.isValid(chain)
      && chain.length > this.chain.length)
      this.chain = chain
  }
}
