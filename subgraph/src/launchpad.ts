import { BigInt, Address } from "@graphprotocol/graph-ts";

import {
  TokenLaunched as TokenLaunchedEvent,
  TokensPurchased as TokensPurchasedEvent,
  TokensSold as TokensSoldEvent,
  RoyaltiesHarvested as RoyaltiesHarvestedEvent,
  Graduated as GraduatedEvent,
  RTDeposited as RTDepositedEvent,
  RTWithdrawn as RTWithdrawnEvent,
  CreatorPremineClaimed as CreatorPremineClaimedEvent,
  GraduationThresholdUpdated as GraduationThresholdUpdatedEvent,
} from "../generated/SovryLaunchpad/SovryLaunchpad";

import {
  Launchpad,
  WrapperToken,
  User,
  Trade,
  Deposit,
  Harvest,
  GraduationEvent,
  Candle,
  PremineClaim,
  GraduationThresholdUpdate,
} from "../generated/schema";
import { WrapperToken as WrapperTemplate } from "../generated/templates";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getOrCreateLaunchpad(id: string): Launchpad {
  let launchpad = Launchpad.load(id);
  if (launchpad == null) {
    launchpad = new Launchpad(id);
    launchpad.totalTokens = 0;
    launchpad.totalTrades = 0;
    launchpad.totalVolume = BigInt.zero();
    launchpad.totalFees = BigInt.zero();
  }
  return launchpad as Launchpad;
}

function getOrCreateUser(id: string): User {
  let user = User.load(id);
  if (user == null) {
    user = new User(id);
  }
  return user as User;
}

function getOrCreateWrapper(
  launchpadId: string,
  wrapperAddress: Address,
): WrapperToken {
  let id = wrapperAddress.toHex();
  let wrapper = WrapperToken.load(id);
  if (wrapper == null) {
    wrapper = new WrapperToken(id);
    wrapper.launchpad = launchpadId;
    wrapper.rt = Address.zero();
    wrapper.creator = Address.zero();
    wrapper.launchTime = BigInt.zero();
    wrapper.totalLocked = BigInt.zero();
    wrapper.graduated = false;
    wrapper.dexReserve = BigInt.zero();
    wrapper.initialCurveSupply = BigInt.zero();
    wrapper.totalRoyaltiesHarvested = BigInt.zero();
    wrapper.poolAddress = null;
    wrapper.createdAt = BigInt.zero();
    wrapper.updatedAt = BigInt.zero();
  }
  return wrapper as WrapperToken;
}

function updateCandle(
  wrapperAddr: Address,
  timestamp: BigInt,
  price: BigInt,
  volume: BigInt,
): void {
  let timeframes = [60, 900, 3600];

  for (let i = 0; i < timeframes.length; i++) {
    let interval = timeframes[i];
    let candleTimestamp = (timestamp.toI32() / interval) * interval;

    let candleId =
      wrapperAddr.toHex() +
      "-" +
      interval.toString() +
      "-" +
      candleTimestamp.toString();

    let candle = Candle.load(candleId);
    if (candle == null) {
      candle = new Candle(candleId);
      candle.wrapper = wrapperAddr.toHex();
      candle.interval = interval;
      candle.timestamp = BigInt.fromI32(candleTimestamp);
      candle.open = price;
      candle.high = price;
      candle.low = price;
      candle.close = price;
      candle.volume = volume;
    } else {
      if (price > candle.high) {
        candle.high = price;
      }
      if (price < candle.low) {
        candle.low = price;
      }
      candle.close = price;
      candle.volume = candle.volume.plus(volume);
    }

    candle.save();
  }
}

// -----------------------------------------------------------------------------
// Event Handlers
// -----------------------------------------------------------------------------

