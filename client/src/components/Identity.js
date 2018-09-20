import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  ListGroup,
  ListGroupItem,
  Badge,
  } from 'reactstrap'

class Identity extends Component {
  render() {
    return (
      <div>
        <h2>Identity</h2>
        <ListGroup>
          <ListGroupItem>Public{' '}
            <Badge>{ this.props.id.publicKey }</Badge>
          </ListGroupItem>
          <ListGroupItem>Private{' '}
            <Badge>{ this.props.id.privateKey }</Badge>
          </ListGroupItem>
        </ListGroup>
      </div>
    )
  }
}

const mapStateToProps = state => ({
})

const mapDispatchToProps = dispatch => ({
})

export default connect(mapStateToProps, mapDispatchToProps)(Identity)
