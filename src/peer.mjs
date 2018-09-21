import EventEmitter from 'events'
import debug from 'debug'
import { Identity } from './identity'
import { Blockchain, Block, State } from './blockchain';
import knownPeers from './known-peers'
import { debuglog } from 'util';

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

/**
 * trucs a faire:
 * hardcoder le reseau pour 1 peer
 * factoriser ce bpft
 * ajouter des nouveaux peers de facon synchro
 */

let log = debug('peer')
let logDebug = debug('debug')

export class Peer extends EventEmitter {
  constructor(network) {
    super()
    this.network = network
    this.id = new Identity()
    this.blockchain = new Blockchain()
    this.state = new State()
    this.i = 0

    this.pendingTxs = []
    this.transactionQueue = []

    this.receivedStatesHash = []
    this.receivedKeys = new Set()

    this.peers = []
    this.peers[this.i] = this.id.publicKey
    this.transactionDic = []
    //this.prepareListsTx = []
    //this.commitListsTx = []

    this.prepareListBlock = new Set()
    this.commitListBlock = new Set()

    this.onTransaction = false
    this.isMining = false
    //this.message = null
    //this.messageSig = null

    this.pendingBlock = null
    this.pendingBlockSig = null

    this.ready = false

    setTimeout(this.checkIsReady.bind(this), 1000)

  }

  handlePrePrepare(req) {
    if (req.type === 'transaction') {
      return this.handlePrePrepareTx(req.payload, req.sig, req.msg)
    } else if (req.type === 'block') {
      return this.handlePrePrepareBlock(req.block, req.sig)
    }
  }

  handlePrepare(req) {
    if (!this.ready)
      return
    if (req.type === 'transaction') {
      return this.handlePrepareTx(req.payload, req.sig)
    } else if (req.type === 'block') {
      return this.handlePrepareBlock(req.emitter)
    }
  }

  handleCommit(req) {
    if (!this.ready)
      return
    if (req.type === 'transaction') {
      return this.handleCommitTx(req.payload, req.sig)
    } else if (req.type === 'block') {
      return this.handleCommitBlock(req.emitter)
    }
  }

  handleRequest({ msg, sig }) {
    log('Handling a request')
    if (!Identity.verifySig(msg, sig, msg.client))
      throw new Error('Wrong signature on client\'s request')

    if (this.i !== this.state.view % this.state.nbNodes)
      throw new Error('Cannot handle request: not masterNode')
    // TODO: trigger change view


    //this.message = msg
    //this.messageSig = sig

    const payload = {
      view: this.state.view,
      seqNb: this.state.seqNb,
      digest: Identity.hash(msg)
    }

    this.emit('pre-prepare', {
      payload: payload,
      sig: this.id.sign(payload),
      msg: msg,
      type: 'transaction'
    })
    this.handlePrePrepareTx(payload, this.id.sign(payload), msg)
  }

  handlePrePrepareTx(payload, sig, msg) {
    log('===> handlePrePrepareTx(%O)', payload)
    if (this.onTransaction || this.isMining || !this.ready) {
      this.transactionQueue.push({
        payload: payload,
        sig: sig,
        msg: msg,
        type: 'transaction'
      })
      return
    }
    this.state.seqNb++
    this.transactionDic[payload.seqNb] = {}

    this.transactionDic[payload.seqNb].prepareList = new Set()
    this.transactionDic[payload.seqNb].commitList = new Set()
    if (!Identity.verifySig(payload, sig,
      this.peers[this.state.view % this.state.nbNodes]))
      throw new Error('Invalid payload\'s sig')
    if (!Identity.verifyHash(msg, payload.digest))
      throw new Error('Invalid msg\'s checksum')
    if (payload.v !== this.state.v)
      throw new Error('Invalid view')

    this.transactionDic[payload.seqNb].message = msg
    this.transactionDic[payload.seqNb].messageSig = msg

    const payloadI = {
      ...payload,
      i: this.i
    }
    this.onTransaction = true

    this.emit('prepare', {
      payload: payloadI,
      sig: this.id.sign(payloadI),
      type: 'transaction'
    })
    this.handlePrepareTx(payloadI, this.id.sign(payloadI))
  }


  handlePrepareTx(payload, sig) {
    log('===> handlePrepareTx(%O)', payload)
    if (!Identity.verifySig(payload, sig, this.peers[payload.i]))
      throw new Error('wrong payload signature')
    if (!Identity.verifyHash(this.transactionDic[payload.seqNb].message, payload.digest))
      throw new Error('wrong checksum for message')
    if (payload.view !== this.state.view)
      throw new Error('wrong view number')
    if (payload.seqNb < this.state.h)
      throw new Error('sequence number is lower than h')

      this.transactionDic[payload.seqNb].prepareList.add(this.peers[payload.i])

    if (this.transactionDic[payload.seqNb].prepareList.size >= (2 / 3)
        * this.state.nbNodes) {

      this.transactionDic[payload.seqNb].commitList.add(this.id.publicKey)
      let payloadI = { ...payload }
      payloadI.i = this.i

      this.emit('commit', {
        payload: payloadI,
        sig: this.id.sign(payloadI),
        type: 'transaction'
      })

      this.handleCommitTx(payloadI, this.id.sign(payloadI))
    }
  }