export function handleTokenLaunched(event: TokenLaunchedEvent): void {
  let launchpadId = event.address.toHex();
  let launchpad = getOrCreateLaunchpad(launchpadId);

  let wrapperId = event.params.wrapper.toHex();
  let wrapper = new WrapperToken(wrapperId);

  wrapper.launchpad = launchpadId;
  wrapper.rt = event.params.rt;
  wrapper.creator = event.params.creator;
  wrapper.launchTime = event.params.launchTime;
  wrapper.totalLocked = event.params.amount;
  wrapper.dexReserve = BigInt.zero();      // can be enriched via calls if needed
  wrapper.initialCurveSupply = BigInt.zero();
  wrapper.totalRoyaltiesHarvested = BigInt.zero();
  wrapper.graduated = false;
  wrapper.poolAddress = null;
  wrapper.createdAt = event.block.timestamp;
  wrapper.updatedAt = event.block.timestamp;

  wrapper.save();

  // Start indexing ERC20 transfers for this wrapper to track holders
  WrapperTemplate.create(event.params.wrapper);

  launchpad.totalTokens += 1;
  launchpad.save();
}

export function handleTokensPurchased(event: TokensPurchasedEvent): void {
  let launchpadId = event.address.toHex();
  let launchpad = getOrCreateLaunchpad(launchpadId);

  let wrapper = getOrCreateWrapper(launchpadId, event.params.wrapperToken);
  wrapper.updatedAt = event.block.timestamp;
  wrapper.save();

  let user = getOrCreateUser(event.params.buyer.toHex());

  let tradeId = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let trade = new Trade(tradeId);
  trade.wrapper = wrapper.id;
  trade.user = user.id;
  trade.type = "BUY";
  trade.amount = event.params.amount;
  trade.value = event.params.cost;
  // Approximate fee: 1% of base cost (TOTAL_FEE_BPS = 100)
  trade.fee = event.params.cost.div(BigInt.fromI32(100));
  trade.txHash = event.transaction.hash;
  trade.timestamp = event.block.timestamp;
  trade.save();

  let grossValue = event.params.cost.plus(
    event.params.cost.div(BigInt.fromI32(100)),
  );
  let price = BigInt.zero();
  if (!event.params.amount.equals(BigInt.zero())) {
    price = grossValue.div(event.params.amount);
  }
  updateCandle(event.params.wrapperToken, event.block.timestamp, price, grossValue);

  launchpad.totalTrades += 1;
  launchpad.totalVolume = launchpad.totalVolume.plus(event.params.cost);
  launchpad.totalFees = launchpad.totalFees.plus(trade.fee);
  launchpad.save();
}

export function handleTokensSold(event: TokensSoldEvent): void {
  let launchpadId = event.address.toHex();
  let launchpad = getOrCreateLaunchpad(launchpadId);

  let wrapper = getOrCreateWrapper(launchpadId, event.params.wrapperToken);
  wrapper.updatedAt = event.block.timestamp;
  wrapper.save();

  let user = getOrCreateUser(event.params.seller.toHex());

  let tradeId = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let trade = new Trade(tradeId);
  trade.wrapper = wrapper.id;
  trade.user = user.id;
  trade.type = "SELL";
  trade.amount = event.params.amount;
  trade.value = event.params.proceeds;
  trade.fee = event.params.proceeds.div(BigInt.fromI32(100));
  trade.txHash = event.transaction.hash;
  trade.timestamp = event.block.timestamp;
  trade.save();

  let grossProceeds = event.params.proceeds.plus(
    event.params.proceeds.div(BigInt.fromI32(100)),
  );
  let price = BigInt.zero();
  if (!event.params.amount.equals(BigInt.zero())) {
    price = grossProceeds.div(event.params.amount);
  }
  updateCandle(event.params.wrapperToken, event.block.timestamp, price, grossProceeds);

  launchpad.totalTrades += 1;
  launchpad.totalVolume = launchpad.totalVolume.plus(event.params.proceeds);
  launchpad.totalFees = launchpad.totalFees.plus(trade.fee);
  launchpad.save();
}

