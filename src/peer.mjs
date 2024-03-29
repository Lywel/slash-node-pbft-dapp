import EventEmitter from 'events'
import debug from 'debug'
import { Identity } from './identity'
import { Blockchain, Block, State, CheckPoint } from './blockchain';
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

const TIMEOUT = process.env.TIMEOUT || 2000
const BLOCK_INTERVAL = 3000
const CHECKPOINT_INTERVAL = 3

export class Peer extends EventEmitter {
  constructor() {
    super()
    this.id = new Identity()
    this.blockchain = new Blockchain()
    this.state = new State()
    this.checkpoint = new CheckPoint(this.state, 0)
    this.i = 0

    this.pendingTxs = []
    this.transactionQueue = []

    this.receivedStatesHash = []
    this.receivedKeys = new Set()

    this.peers = []
    this.peers[this.i] = this.id.publicKey
    this.transactionDic = []

    this.prepareListBlock = new Set()
    this.commitListBlock = new Set()

    this.checkpointList = new Set()
    this.changeViewList = new Set()
    this.newViewList = new Set()

    this.onTransaction = false
    this.isMining = false
    this.isChangingView = false
    this.timer = null
    this.minerPid = null

    this.pendingBlock = null
    this.pendingBlockSig = null

    this.checkpoint = null

    this.ready = false

    setTimeout(this.checkIsReady.bind(this), TIMEOUT)
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
    if (!Identity.verifySig(msg, sig, msg.tx.from) && msg.tx.from !== '0') {
      this.onTransaction = false
      this.handleNextTransaction()
      log('Wrong signature on client\'s request')
      return
    }

    if (this.i !== this.state.view % this.state.nbNodes)
      throw new Error('Cannot handle request: not masterNode')
    // TODO: trigger change view

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
      this.transactionDic[payload.seqNb] = {}
      this.transactionDic[payload.seqNb].prepareList = new Set()
      this.transactionDic[payload.seqNb].commitList = new Set()
      this.transactionDic[payload.seqNb].message = msg
      this.transactionDic[payload.seqNb].messageSig = payload.digest
      this.state.seqNb++

      return
    }

    if (!this.transactionDic[payload.seqNb]) {
      this.transactionDic[payload.seqNb] = {}

      this.transactionDic[payload.seqNb].prepareList = new Set()
      this.transactionDic[payload.seqNb].commitList = new Set()

      this.transactionDic[payload.seqNb].message = msg
      this.transactionDic[payload.seqNb].messageSig = payload.digest
      this.state.seqNb++

    }
    if (!Identity.verifySig(payload, sig,
      this.peers[this.state.view % this.state.nbNodes]))
      throw new Error('Invalid payload\'s sig')
    if (!Identity.verifyHash(msg, payload.digest))
      throw new Error('Invalid msg\'s checksum')
    if (payload.v !== this.state.v)
      throw new Error('Invalid view')



    const payloadI = {
      ...payload,
      i: this.i
    }
    this.startOperation('transaction')

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

    const prepareListSize = this.transactionDic[payload.seqNb].prepareList.size
    const MinNonFaulty = (2 / 3) * this.state.nbNodes

