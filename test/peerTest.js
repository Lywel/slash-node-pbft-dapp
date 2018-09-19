import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiEvents from 'chai-events'

import { Peer } from '../src/peer'
import { Identity } from '../src/identity'

import crypto from 'crypto'

chai.use(chaiAsPromised)
chai.use(chaiEvents)
chai.should()

describe('Peer handleRequest', () => {
  let peer = null
  let id = null
  let validMsg = {
    tx: {
      from: '0',
      to: '0',
      amount: 3
    },
    timestamp: Date.now(),
    client: null,
  }

  beforeEach(() => {
    peer = new Peer()
    id = new Identity()
    validMsg.client = id.publicKey
  })

  it('Should reject on wront sig', () => {
    const sig = crypto.randomBytes(32)

    expect(() => {
      peer.handleRequest(validMsg, sig)
    }).to.throw(Error, 'Wrong signature on client\'s request')
  })

  it('Should not throw on valid sig', () => {
    const sig = id.sign(validMsg)
    expect(() => {
      peer.handleRequest(validMsg, sig)
    }).to.not.throw()
  })

  it('Should emit a \'pre-prepare\' event on succed', () => {
    const evt = peer.should.emit('pre-prepare')
    const sig = id.sign(validMsg)
    peer.handleRequest(validMsg, sig)
    return evt
  })
})

describe('Peer handlePrePrepare', () => {
  let peer = null
  let id = null
  let validMsg = {
    tx: {
      from: '0',
      to: '0',
      amount: 3
    },
    timestamp: Date.now(),
    client: null,
  }

  let validPayload = {
    view: 0,
    seqNb: 0,
    digest: null
  }

  beforeEach(() => {
    peer = new Peer()
    id = new Identity()
    validMsg.client = id.publicKey
    validPayload.digest = Identity.hash(validMsg)
  })

  it('Should throw on wrong sig', () => {
    const sig = crypto.randomBytes(32)
    expect(() => {
      peer.handlePrePrepare(validPayload, sig, validMsg)
    }).to.throw(Error, 'Invalid payload\'s sig')
  })

  it('Should accept a valid sig', () => {
    const sig = id.sign(validPayload)
    peer.peers.push(id.publicKey)

    expect(() => {
      peer.handlePrePrepare(validPayload, sig, validMsg)
    }).not.to.throw()
  })
})

describe('Peer handlePrepare', () => {
  let peer = null
  let id = null
  let validMsg = {
    tx: {
      from: '0',
      to: '0',
      amount: 3
    },
    timestamp: Date.now(),
    client: null,
  }

  let validPayload = {
    view: 0,
    seqNb: 0,
    digest: null
  }

  beforeEach(() => {
    peer = new Peer()
    id = new Identity()
    validMsg.client = id.publicKey
    peer.message = validMsg
    validPayload.digest = Identity.hash(validMsg)
    validPayload.i = 0
    peer.state.nbNodes = 4
    peer.prepareList = new Set()
    peer.prepareList.add('0')
    peer.prepareList.add('1')

  })

  it('Should accept a valid sig', () => {
    const sig = id.sign(validPayload)
    peer.peers.push(id.publicKey)
    expect(() => {
      peer.handlePrepare(validPayload, sig)
    }).not.to.throw()
  })

  it('Should reject msg on wrong seq number', () => {
    peer.peers.push(id.publicKey)
    peer.state.h = 1
    const sig = id.sign(validPayload)

    expect(() => {
      peer.handlePrepare(validPayload, sig)
    }).to.throw(Error, 'sequence number is lower than h')
  })


  it('Should emit a commit event on valid request', () => {
    const evt = peer.should.emit('commit')
    const sig = id.sign(validPayload)
    peer.peers.push(id.publicKey)
    peer.handlePrepare(validPayload, sig)
    return evt
  })
})


describe('Peer handleCommit', () => {
  let peer = null
  let id = null
  let validMsg = {
    tx: {
      from: '1',
      to: '0',
      amount: 3
    },
    timestamp: Date.now(),
    client: null,
  }

  let validPayload = {
    view: 0,
    seqNb: 0,
    digest: null
  }

  beforeEach(() => {
    peer = new Peer()
    id = new Identity()
    validMsg.client = id.publicKey
    peer.message = validMsg
    validPayload.digest = Identity.hash(validMsg)
    validPayload.i = 0
    peer.state.nbNodes = 4
    peer.commitList = new Set()
    peer.commitList.add('0')

  })

  it('Should accept a valid sig', () => {
    const sig = id.sign(validPayload)
    peer.peers.push(id.publicKey)
    expect(() => {
      peer.handleCommit(validPayload, sig)
    }).not.to.throw()
  })

  it('Should reject msg on wrong seq number', () => {
    peer.peers.push(id.publicKey)
    peer.state.h = 1
    const sig = id.sign(validPayload)

    expect(() => {
      peer.handleCommit(validPayload, sig)
    }).to.throw(Error, 'sequence number is lower than h')
  })

  it('Should emit a \'reply\' event on succed', () => {
    const evt = peer.should.emit('reply')
    const sig = id.sign(validPayload)
    peer.peers.push(id.publicKey)
    peer.handleCommit(validPayload, sig)
    return evt
  })
})


describe('Peer mine', () => {
  let peer = null
  let id = null

  beforeEach(() => {
    peer = new Peer()
    id = new Identity()
  })

  it('Should emit pre prepare block event', () => {
    const evt = peer.should.emit('pre-prepare-block')
    peer.peers.push(id.publicKey)
    peer.mine()
    return evt
  })
})


describe('Peer PrePrepareBlock', () => {
  let peer = null
  let id = null
  let block = null
  let blockSig = null

  beforeEach(() => {
    peer = new Peer()
    id = new Identity()
    block = peer.buildNextBlock()
    blockSig = id.sign(block)
  })


  it('Should emit prepare block event', () => {
    const evt = peer.should.emit('prepare-block')
    peer.peers.push(id.publicKey)
    console.log(peer.peers[peer.state.view % peer.state.nbNodes])
    peer.handlePrePrepareBlock(block, blockSig)
    return evt
  })

  it('Should throw on wrong sig', () => {
    const sig = crypto.randomBytes(32)
    peer.peers.push(id.publicKey)
    peer.pendingBlock = block
    peer.pendingBlockSig = sig
    expect(() => {
      peer.handlePrePrepareBlock(block, sig)
    }).to.throw(Error, 'Block signature is invalid')
  })




})

chai.should()
