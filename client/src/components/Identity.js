import React, { Component } from 'react'
import { connect } from 'react-redux'
import secp256k1 from 'secp256k1'
import {
  ListGroup,
  ListGroupItem,
  Badge,
  Input,
  Button,
  } from 'reactstrap'

import { fetchBlocks } from '../actions/index'

class Identity extends Component {

  savePrivateKey = () => {
    const der = secp256k1.privateKeyExport(
      Buffer.from(this.props.id.privateKey, 'base64'),
      true
    )

    let el = document.createElement('a')
    el.setAttribute('href', 'data:text/plain;charset=utf-8,'
      + encodeURIComponent(der.toString('base64')))
    el.setAttribute('download', 'privateKey.der')
    el.style.display = 'none'
    document.body.appendChild(el)
    el.click()
    document.body.removeChild(el)
  }

  loadPrivateKey = () => {
    const input = document.querySelector('#derInput')
    input.click()
  }

  readPrivateKey = (evt) => {
    const reader = new FileReader()

    reader.onload = evt => {
        if (evt.target.readyState !== 2)
          return
        if (evt.target.error)
          return console.error('Error while reading file')

        const der = Buffer.from(evt.target.result, 'base64')
        const privKey = secp256k1.privateKeyImport(der).toString('base64')
        this.props.updateId(privKey)
        this.props.fetchBlocks()
    }

    reader.readAsText(evt.target.files[0])
  }

  render() {
    const block = this.props.blocks[this.props.blocks.length - 1]
    let balance = 0
    if (block)
      balance = block.state.accounts[this.props.id.publicKey] || 0

    return (
      <div>
        <h2>Identity</h2>
        <ListGroup>
          <ListGroupItem>Blance{' '}
            <Badge> { balance } </Badge>
          </ListGroupItem>
          <ListGroupItem>Public{' '}
            <Badge>{ this.props.id.publicKey }</Badge>
          </ListGroupItem>
          <ListGroupItem>Private{' '}
            <Badge>{ this.props.id.privateKey }</Badge>
          </ListGroupItem>
          <ListGroupItem>
            <Button onClick={ this.savePrivateKey } color='primary'>Save to file</Button>
            <Button onClick={ this.loadPrivateKey } color='info' className='ml-3'>Load from file</Button>
            <Input
              onChange={ this.readPrivateKey }
              type="file"
              name="derInput"
              id="derInput"
              style={{ display: 'none'}}
              accept=".der" />
          </ListGroupItem>
        </ListGroup>
      </div>
    )
  }
}

const mapStateToProps = state => ({
  blocks: state.blocks,
  loading: state.loading,
  error: state.error
})

const mapDispatchToProps = dispatch => ({
  fetchBlocks: () => dispatch(fetchBlocks())
})

export default connect(mapStateToProps, mapDispatchToProps)(Identity)
