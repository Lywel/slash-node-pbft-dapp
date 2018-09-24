import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Badge,
  Table,
  Form,
  FormGroup,
  Label,
  Input,
  Alert,
  Modal,
  ModalFooter,
  ModalBody,
  ModalHeader,
  Button } from 'reactstrap'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import { fetchBlocks } from '../actions/index'

class Blockchain extends Component {
  constructor(props) {
    super(props)
    this.state = {
      selectedBlock: 0,
      modal: false,
      searchWord: 'tx',
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

  handleFormChange = name => evt => {
    this.setState({ [name]: evt.target.value })
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

    const blocksElements = this.props.blocks
      .filter(block => {
        if (!this.state.searchWord.length)
          return true

        if (this.state.searchWord.startsWith('#'))
          return block.index === parseInt(this.state.searchWord.substr(1), 10)

        if (this.state.searchWord.startsWith('tx:')) {
          const minTx = parseInt(this.state.searchWord.substr(3), 10) || 1
          return block.data.length >= minTx
        }

        if (this.state.searchWord.startsWith('tx'))
          return block.data.length > 0

        return block.index.toString().includes(this.state.searchWord)
          || block.hash.toString().includes(this.state.searchWord)
          || block.prevHash.toString().includes(this.state.searchWord)
      })
      .map(block => (
        <tr key={ block.index }
            onClick={ this.openDetails(block.index) }>
          <th>{ block.index }</th>
          <td>{ '0x' + block.hash.toString().substr(0, 20) + '...' }</td>
          <td>{ '0x' + block.prevHash.toString().substr(0, 20) + '...' }</td>
          <td>{ block.data.length }</td>
        </tr>
      ))
      .reverse()

    const currentBlock = this.props.blocks[this.state.selectedBlock]

    return (
      <div>
        <Modal isOpen={this.state.modal} toggle={this.closeModal} size='lg'>
          <ModalHeader toggle={this.toggle}>Block #{ this.state.selectedBlock }</ModalHeader>
          <ModalBody>
            <Table striped responsive size='lg' bordered>
              <tbody>
                <tr>
                  <td>Hash</td>
                  <td>0x{ currentBlock.hash }</td>
                </tr>
                <tr>
                  <td>Previous</td>
                  <td>0x{ currentBlock.prevHash }</td>
                </tr>
                </tbody>
            </Table>
            <h3>Block data</h3>
            {
              (() => {
                if (currentBlock.data.length) {
                  const blocks = currentBlock.data.map((data, id) => (
                    <tr key={'req' + id}>
                      <th>
                        From:<br />
                        To:
                      </th>
                      <td>
                        <Badge>{ data.request.tx.from }</Badge><br/>
                        <Badge>{ data.request.tx.to }</Badge>
                      </td>
                      <td>{ data.request.tx.amount }</td>
                      <td>{
                        (new Date(data.request.timestamp))
                          .toLocaleString('en-GB', { timeZone: 'UTC' })
                      }</td>
                      <td>{
                        data.valid
                          ? <FontAwesomeIcon icon="check-circle" />
                          : <FontAwesomeIcon icon="times-circle" />
                      }</td>
                    </tr>
                  ))

                  return (
                    <Table striped responsive bordered size='lg'>
                      <thead>
                        <tr>
                          <th></th>
                          <th></th>
                          <th>Amount</th>
                          <th>Date</th>
                          <th>Valid</th>
                        </tr>
                      </thead>
                      <tbody>
                        { blocks }
                      </tbody>
                    </Table>
                  )
                } else
                  return <p>No transactions on this block.</p>
              })()
            }
            <h3>Accounts</h3>
            <Table responsive size='sm' bordered>
              <tbody>
              {
                Object.entries(currentBlock.state.accounts).map(([key, balance]) => (
                  <tr key={ key }>
                    <th><Badge>{ key }</Badge></th>
                    <td>{ balance.toFixed(4) }</td>
                  </tr>
                ))
              }
              </tbody>
            </Table>
            <h3>Network state <small>(advanced)</small></h3>
            <Table responsive size='sm' bordered>
              <tbody>
                <tr>
                  <th>View</th>
                  <td>{ currentBlock.state.view }</td>
                </tr>
                <tr>
                  <th>Sequence number</th>
                  <td>{ currentBlock.state.seqNb }</td>
                </tr>
                <tr>
                  <th>Sequence number lower bound</th>
                  <td>{ currentBlock.state.h }</td>
                </tr>
                <tr>
                  <th>Numer of nodes</th>
                  <td>{ currentBlock.state.nbNodes }</td>
                </tr>
              </tbody>
            </Table>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" onClick={this.closeModal}>Close</Button>
          </ModalFooter>
        </Modal>
        <h3>The blockchain{' '}
          <Button color="link" size="sm" onClick={ this.props.fetchBlocks }>[Refresh]</Button>
        </h3>
        <Form inline>
          <FormGroup>
            <Label for='searchWord' className='mr-sm-3'>Search:</Label>
            <Input type='text' name='searchWord'
              value={this.state.searchWord}
              onChange={this.handleFormChange('searchWord')} />
          </FormGroup>
        </Form>
        <Table striped responsive className='mt-sm-3'>
          <thead>
            <tr>
              <th>#</th>
              <th>Block hash</th>
              <th>Previous hash</th>
              <th>Number of Tx</th>
            </tr>
          </thead>
          <tbody>
          { blocksElements }
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
