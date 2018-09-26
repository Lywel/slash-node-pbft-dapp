import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Row,
  Col } from 'reactstrap'

import Identity from './Identity'
import TxCreator from './TxCreator'

import secp256k1 from 'secp256k1'
import { randomBytes } from 'crypto'

class BCClient extends Component {
  constructor(props) {
    super(props)
    this.state = {
      id: null
    }
  }

  genPrivateKey() {
    let key
    do {
      key = randomBytes(32)
    } while(!secp256k1.privateKeyVerify(key))
    return key
  }

  genKeyPair() {
    const privateKey = this.genPrivateKey()
    const publicKey = secp256k1.publicKeyCreate(privateKey)
    return { privateKey, publicKey }
  }

  componentDidMount() {
    const rawKeys = this.genKeyPair()
    const privateKey = rawKeys.privateKey.toString('base64')
    const publicKey = rawKeys.publicKey.toString('base64')
    this.setState({ id: { privateKey, publicKey } })
  }

  updateId = (privateKey) => {
    const publicKey = secp256k1.publicKeyCreate(Buffer.from(privateKey, 'base64')).toString('base64')
    this.setState({ id: { privateKey, publicKey } })
  }

  render() {
    let client = (
      <p>Genrating a new key pair...</p>
    )
    if (this.state.id) {
      client = (
        <Row>
          <Col>
            <Identity id={ this.state.id } updateId={ this.updateId }/>
          </Col>
          <Col>
            <TxCreator id={ this.state.id }/>
          </Col>
        </Row>
      )
    }

    return (
      <div>
        <h1>Blockchain client</h1>
        { client }
      </div>
    )
  }
}

const mapStateToProps = state => ({
})

const mapDispatchToProps = dispatch => ({
})

export default connect(mapStateToProps, mapDispatchToProps)(BCClient)
