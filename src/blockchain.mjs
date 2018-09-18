import crypto from 'crypto'

const crypto_secret = process.env.CRYPTO_SECRET || "cpassympa".toString()

export class Block {
  constructor(index, data, prevHash) {
    this.index = index
    this.data = data
    this.prevHash = prevHash
    this.hash = this.computeHash()
    this.signatures = []
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
    let block = new Block(json.index, json.data, json.prevHash)
    block.hash = json.hash
    return block
  }
}

export class Blockchain {
  constructor() {
    this.chain = [this.genesisBlock()]
  }

  genesisBlock() {
    return new Block(0, [], 0)
  }

  lastBlock() {
    return this.chain[this.chain.length - 1]
  }

  addBlock(data) {
    let block = new Block(
      this.chain.length,
      data,
      this.lastBlock().hash,
      Date.now())
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
