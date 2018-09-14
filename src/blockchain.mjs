import crypto from 'crypto'

const crypto_secret = process.env.CRYPTO_SECRET || Math.random().toString()

export class Block {
  constructor(index, data, prevHash, timestamp) {
    this.index = index
    this.data = data
    this.prevHash = prevHash
    this.timestamp = timestamp
    this.hash = this.computeHash()
  }

  computeHash() {
    return crypto
      .createHmac('sha256', crypto_secret)
      .update(this.index + this.prevHash + this.data + this.timestamp)
      .digest('hex')
  }

  equals(block) {
    return JSON.stringify(this) === JSON.stringify(block)
  }

  toString() {
    return JSON.stringify(this)
  }
}

export class Blockchain {
  constructor() {
    this.chain = [this.genesisBlock()]
  }

  genesisBlock() {
    return new Block(0, [], 0, Date.now())
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
    return this
  }

  isValid() {
    for (let i = 1; i < this.chain.length; ++i) {
      const cur = this.chain[i]
      const prev = this.chain[i - 1]

      if (cur.hash !== cur.computeHash() || cur.prevHash !== prev.hash)
        return false
    }
    return true
  }

  replaceChain(blockchain) {
    if (blockchain.chain[0].equals(this.chain[0])
      && blockchain.isValid()
      && blockchain.chain.length > this.chain.length) {
      this.chain = blockchain.chain
    }
  }
}
