import { Blockchain } from './blockchain'

//const block = new Block(1, 123456789, Date.now(), 'daataa', 987654321)

const cyrilCoin = new Blockchain()

console.log(cyrilCoin)
cyrilCoin.addBlock({ from: 'cyril', to: 'maxime', amount: 66, info: 'la thune' })

console.log(cyrilCoin)
cyrilCoin.addBlock({ from: 'cyril', to: 'cyril', amount: 12, info: 'meh' })

console.log(cyrilCoin)
cyrilCoin.addBlock({ from: 'maxime', to: 'cyril', amount: 0.0001, info: 'la richesse' })

console.log(cyrilCoin)

console.log(cyrilCoin.isValid() ? 'the chain is still valid' : 'the chain is corrupted')
