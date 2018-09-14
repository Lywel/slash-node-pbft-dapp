import { Endpoint } from './endpoint'
import { Blockchain} from './blockchain'

export class Peer {
    constructor() {
        this.blockchain = new Blockchain()
        this.txStack = []
        this.endpoint = new Endpoint()
        this.endpoint.bci.getBlocks = async () => {
            return this.blockchain.chain
        }
        this.endpoint.bci.addTx = async (tx) => {
            this.txStack.push(tx)
            console.log('💸 transaction stacked', tx)
        }
        this.endpoint.start()

        this.startMining()
    }

    checkTx() {
        let transactionList = {}
        transactionList["root"] = 100

        this.blockchain.chain.forEach(block => {
            block.data.forEach(tx => {
                if (tx.valid === false)
                    return

                transactionList[tx.from] = transactionList[tx.from] || 0
                transactionList[tx.to] = transactionList[tx.to] || 0

                transactionList[tx.from] -= tx.amount
                transactionList[tx.to] += tx.amount
            })
        })

        let resData = []
        this.txStack.forEach(tx => {
            transactionList[tx.to] = transactionList[tx.to] || 0
            transactionList[tx.from] = transactionList[tx.from] || 0
            if (transactionList[tx.from] - tx.amount >= 0) {
                resData.push({...tx, ok: true})
                transactionList[tx.to] += tx.amount
                transactionList[tx.from] -= tx.amount
            }
            else
                resData.push({...tx, ok: false})
        })
        return resData
    }

    mine() {
        const data = this.checkTx()
        this.txStack = []
        console.log('⛏️  block mined', data)
        this.blockchain.addBlock(data)
    }

    startMining() {
        this.minerPid = setInterval(() => this.mine(), 3000)
    }

    stopMining() {
        clearInterval(this.minerPid)
    }
}
