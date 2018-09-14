import { Endpoint } from './endpoint'
import { Blockchain } from './blockchain'
import { Block } from './blockchain.mjs';

export class Peer {
    constructor() {
        this.blockchain = new Blockchain()
        this.txStack = []
        this.endpoint = new Endpoint()
        this.endpoint.bci.getBlocks = async () => {
            return this.blockchain.chain
        }
        this.endpoint.bci.addTx = async (tx) => {
            console.log('transaction received')

            if (process.env.MASTER) {
                this.txStack.push(tx)
                console.log('💸 transaction stacked', tx)
            } else {
                console.log('contact master node', tx)
                this.endpoint.contactMasterNode(tx)
            }
        }
        this.endpoint.start()
        if (process.env.MASTER)
            this.startMining()
    }

    createBlock() {
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
                resData.push({ ...tx, ok: true })
                transactionList[tx.to] += tx.amount
                transactionList[tx.from] -= tx.amount
            }
            else
                resData.push({ ...tx, ok: false })
        })
        return new Block(resData);
    }

    checkBlock(blockToCheck) {
        let transactionList = {}
        transactionList["root"] = 100

        let isValid = true

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
        blockToCheck.data.forEach(tx => {
            if (tx.valid === false)
                return

            if (transactionList[tx.from] - tx.amount < 0) {
                isValid = false
                return
            }

            transactionList[tx.from] = transactionList[tx.from] || 0
            transactionList[tx.to] = transactionList[tx.to] || 0

            transactionList[tx.from] -= tx.amount
            transactionList[tx.to] += tx.amount
        })

        return isValid

    }


    mine() {
        const data = this.createBlock()
        this.txStack = []
        console.log('broadcast block to peers...')
        let res = broadcastBlock(block)
        let trueCount = res.reduce((acc, cur) => acc + cur, 0)
        if (trueCount >= Math.floor((2 / 3) * res.length + 1)) {
            console.log('⛏️  block mined', data)
            this.blockchain.push(data)
        } else {
            console.log('invalid block :(', data)
        }
    }

    startMining() {
        this.minerPid = setInterval(() => this.mine(), 3000)
    }

    stopMining() {
        clearInterval(this.minerPid)
    }
}
