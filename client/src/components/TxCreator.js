import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Badge,
  Alert,
  Card,
  FormGroup,
  Label,
  Input,
  Button,
  Progress,
  Modal,
  ModalHeader,
  ModalBody,
} from 'reactstrap'

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
      ready: false,
      txSent: false,
      txValid: false,
      txInvalid: false,
      msg: false,
      sig: false
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
      case 'reply':
        if (this.state.msg) {
          console.log(msg.data.result)
          setTimeout(() => {
            if (msg.data.result.valid)
              this.setState({ txValid: true })
            else
              this.setState({ txInvalid: true })
          }, 800)
        }
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

      this.setState({ msg })

      const sig = this.sign(msg)

      setTimeout(() => this.setState({ sig }), 200)

      this.ws.send(JSON.stringify({
        type: 'request',
        data: { msg, sig }
      }))

      setTimeout(() => this.setState({ txSent: true }), 400)
    }
  }

  toggleModal = () => {
    this.setState({ msg: null, sig: null, txSent: false, txValid: false, txInvalid: false })
  }


  render() {
    const { connected, ready } = this.state
    const pillColor = connected ? (ready ? 'success' : 'warning') : 'danger'
    const pillMsg = connected ? (ready ? 'ready' : 'connected'): 'disconnected'

    const modalProgress = (1
      + !!this.state.sig
      + !!this.state.txSent
      + !!(this.state.txValid || this.state.txInvalid)) * 25

    const modal = (
      <Modal isOpen={ (!!this.state.msg) } toggle={this.toggleModal}>
        <ModalHeader>
          New transaction
        </ModalHeader>
        <ModalBody>
          <Progress
            animated={ modalProgress !== 100 }
            color={ modalProgress < 100 ? 'info'
              : (this.state.txValid ? 'success' : 'danger')}
            value={ modalProgress } />

            <Alert isOpen={ !!this.state.sig } color='info' className='mt-3'>
              Transaction signed
            </Alert>
            <Alert isOpen={ !!this.state.txSent } color='info'>
              Transaction sent to the network
            </Alert>
            <Alert isOpen={ this.state.txValid } color='success'>
              Transaction accepted. It should be visible in the next block.
            </Alert>
            <Alert isOpen={ this.state.txInvalid } color='danger'>
              Transaction refused. It should be visible in the next block.
            </Alert>
        </ModalBody>
      </Modal>
    )

    return (
      <div>
      { modal }
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
