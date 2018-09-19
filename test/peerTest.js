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

    return peer.handleRequest(validMsg, sig).should.be
      .rejectedWith(Error, 'Wrong signature on client\'s request')
  })

  it('Should not throw on valid sig', () => {
    const sig = id.sign(validMsg).signature
    return peer.handleRequest(validMsg, sig).should.be.fulfilled
  })

  it('Should emit a \'pre-prepare\' event on succed', () => {
    const evt = peer.should.emit('pre-prepare')
    const sig = id.sign(validMsg).signature
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
    const sig = id.sign(validPayload).signature
    peer.peers.push(id.publicKey)

    expect(() => {
      peer.handlePrePrepare(validPayload, sig, validMsg)
    }).not.to.throw()
  })

  it('Should emit a \'prepare\' event on succed', () => {
    const evt = peer.should.emit('prepare')
    const sig = id.sign(validPayload).signature
    peer.peers.push(id.publicKey)
    peer.handlePrePrepare(validPayload, sig, validMsg)
    return evt
  })

})