  handleCommitTx(payload, sig) {
    log('===> handleCommitTx(%O)', payload)

    if (!this.transactionDic[payload.seqNb].message)
      return
    if (!Identity.verifySig(payload, sig, this.peers[payload.i]))
      throw new Error('wrong payload signature')
    if (!Identity.verifyHash(this.transactionDic[payload.seqNb].message, payload.digest))
      throw new Error('wrong checksum for message')
    if (payload.view !== this.state.view)
      throw new Error('wrong view number')
    if (payload.seqNb < this.state.h)
      throw new Error('sequence number is lower than h')

      this.transactionDic[payload.seqNb].commitList.add(this.peers[payload.i])
    if (this.transactionDic[payload.seqNb].commitList.size > (1 / 3)
        * this.state.nbNodes) {

      this.replyToClient(this.transactionDic[payload.seqNb])
      this.state.h++
      this.onTransaction = false
      this.transactionDic[payload.seqNb].message = null
      this.transactionDic[payload.seqNb].messageSig = null

      this.handleNextTransaction()
    }
  }

  handleNextTransaction() {
    if (!this.ready)
      return

    if (this.isMining) {
      return this.handlePrePrepareBlock(this.pendingBlock, this.pendingBlockSig)
    }
    if (this.transactionQueue.length === 0 || this.onTransaction)
      return

    const tx = this.transactionQueue.shift()
    log('handleNextTransaction(): %O', tx)


    if (tx.type === 'sync') {
      this.ready = false
      return this.newPeer(tx.key)
    }

    return this.handlePrePrepareTx(tx.payload, tx.sig, tx.msg)

  }

  replyToClient(data) {
    let result = {
      view: this.view,
      timestamp: data.message.timestamp,
      client: data.message.client,
      i: this.i,
      valid: true
    }

    const tx = data.message.tx
    if (!this.state.accounts[tx.from]
      || this.state.accounts[tx.from] - tx.amount < 0) {
      result.valid = false
    } else {
      this.state.accounts[tx.to] = this.state.accounts[tx.to] || 0

      this.state.accounts[tx.from] -= parseInt(tx.amount)
      this.state.accounts[tx.to] += parseInt(tx.amount)
    }
    this.pendingTxs.push({
      request: data.message,
      sig: data.messageSig,
      valid: result.valid
    })
    this.emit('reply', {
      result: result,
      sig: this.id.sign(result)
    })
  }


  buildNextBlock() {
    return new Block(
      this.blockchain.chain.length,
      this.pendingTxs,
      this.blockchain.lastBlock().hash,
      JSON.parse(JSON.stringify(this.state))
    )
  }

  checkBlock(blockToCheck) {
    const block = this.buildNextBlock()
    return block.hash === blockToCheck.hash
  }

  handlePrePrepareBlock(block, sig) {
    if (this.onTransaction) {
      this.isMining = true
      this.pendingBlock = block
      this.pendingBlockSig = sig
      return
    }

    if (!Identity.verifySig(block, sig, this.peers[ this.state.view % this.state.nbNodes ]))
    {
      console.log('')
      throw new Error('Block signature is invalid')
    }

    this.pendingBlock = block
    this.pendingBlockSig = sig
    this.onTransaction = true

    this.prepareListBlock = new Set()
    // Add master peer signature

    this.emit('prepare', {
      emitter: this.id.publicKey,
      type: 'block'
    })

    this.handlePrepareBlock(this.id.publicKey)
  }

  handlePrepareBlock(emitter) {
    log('===> handlePrepareBlock(%o)', emitter)
    if (!this.pendingBlock || !this.pendingBlockSig) {
      this.prepareListBlock.add(emitter)
      return logDebug('prepare received but there is no pending block')
    }

    if (!this.checkBlock(this.pendingBlock)) {
      this.pendingBlock = null
      this.pendingBlockSig = null
      throw new Error('Block verification failed: hashs don\'t match')
    }

    this.prepareListBlock.add(emitter)
    log('prepareListBlock: %O', this.prepareListBlock)

    if (this.prepareListBlock.size >= (2 / 3) * this.state.nbNodes) {
      this.emit('commit', {
        emitter: this.id.publicKey,
        type: 'block'
      })
      this.handleCommitBlock(this.id.publicKey)
    }
  }

