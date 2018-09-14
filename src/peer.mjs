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
        this.endpoint.bci.setBlockchain = (blockchain) => {
            this.blockchain = blockchain
        }

        this.endpoint.bci.checkBlock = (block) => {
            return this.checkBlock(block)
        }

        this.endpoint.bci.addTx = async (tx) => {
            console.log('transaction received')

            if (process.env.MASTER) {
                this.txStack.push(tx)
                console.log('💸 transaction stacked', tx)
            } else {
                console.log('transfering to masterNode', tx)
                this.endpoint.contactMasterNode(tx)
            }
        }
        this.endpoint.start()
        if (process.env.MASTER)
            this.startMining()
    }

    computeBalances() {
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

        return transactionList
    }

    createBlock() {
        let transactionList = this.computeBalances()

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
        return new Block(this.blockchain.chain.length,
            resData,
            this.blockchain.lastBlock().hash,
            Date.now());
    }

    checkBlock(blockToCheck) {
        let transactionList = this.computeBalances()
        let isValid = true
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


    async mine() {
        const block = this.createBlock()
        this.txStack = []

        console.log('Verifying block...')
        const { votes, peers } = await this.endpoint.broadcastBlock(block)
        console.log(votes)

        let trueCount = votes.reduce((a, b) => a + b, 0) + 1

        if (trueCount >= Math.floor((2 / 3) * peers + 1)) {
            console.log('⛏️  Block verified', block.data)
            this.blockchain.chain.push(block)
            // broadcast blockchain
        } else
            console.log('❌ Block invalid', block.data)
    }

    startMining() {
        this.minerPid = setInterval(() => this.mine(), 3000)
    }

    stopMining() {
        clearInterval(this.minerPid)
    }
}
