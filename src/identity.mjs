import { randomBytes, createHash } from 'crypto'
import secp256k1 from 'secp256k1'

export class Identity {
  constructor(privateKey, publicKey) {
    this.privateKey = privateKey || Identity.genPrivateKey()
    this.publicKey = publicKey || secp256k1.publicKeyCreate(this.privateKey)
    console.log(this.privateKey, this.publicKey)
  }

  sign(obj) {
    return secp256k1.sign(Identity.hash(obj), this.privateKey)
  }

  verify(obj, sig) {
    return Identity.verifySig(obj, sig, this.publicKey)
  }

  static verifySig(obj, sig, publicKey) {
    return secp256k1.verify(Identity.hash(obj), sig, publicKey)
  }

  static verifyHash(obj, hash) {
    return Identity.hash(obj).equals(hash)
  }

  static hash(obj) {
    const hash = createHash('sha256').update(JSON.stringify(obj)).digest()
    return Buffer.from(hash)
  }

  static genPrivateKey() {
    let key

    do {
      key = randomBytes(32)
    } while(!secp256k1.privateKeyVerify(key))

    return key
  }

  static fromFile(path) {
    return new Identity()
  }
}
/*
const tx = {
  from: 'root',
  to: 'moi',
  amount: 12,
  msg: 'test'
}

const id = new Identity()

const sig = id.sign(tx).signature

console.log(sig)
console.log(Identity.verify(tx, sig, id.publicKey))
*/
