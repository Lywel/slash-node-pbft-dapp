import crypto from 'crypto'
import low from 'lowdb'
import FileSync from 'lowdb/adapters/FileSync'

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
  constructor(index, data, prevHash, stateHash) {
    this.index = index
    this.data = data
    this.prevHash = prevHash
    this.hash = this.computeHash()
    this.stateHash = stateHash
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
    let block = new Block(json.index, json.data, json.prevHash, json.stateHash)
    block.hash = json.hash
    return block
  }
}

export class Blockchain {
  constructor() {
    const adapter = new FileSync('blockchain.json')
    this.db = low(adapter)

    this.db.defaults({
      chain: [this.genesisBlock()]
    })
    .write()
  }

  get chain() {
    return this.db.get('chain').value()
  }

  genesisBlock() {
    return new Block(0, [], 0, null)
  }

  lastBlock() {
    return this.db.get('chain').last().value()
  }

  pushBlock(block) {
    this.db.get('chain').push(block).write()
  }

  addBlock(data, stateHash) {
    const block = new Block(
      this.chain.length,
      data,
      this.lastBlock().hash,
      stateHash)
    this.pushBlock(block)
  }

  static fromJSON(json) {
    json.chain = json.chain.map(block => Block.fromJSON(block))
    return Object.assign(new Blockchain, json)
  }
}
