import { randomBytes, createHash } from 'crypto'
import secp256k1 from 'secp256k1'

export class Identity {
  constructor(privateKey, publicKey) {
    this._privateKey = privateKey || Identity.genPrivateKey()
    this._publicKey = publicKey || secp256k1.publicKeyCreate(this._privateKey)
  }

  get publicKey() {
    return this._publicKey.toString('base64')
  }

  sign(obj) {
    const hash = Buffer.from(Identity.hash(obj), 'base64')
    return secp256k1.sign(hash, this._privateKey).signature.toString('base64')
  }

  static hash(obj) {
    return createHash('sha256').update(JSON.stringify(obj)).digest().toString('base64')
  }

  verify(obj, sig) {
    return Identity.verifySig(obj, sig, this.publicKey)
  }

  static verifySig(obj, sig, publicKey) {
    try {
      return secp256k1.verify(
        Buffer.from(Identity.hash(obj), 'base64'),
        Buffer.from(sig, 'base64'),
        Buffer.from(publicKey, 'base64'))
    } catch (err) {
      return false
    }
  }

  static verifyHash(obj, hash) {
    return Identity.hash(obj) === hash
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