export function handleRoyaltiesHarvested(event: RoyaltiesHarvestedEvent): void {
  let launchpadId = event.address.toHex();
  let launchpad = getOrCreateLaunchpad(launchpadId);

  let wrapper = getOrCreateWrapper(launchpadId, event.params.wrapperToken);
  wrapper.totalRoyaltiesHarvested = wrapper.totalRoyaltiesHarvested.plus(
    event.params.amount,
  );
  wrapper.updatedAt = event.block.timestamp;
  wrapper.save();

  let harvestId = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let harvest = new Harvest(harvestId);
  harvest.wrapper = wrapper.id;
  harvest.amount = event.params.amount;
  harvest.txHash = event.transaction.hash;
  harvest.timestamp = event.block.timestamp;
  harvest.save();

  launchpad.save();
}

export function handleGraduated(event: GraduatedEvent): void {
  let launchpadId = event.address.toHex();
  let launchpad = getOrCreateLaunchpad(launchpadId);

  let wrapper = getOrCreateWrapper(launchpadId, event.params.wrapperToken);
  wrapper.graduated = true;
  wrapper.poolAddress = event.params.poolAddress;
  wrapper.updatedAt = event.block.timestamp;
  wrapper.save();

  let gradId = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let grad = new GraduationEvent(gradId);
  grad.wrapper = wrapper.id;
  grad.liquidity = event.params.liquidity;
  grad.poolAddress = event.params.poolAddress;
  grad.txHash = event.transaction.hash;
  grad.timestamp = event.block.timestamp;
  grad.save();

  launchpad.save();
}

export function handleRTDeposited(event: RTDepositedEvent): void {
  let user = getOrCreateUser(event.params.user.toHex());
  let depositId = event.params.user
    .toHex()
    .concat("-")
    .concat(event.params.rtToken.toHex());

  let deposit = Deposit.load(depositId);
  if (deposit == null) {
    deposit = new Deposit(depositId);
    deposit.user = user.id;
    deposit.rt = event.params.rtToken;
    deposit.amount = BigInt.zero();
    deposit.createdAt = event.block.timestamp;
    deposit.updatedAt = event.block.timestamp;
  }

  deposit.amount = deposit.amount.plus(event.params.amount);
  deposit.updatedAt = event.block.timestamp;
  deposit.save();
}

export function handleRTWithdrawn(event: RTWithdrawnEvent): void {
  let user = getOrCreateUser(event.params.user.toHex());
  let depositId = event.params.user
    .toHex()
    .concat("-")
    .concat(event.params.rtToken.toHex());

  let deposit = Deposit.load(depositId);
  if (deposit == null) {
    // If withdraw comes before any deposit tracked by subgraph (unlikely),
    // initialize and then subtract.
    deposit = new Deposit(depositId);
    deposit.user = user.id;
    deposit.rt = event.params.rtToken;
    deposit.amount = BigInt.zero();
    deposit.createdAt = event.block.timestamp;
  }

  deposit.amount = deposit.amount.minus(event.params.amount);
  deposit.updatedAt = event.block.timestamp;
  deposit.save();
}

export function handleCreatorPremineClaimed(
  event: CreatorPremineClaimedEvent,
): void {
  let launchpadId = event.address.toHex();
  let wrapper = getOrCreateWrapper(launchpadId, event.params.wrapperToken);
  wrapper.updatedAt = event.block.timestamp;
  wrapper.save();

  let id = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let claim = new PremineClaim(id);
  claim.wrapper = wrapper.id;
  claim.creator = event.params.creator;
  claim.amount = event.params.amount;
  claim.txHash = event.transaction.hash;
  claim.timestamp = event.block.timestamp;
  claim.save();
}

export function handleGraduationThresholdUpdated(
  event: GraduationThresholdUpdatedEvent,
): void {
  let launchpadId = event.address.toHex();
  let launchpad = getOrCreateLaunchpad(launchpadId);
  launchpad.save();

  let id = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let update = new GraduationThresholdUpdate(id);
  update.launchpad = launchpadId;
  update.newThreshold = event.params.newThreshold;
  update.txHash = event.transaction.hash;
  update.timestamp = event.block.timestamp;
  update.save();
}

