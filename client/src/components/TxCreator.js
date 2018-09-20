import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Badge,
  Card,
  FormGroup,
  Label,
  Input,
  Button
  } from 'reactstrap'

//import { fetchBlocks } from '../actions/index'
import secp256k1 from 'secp256k1'
import { createHash } from 'crypto'

class TxCreator extends Component {
  constructor(props) {
    super(props)
    this.state = {
      txFrom: '0',
      txTo: this.props.id.publicKey,
      txAmount: 0,
      connected: false,
      ready: false
    }
  }

  componentDidMount() {
    this.ws = new WebSocket('ws://localhost:3001/')
    this.ws.onopen = () => {
      this.setState({ connected: true })
    }
    this.ws.onclose = () => {
      this.setState({ connected: false })
    }
    this.ws.onmessage = evt => {
      const msg = JSON.parse(evt.data)
      console.log(`Peer send an '${msg.type}' msg`)
      switch (msg.type) {
      case 'info':
        this.setState({ ready: true })
        break
      default:
        console.log(`'${msg.type}' msg are not handled`)
      }
    }
  }

  sign(obj) {
    const hash = Buffer.from(this.hash(obj), 'base64')
    const privateKey = Buffer.from(this.props.id.privateKey, 'base64')
    return secp256k1.sign(hash, privateKey).signature.toString('base64')
  }

  hash(obj) {
    return createHash('sha256').update(JSON.stringify(obj)).digest().toString('base64')
  }

  handleFormChange = name => evt => {
    this.setState({ [name]: evt.target.value })
  }

  sendRequest = () => {
    if (this.state.ready) {
      const msg = {
        tx: {
          from: this.state.txFrom,
          to: this.state.txTo,
          amount: this.state.txAmount
        },
        timestamp: Date.now(),
        client: this.props.id.publicKey
      }

      const sig = this.sign(msg)
      console.log('checksum: ', this.hash(msg))

      this.ws.send(JSON.stringify({
        type: 'request',
        data: { msg, sig }
      }))
    }
  }


  render() {
    const { connected, ready } = this.state
    const pillColor = connected ? (ready ? 'success' : 'warning') : 'danger'
    const pillMsg = connected ? (ready ? 'ready' : 'connected'): 'disconnected'

    return (
      <div>
        <h2>Transfer creator{' '}
          <small><Badge pill color={ pillColor }>{ pillMsg }</Badge></small>
        </h2>
        <Card body>
          <FormGroup>
            <Label for="txFrom">From:</Label>
            <Input type="text" name="txFrom"
              value={this.state.txFrom}
              onChange={this.handleFormChange('txFrom')} />
          </FormGroup>
          <FormGroup>
            <Label for="txTo">To:</Label>
            <Input type="text" name="txTo"
              value={this.state.txTo}
              onChange={this.handleFormChange('txTo')} />
          </FormGroup>
          <FormGroup>
            <Label for="txAmount">Amount:</Label>
            <Input type="number" name="txAmount"
              value={this.state.txAmount}
              onChange={this.handleFormChange('txAmount')} />
          </FormGroup>
          <Button onClick={this.sendRequest}>Make it crash</Button>
        </Card>
      </div>
    )
  }
}

const mapStateToProps = state => ({
})

const mapDispatchToProps = dispatch => ({
})

export default connect(mapStateToProps, mapDispatchToProps)(TxCreator)
