import Endpoint from './endpoint'

export class Peer {
    constructor() {
        this.blockchain = new Blockchain()
        this.txStack = []
        this.endpoint = new Endpoint()
        this.endpoint.bci.getBlocks = async () => {
            return this.blockchain.chain
        }
        this.endpoint.addTx = async (tx) => {
            txStack.push(tx)
        }
        this.endpoint.start()

    }

    checkTx() {
        let transactionList = {}
        transactionList["root"] = 100

        this.blockchain.chain.forEach(block => {
            block.data.forEach(tx => {
                if (tx.valid === false)
                    continue

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
                transactionList[to.from] -= tx.amount
            }
            else
                resData.push({...tx, ok: false})
        })
        return resData
    }
}
