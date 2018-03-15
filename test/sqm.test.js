import ether from 'zeppelin-solidity/test/helpers/ether';
import expectThrow from 'zeppelin-solidity/test/helpers/expectThrow';

const AltToken = artifacts.require('./AltToken.sol')
const SQM1Token = artifacts.require('./SQM1Token.sol')
const SQM1Crowdsale = artifacts.require('./SQM1Crowdsale.sol')
const UserRegistry = artifacts.require('./UserRegistry.sol')

function setFlags (crowdsale, flags, sig) {
  const flagsMap = {
    whitelisted: 0,
    knownOnly: 1,
    amountBonus: 2,
    earlyBonus: 3,
    refundable: 4,
    tokenExcange: 5,
    allowToIssue: 6,
    disableEther: 7,
    extraDistribution: 8,
    transferShipment: 9,
    cappedInEther: 10,
    personalBonuses: 11,
    allowClaimBeforeFinalization: 12
  }

  let flagArgs = Array(Object.keys(flagsMap).length).fill().map(e => false)
  for (let key in flags) {
    if (typeof flagsMap[key] === 'undefined') {
      throw new Error(`undefined arg key: ${key}`)
    }

    flagArgs[flagsMap[key]] = true
  }

  sig = sig || {}

  return crowdsale.setFlags(...flagArgs, sig)
}

function numberToBytearray(long, size) {
  // we want to represent the input as a 8-bytes array
  const byteArray = Array(size).fill(0);

  for (let index = byteArray.length - 1; index >= 0; index-- ) {
      let byte = long & 0xff;
      byteArray[index] = byte;
      long = (long - byte) / 256 ;
  }

  return byteArray;
}

function toHex(bytes) {
  let out = '0x'
  for (let index = 0; index < bytes.length; index++) {
    let byte = bytes[index]
    out += ('00' + (byte & 0xFF).toString(16)).slice(-2)
  }
  
  return out
}

function toBytes(bn) {
  bn = bn.toNumber ? bn.toNumber() : bn
  return toHex(numberToBytearray(bn, 32))
}

function hexToBytes(hexString) {
  let out = []
  for(let index = 2; index < hexString.length; index += 2) {
    out.push(`0x${hexString[index]}${hexString[index+1]}`)
  }

  return out
}

contract('SQM1 crowdsale', ([owner, buyer, someOne]) => {
  let crowdsale, sqm, alt, registry

  it('setup tests', async () => {
    registry = UserRegistry.at(UserRegistry.address)
    alt = AltToken.at(AltToken.address)
    await alt.mint(owner, ether(1e6))
    await alt.mint(buyer, ether(1e6))

    sqm = SQM1Token.at(SQM1Token.address)
    crowdsale = SQM1Crowdsale.at(SQM1Crowdsale.address)

    let balance
    balance = await sqm.balanceOf(crowdsale.address)
    console.log(balance.toString(10))
    await registry.addSystem(crowdsale.address, { from: owner })
    await sqm.transfer(crowdsale.address, 10000, { from: owner })
    balance = await sqm.balanceOf(crowdsale.address)
    console.log(balance.toString(10))
    await crowdsale.saneIt()
  })

  it('should reject buy from unkown buyer', async () => {
    const rate = await crowdsale.tokensValues(alt.address)
    const bytes = toBytes(rate)
    await expectThrow(alt.approveAndCall(crowdsale.address, ether(10), bytes, { from: buyer }))
  })

  it('should allow to buy', async () => {
    await registry.addAddress(buyer, { from: owner })
    const rate = await crowdsale.tokensValues(alt.address)
    const bytes = toBytes(rate)
    await alt.approveAndCall(crowdsale.address, ether(1), bytes, { from: buyer })
  })
  
  it('should reject buy with ether', async () => {
    await expectThrow(crowdsale.buyTokens(buyer, { value: ether(1), from: buyer }))
  })

  it('should left decimal part', async () => {
    const rate = await crowdsale.tokensValues(alt.address)
    const bytes = toBytes(rate)

    const initialBalanceALT = await alt.balanceOf(buyer)
    const initialBalanceSQM = await sqm.balanceOf(buyer)
    await alt.approveAndCall(crowdsale.address, ether(1.35), bytes, { from: buyer })
    const afterBalanceALT = await alt.balanceOf(buyer)
    const afterBalanceSQM = await sqm.balanceOf(buyer)

    assert.equal(-1.3, afterBalanceALT.sub(initialBalanceALT).div(1e18).toNumber())
    assert.equal(13, afterBalanceSQM.sub(initialBalanceSQM).toNumber())
  })
})