    if (prepareListSize >= MinNonFaulty) {

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

    const commitListSize = this.transactionDic[payload.seqNb].commitList.size
    const maxFaultyNodes =  (1 / 3) * this.state.nbNodes

    if (commitListSize > maxFaultyNodes) {
      this.replyToClient(this.transactionDic[payload.seqNb])
      this.state.h++
      this.stopOperation('transaction')
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
      view: this.state.view,
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
      Identity.hash(this.state)
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

    if (!Identity.verifySig(block, sig, this.peers[this.state.view % this.state.nbNodes]))
      throw new Error('Block signature is invalid')

    this.pendingBlock = block
    this.pendingBlockSig = sig
    //this.onTransaction = true
    this.startOperation('block')

    /*
    log('i: %d, master peer: %d', this.i, this.state.view % this.state.nbNodes)
    if (this.i !== this.state.view % this.state.nbNodes && this.blockchain.chain.length === 5) {
      logDebug('start faking no response')
      return
    } */

    this.prepareListBlock = new Set()

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
      console.log('peer pending block\n')
      console.dir(this.pendingBlock, { color: true, depth: 3 })
      console.log('-----------------')
      console.log('calculated block\n')
      console.dir(this.buildNextBlock(), { color: true, depth: 3 })
      console.log('blockchain len:', this.blockchain.chain.length)

      this.pendingBlock = null
      this.pendingBlockSig = null
      //this.stopOperation('block')
      throw new Error('Block verification failed: hashs don\'t match')
    }

    this.prepareListBlock.add(emitter)
    log('prepareListBlock: %O', this.prepareListBlock)

    const prepareListBlockSize = this.prepareListBlock.size
    const MinNonFaulty = (2 / 3) * this.state.nbNodes

    if (prepareListBlockSize >= MinNonFaulty) {
      this.emit('commit', {
        emitter: this.id.publicKey,
        type: 'block'
      })
      this.handleCommitBlock(this.id.publicKey)
    }
  }

  handleCommitBlock(emitter) {
    log('===> handleCommitBlock(%o)', emitter)
    if (!this.pendingBlock) {
      return
    }

    this.commitListBlock.add(emitter)

    log('commitListBlock %O', this.commitListBlock)

    const commitListBlockSize = this.commitListBlock.size
    const maxFaultyNodes = (1 / 3) * this.state.nbNodes

    if (commitListBlockSize > maxFaultyNodes) {
      this.blockchain.pushBlock(this.pendingBlock)

      logDebug('peers list:')
      logDebug(this.peers)
      logDebug('peer state:')
      logDebug(this.state)
      logDebug('pending block state hash: %s', this.pendingBlock.stateHash)
      log('⛏️  Block #%d validated', this.pendingBlock.index)

      this.pendingTxs = []
      this.pendingBlock = null
      this.pendingBlockSig = null
      this.prepareListBlock = new Set()
      this.commitListBlock = new Set()
      this.isMining = false
      this.stopOperation('block')
      this.applyDemurrage()
      logDebug('mine block with %d peers', this.state.nbNodes)

      if (this.blockchain.chain.length % CHECKPOINT_INTERVAL === 0) {
        log('checkpoint produced')
        this.checkpoint = new CheckPoint(this.state, this.blockchain.chain.length)
      }
      return this.handleNextTransaction()
    }
  }


