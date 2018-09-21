import React, { Component } from 'react'
import { connect } from 'react-redux'

import {
  Container,
  } from 'reactstrap'
import Blockchain from './components/Blockchain'
import BCClient from './components/BCClient'

import logo from './logo.svg'
import './App.css'

import { library } from '@fortawesome/fontawesome-svg-core'
import {
  faCheckCircle,
  faTimesCircle,
} from '@fortawesome/free-solid-svg-icons'

library.add(faCheckCircle, faTimesCircle)

const mapStateToProps = state => ({
 ...state
})

const mapDispatchToProps = dispatch => ({
 //simpleAction: () => dispatch(simpleAction())
})

class App extends Component {
  simpleAction = (event) => {
    this.props.simpleAction()
  }

  render() {
    return (
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h1 className="App-title">Welcome the BLOCKCHAIN</h1>
        </header>
        <Container>
          <BCClient />
          <Blockchain style={{ width: '100%'}}/>
        </Container>
      </div>
    )
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(App)
