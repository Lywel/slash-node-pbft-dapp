import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Table,
  Alert,
  Modal,
  ModalBody,
  ListGroup,
  ListGroupItem,
  ModalFooter,
  ModalHeader,
  Button } from 'reactstrap'

import { fetchBlocks } from '../actions/index'

class Blockchain extends Component {
  constructor(props) {
    super(props)
    this.state = {
      selectedBlock: 0,
      modal: false
    }
  }

  componentDidMount() {
    this.props.fetchBlocks()
  }

  openDetails = blockId => () => {
    this.setState({
      selectedBlock: blockId,
      modal: true
    })
  }

  closeModal = () => {
    this.setState({
      modal: false
    })
  }

  render() {
    if (this.props.error)
      return (
        <Alert color="danger">
          { this.props.error.message }
        </Alert>
      )

    if (this.props.loading || !this.props.blocks.length)
      return (
        <Alert color="info">
          Fetching blocks...
        </Alert>
      )

    const createBlocksElements = () => {
      const blocksElements = []

      for (const block of this.props.blocks) {
        blocksElements.push(
          <tr key={ block.index }
              onClick={ this.openDetails(block.index) }>
            <th>{ block.index }</th>
            <td>{ '0x' + block.hash.toString().substr(0, 20) + '...' }</td>
            <td>{ '0x' + block.prevHash.toString().substr(0, 20) + '...' }</td>
            <td>{ block.data.length }</td>
          </tr>
        )
      }

      return blocksElements
    }

    const currentBlock = this.props.blocks[this.state.selectedBlock]
    console.log(this.props.blocks)

    return (
      <div>
        <Modal isOpen={this.state.modal} toggle={this.closeModal} size='lg'>
          <ModalHeader toggle={this.toggle}>Block #{ this.state.selectedBlock }</ModalHeader>
          <Table striped responsive size='lg'>
            <tbody>
              <tr>
                <td>Index</td>
                <td>{ currentBlock.index }</td>
              </tr>
              <tr>
                <td>Hash</td>
                <td>0x{ currentBlock.hash }</td>
              </tr>
              <tr>
                <td>Previous</td>
                <td>0x{ currentBlock.prevHash }</td>
              </tr>
              <tr>
                <td>data</td>
                <td><pre>{ JSON.stringify(currentBlock.data, null, 2) }</pre></td>
              </tr>
              <tr>
                <td>state</td>
                <td><pre>{ JSON.stringify(currentBlock.state, null, 2) }</pre></td>
              </tr>
            </tbody>
          </Table>
          <ModalFooter>
            <Button color="secondary" onClick={this.closeModal}>Close</Button>
          </ModalFooter>
        </Modal>
        <h3>The blockchain{' '}
          <Button color="link" size="sm" onClick={ this.props.fetchBlocks }>[Refresh]</Button>
        </h3>
        <Table striped responsive>
          <thead>
            <tr>
              <th>#</th>
              <th>Block hash</th>
              <th>Previous hash</th>
              <th>Number of Tx</th>
            </tr>
          </thead>
          <tbody>
          { createBlocksElements().reverse() }
          </tbody>
        </Table>
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

export default connect(mapStateToProps, mapDispatchToProps)(Blockchain)