  mine() {
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
    }, TIMEOUT)

  }

  startMining() {
    this.minerPid = setInterval(() => this.mine(), BLOCK_INTERVAL)
    logDebug('START MINING')
  }

  stopMining() {
    clearInterval(this.minerPid)
    this.minerPid = null
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

    this.stopMining()
    this.state.nbNodes++
    setTimeout(this.handleSynchronized.bind(this), TIMEOUT)

    return {
      state: this.state,
      blockchain: this.blockchain,
      pendingTxs: this.pendingTxs,
      transactionQueue: this.transactionQueue,
      peers: this.peers,
      checkpoint: this.checkpoint,
      pendingBlock: this.pendingBlock,
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
      this.checkpoint = stateCandidate.data.checkpoint
      if (!stateCandidate.data.pendingBlock)
        this.pendingBlock = null
      else
        this.pendingBlock = Block.fromJSON(stateCandidate.data.pendingBlock)
      this.pendingBlockSig = stateCandidate.data.pendingBlockSig
      this.isMining = this.isMining
      this.i = this.state.nbNodes - 1
      logDebug('peer\'s i is: %d', this.i)
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

    console.dir(data, { color: true, depth: 2 })
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
    if (!this.minerPid && this.i === this.state.view % this.state.nbNodes) {
      this.startMining()
    }
    this.handleNextTransaction()
  }

  handlePeerDisconnect(key) {
    let i = this.peers.indexOf(key)
    if (i === -1)
      throw new Error('key is not in peers list')

    if (this.i > i)
      this.i--
    for (; i < this.peers.length - 1; i++) {
      this.peers[i] = this.peers[i + 1]
    }
    delete this.peers[this.state.nbNodes - 1]
    this.state.nbNodes--

    if (this.i === this.state.view % this.state.nbNodes && !this.minerPid)
      this.startMining()
  }

  applyDemurrage() {
    Object.entries(this.state.accounts).forEach(([key, value]) => this.state.accounts[key] *= 0.99999999)
  }

  startOperation(type) {
    if (type === 'transaction')
      this.onTransaction = true
    if (type === 'block')
      this.isMining = true
    this.timer = setTimeout(this.askChangeView.bind(this), TIMEOUT)
  }

  stopOperation(type) {
    if (type === 'transaction')
      this.onTransaction = false
    if (type === 'block')
      this.isMining = false
    clearTimeout(this.timer)
  }

  askChangeView() {
    const changeViewMessage = {
      view: this.state.view + 1,
      n: this.checkpoint.n
    }
    const sig = this.id.sign(changeViewMessage)
    this.isChangingView = true

    const data = {
      msg: changeViewMessage,
      sig: sig,
      i: this.i
    }

    this.dieTimeout = setTimeout(this.emit.bind(this), 2 * TIMEOUT, 'suicide')

    log('trigger change-view')
    this.emit('view-change', data)

    return this.handleViewChange(data)
  }

  handleViewChange(data) {
    const msg = data.msg
    const sig = data.sig

    if (!Identity.verifySig(msg, sig, this.peers[data.i]))
    {
      logDebug('msg: %O', msg)
      logDebug('sig: %s', sig)
      logDebug('peer: %d', this.peers[data.i])
      throw new Error('wrong change view data signature')
    }

    if (msg.view !== this.state.view + 1 || msg.n !== this.checkpoint.n)
      throw new Error('incorrect data in change view message')

    log('change-view received')

    this.changeViewList.add(this.peers[data.i])

    const changeViewSize = this.changeViewList.size
    const MinNonFaulty = (2 / 3) * this.state.nbNodes

    if (changeViewSize >= MinNonFaulty) {

      const newData = {
        msg: msg,
        sig: this.id.sign(msg),
        i: this.i
      }
      this.isChangingView = true
      this.emit('new-view', newData)

      return this.handleNewView(newData)
    }
  }

  handleNewView(data) {
    if (!this.isChangingView)
      return

    const msg = data.msg
    const sig = data.sig

    if (!Identity.verifySig(msg, sig, this.peers[data.i]))
      throw new Error('wrong new view data signature')

    if (msg.view !== this.state.view + 1 || msg.n !== this.checkpoint.n) {
      logDebug('msg view: %d, state view + 1: %d', msg.view, this.state.view + 1)
      logDebug('msg n: %d, checkpoint n: %d', msg.n, this.checkpoint.n)
      throw new Error('incorrect data in change view message')
    }

    this.newViewList.add(this.peers[data.i])
    const newViewListSize = this.newViewList.size
    const maxFaultyNodes = (1 / 3) * this.state.nbNodes

    if (newViewListSize > maxFaultyNodes) {
      log('changing view...')
      this.state = this.checkpoint.state
      this.state.view++
      let chain = this.blockchain.chain.slice(0, this.checkpoint.n)
      console.log(this.checkpoint.n)
      console.log(chain)
      this.blockchain = new Blockchain(chain)

      this.pendingTxs = []
      this.transactionQueue = []

      this.receivedStatesHash = []
      this.receivedKeys = new Set()

      this.transactionDic = []

      this.prepareListBlock = new Set()
      this.commitListBlock = new Set()

      this.checkpointList = new Set()
      this.changeViewList = new Set()
      this.newViewList = new Set()

      this.onTransaction = false
      this.isMining = false
      this.isChangingView = false

      this.pendingBlock = null
      this.pendingBlockSig = null
      clearTimeout(this.dieTimeout)

      this.stopMining()
      if (this.i === this.state.view % this.state.nbNodes)
        this.startMining()

      this.isChangingView = false
    }
  }

  getBalance(key) {
    return this.state.accounts[key] || 0
  }

  isMasterPeer() {
    return this.i === this.state.view % this.state.nbNodes
  }

  suicide() {
    this.emit('suicide')
  }



}