  handleCommitBlock(emitter) {
    log('===> handleCommitBlock(%o)', emitter)
    if (!this.pendingBlock || !this.onTransaction) {
      return
    }

    this.commitListBlock.add(emitter)

    log('commitListBlock %O', this.commitListBlock)

    if (this.commitListBlock.size > (1 / 3) * this.state.nbNodes) {
      this.blockchain.chain.push(this.pendingBlock)
      logDebug('-------')
      logDebug(this.peers)
      logDebug('peer state:')
      logDebug(this.state)
      logDebug('pending block state:')
      logDebug(this.pendingBlock.state)
      logDebug('-------')
      log('⛏️  Block #%d validated', this.pendingBlock.index)
      this.pendingTxs = []
      this.pendingBlock = null
      this.pendingBlockSig = null
      this.prepareListBlock = new Set()
      this.commitListBlock = new Set()
      this.onTransaction = false
      this.isMining = false
      logDebug('mine block with %d peers', this.state.nbNodes)
      return this.handleNextTransaction()
    }
  }


  mine() {
    //this.isMining = true
    this.pendingBlock = this.buildNextBlock()
    this.pendingBlockSig = this.id.sign(this.pendingBlock)

    this.emit('pre-prepare', {
      block: this.pendingBlock,
      sig: this.pendingBlockSig,
      type: 'block'
    })
    this.handlePrePrepareBlock(this.pendingBlock, this.pendingBlockSig)

    setTimeout(() => {
      if (this.pendingBlock) {
        log('❌ block invalid\n', this.pendingBlock)
        logDebug('❌ block invalid\n', this.pendingBlock)
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


  newPeer(key) {
    if (this.onTransaction || this.isMining) {
      this.transactionQueue.push({
        type: 'sync'
      })
      return
    }
    logDebug('------ PEERS PLUS PLUS ------')
    this.ready = false
    this.peers[this.state.nbNodes] = key
    this.state.nbNodes++
    setTimeout(this.handleSynchronized.bind(this), 1000)
    console.log('peer number', this.i)


    return {
      state: this.state ? Object.assign({}, this.state) : null,
      blockchain: this.blockchain ? Object.assign({}, this.blockchain) : null,
      pendingTxs: this.pendingTxs,
      transactionQueue: this.transactionQueue,
      peers: this.peers,
      pendingBlock: this.pendingBlock ? Object.assign({}, this.pendingBlock) : null,
      pendingBlockSig: this.pendingBlockSig,
      isMining: this.isMining
    }
  }

  checkIsReady(nbPeers = 1) {
    if (this.ready)
      return

    const stateCandidate = Object.entries(this.receivedStatesHash)
      .map(([key, val]) => val)
      .sort((a, b) => b.count - a.count)[0]

    log('checkIsReady(nbPeers = %d)', nbPeers)
    if (nbPeers === 1)
      return this.handleSynchronized()

    log('statecandidate.count: %d', stateCandidate.count)
    log('target: %d', (1 / 3) * nbPeers)

    if (stateCandidate.count > (1 / 3) * nbPeers) {
      this.state = stateCandidate.data.state
      this.blockchain = Blockchain.fromJSON(stateCandidate.data.blockchain)
      this.pendingTxs = stateCandidate.data.pendingTxs
      this.transactionQueue = stateCandidate.data.transactionQueue
      this.peers = stateCandidate.data.peers
      if (!stateCandidate.data.pendingBlock)
        this.pendingBlock = null
      else
        this.pendingBlock = Block.fromJSON(stateCandidate.data.pendingBlock)
      this.pendingBlockSig = stateCandidate.data.pendingBlockSig
      this.isMining = this.isMining
      this.i = this.peers.length - 1
      logDebug('My new i is: %d', this.i)
      this.receivedKeys = null
      this.receivedStatesHash = []

      this.emit('synchronized')
      this.handleSynchronized()
    }
  }

  syncState(data, nbPeers) {

    if (this.ready)
      return this.emit('synchronized')

    console.log('reveived key:', data.key)
    console.log('set of keys:', this.receivedKeys)
    if (this.receivedKeys.has(data.key))
      return

    this.receivedKeys.add(data.key)
    delete data.key

    console.dir(data, {color: true, depth: 5})
    console.log('hash: ', Identity.hash(data))
    console.log('')

    const hash = Identity.hash(data)
    this.receivedStatesHash[hash] = {
      data,
      count: (this.receivedStatesHash[hash] || { count: 0 }).count + 1
    }

    this.checkIsReady(nbPeers + 1) // because it's counting itself
  }

  handleSynchronized() {
    if (this.ready)
      return
    this.ready = true
    if (this.i === this.state.view % this.state.nbNodes) {
      this.startMining()
    }
    this.handleNextTransaction()
  }
}
